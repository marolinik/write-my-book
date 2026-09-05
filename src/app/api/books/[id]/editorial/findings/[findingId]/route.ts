import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateFindingSchema } from "@/lib/validation";
import { DocumentService, VersionConflictError } from "@/lib/documents";
import { DocumentType } from "@/generated/prisma/enums";
import { inferPreferenceFromDismissals, upsertConversationConstraint } from "@/lib/agents/writer-memory";
import { selectLatestConstraint } from "@/lib/editorial/finding-conversation";
import { isDestructiveReplacement } from "@/lib/editorial/finding-applicability";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string; findingId: string }> };

/**
 * Normalize whitespace for fuzzy matching: collapse runs of whitespace to single spaces,
 * normalize smart quotes to straight quotes, and trim.
 */
function normalizeForMatch(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Try to find `originalText` in `content`. Returns the start index and actual matched
 * text (which may differ in whitespace from the search text).
 * First tries exact match, then falls back to normalized whitespace matching.
 */

interface FindingAlternative {
  label?: string;
  originalText?: string;
  newText?: string;
}

function parseFindingAlternatives(value: string | null): FindingAlternative[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findOriginalText(
  content: string,
  originalText: string
): { index: number; matchedText: string } | null {
  // Exact match
  const exactIndex = content.indexOf(originalText);
  if (exactIndex !== -1) {
    return { index: exactIndex, matchedText: originalText };
  }

  // Fuzzy match: normalize whitespace and quotes
  const normalizedSearch = normalizeForMatch(originalText);
  const normalizedContent = normalizeForMatch(content);
  const fuzzyIndex = normalizedContent.indexOf(normalizedSearch);
  if (fuzzyIndex === -1) return null;

  // Map back to original content position by counting characters
  // Walk through original content to find the span matching the normalized range
  let origPos = 0;
  let normPos = 0;
  let startPos = -1;

  while (origPos < content.length && normPos <= fuzzyIndex + normalizedSearch.length) {
    if (normPos === fuzzyIndex) {
      startPos = origPos;
    }
    if (normPos === fuzzyIndex + normalizedSearch.length) {
      return { index: startPos, matchedText: content.substring(startPos, origPos) };
    }

    const ch = content[origPos];
    // Skip extra whitespace in original that was collapsed
    if (/\s/.test(ch)) {
      // Consume all whitespace in original
      while (origPos < content.length && /\s/.test(content[origPos])) {
        origPos++;
      }
      normPos++; // One space in normalized
    } else {
      origPos++;
      normPos++;
    }
  }

  // Handle end-of-string case
  if (startPos !== -1 && normPos >= fuzzyIndex + normalizedSearch.length) {
    return { index: startPos, matchedText: content.substring(startPos, origPos) };
  }

  return null;
}

/** Replace U+FFFD replacement characters with em dash (mirrors chapter-content GET/PUT). */
function sanitizeUnicode(text: string): string {
  return text.replace(/\uFFFD/g, "\u2014");
}

/** PATCH /api/books/:id/editorial/findings/:findingId — Apply or dismiss a finding. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, findingId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const finding = await db.editFinding.findFirst({
      where: { id: findingId, bookId },
    });
    if (!finding) {
      return NextResponse.json(
        { error: "Finding not found" },
        { status: 404 }
      );
    }

    const body = await parseJsonBody(req);
    const data = updateFindingSchema.parse(body);

    const alternatives = parseFindingAlternatives(finding.alternatives);
    const selectedAlternative =
      data.alternativeIndex !== undefined ? alternatives[data.alternativeIndex] : undefined;
    const originalText = selectedAlternative?.originalText ?? finding.originalText;
    const newText = selectedAlternative?.newText ?? finding.newText;
    const finalNewText = data.overrideText ?? newText;

    // D-41a: refuse a destructive apply. When a passage is named (originalText
    // present) but the resolved replacement is blank (empty/whitespace), applying
    // it would delete the writer's prose. Never do that silently — answer an
    // honest 422 so the writer can dismiss it or Discuss it into a real revision.
    if (data.action === "apply" && isDestructiveReplacement(originalText, finalNewText)) {
      return NextResponse.json(
        {
          error:
            "This finding has no replacement text, so applying it would delete the passage it points to. Dismiss it, or use Discuss to work out a concrete revision.",
        },
        { status: 422 }
      );
    }

    // Auto-apply: if applying a finding with originalText + newText, edit the chapter
    if (data.action === "apply" && originalText && finalNewText) {
      const docService = new DocumentService(user.id, bookId);
      const doc = await docService.findByType(
        DocumentType.CHAPTER_CONTENT,
        finding.chapterNumber
      );

      if (!doc) {
        return NextResponse.json(
          {
            error: `No content found for chapter ${finding.chapterNumber}`,
          },
          { status: 404 }
        );
      }

      const result = await docService.read(doc.id);
      if (!result) {
        return NextResponse.json(
          { error: "Failed to read chapter content" },
          { status: 500 }
        );
      }

      const match = findOriginalText(result.content, originalText);
      if (!match) {
        return NextResponse.json(
          {
            error:
              "Original text not found in chapter — may have been edited since the finding was created",
          },
          { status: 409 }
        );
      }

      // Replace the matched text with newText, optimistically locked on the
      // version that was just read. Finding A/B: apply must NOT clobber a
      // concurrent writer — the chapter-content PUT already requires a CAS
      // stamp for interactive saves, and an unsupervised finding apply is the
      // same destructive overwrite. Passing the read's currentVersion means a
      // stale apply rejects with VersionConflictError instead of silently
      // last-writing-the-win over the author's newer edit.
      const updatedContent =
        result.content.substring(0, match.index) +
        finalNewText +
        result.content.substring(match.index + match.matchedText.length);
      const expectedVersion = result.document.currentVersion;

      // Save updated content as a new version. On a rejected CAS, nothing is
      // written — answer the same honest version_conflict envelope the
      // chapter-content route returns so the writer can resolve (never a
      // silent clobber).
      let savedVersion: number;
      try {
        const saved = await docService.update(
          doc.id,
          updatedContent,
          undefined,
          "revision",
          `finding:${findingId}`,
          expectedVersion
        );
        savedVersion = saved.version.version;
      } catch (error) {
        if (error instanceof VersionConflictError) {
          // The server content moved past what this finding was applied to.
          // Re-read so the client gets the CURRENT passage to reconcile against
          // (same sanitization the chapter-content conflict path uses).
          const current = await docService.readPinned(doc.id);
          return NextResponse.json(
            {
              error: "version_conflict",
              currentVersion:
                current?.document.currentVersion ?? expectedVersion,
              serverContent: sanitizeUnicode(current?.content ?? ""),
            },
            { status: 409 }
          );
        }
        throw error;
      }

      // Update finding status in the SAME row, recording the EXACT applied
      // location (String indexes) + the document version this apply created,
      // so a later undo can reverse that precise spot instead of re-searching
      // the whole doc for the first lookalike of newText.
      // NOTE: we deliberately do NOT also set contentHash here. contentHash
      // participates in the @@unique([bookId, chapterNumber, contentHash])
      // dedup index; two findings applied to byte-identical before-content on
      // the same book+chapter would collide (P2002 500). locationStart/
      // locationEnd/chapterVersion carry everything undo needs.
      const updated = await db.editFinding.update({
        where: { id: findingId },
        data: {
          status: "applied",
          appliedAt: new Date(),
          locationStart: String(match.index),
          locationEnd: String(match.index + match.matchedText.length),
          chapterVersion: savedVersion,
        },
      });

      // Log the edit action with both old and new text
      await db.editAction.create({
        data: {
          bookId,
          chapterNumber: finding.chapterNumber,
          actionType: "apply",
          findingId,
          description: `Auto-applied finding: ${finding.category} — replaced "${originalText.substring(0, 80)}${originalText.length > 80 ? "..." : ""}"`,
        },
      });

      return NextResponse.json(updated);
    }

    // Standard apply (advice-only) or dismiss.
    // D-55: a writer DISMISSAL records dismiss-intent only (status "dismissed" +
    // dismissReason) and must NOT stamp `rejectedAt` — that is the system REJECT
    // timestamp, and conflating the two corrupts dismiss-vs-reject analytics.
    // <finding_history> derives its [dismissed] label from `status` (see
    // findingHistoryStatus), so dropping the timestamp does not regress prompts.
    const updateData: Record<string, unknown> =
      data.action === "apply"
        ? { status: "applied", appliedAt: new Date() }
        : {
            status: "dismissed",
            dismissReason: data.reason ?? null,
          };

    const updated = await db.editFinding.update({
      where: { id: findingId },
      data: updateData,
    });

    await db.editAction.create({
      data: {
        bookId,
        chapterNumber: finding.chapterNumber,
        actionType: data.action,
        findingId,
        description:
          data.action === "apply"
            ? `Applied finding: ${finding.category}`
            : `Dismissed finding: ${finding.category}${data.reason ? ` — ${data.reason}` : ""}`,
      },
    });

    // Repeated dismissals of a category teach the agents to back off.
    // Runs after the update so the count includes this finding.
    if (data.action === "dismiss") {
      try {
        await inferPreferenceFromDismissals(
          user.id,
          bookId,
          finding.category,
          finding.description
        );
      } catch (e) {
        console.error("[Feedback] dismissal inference failed:", e);
      }

      // Conversational learning: if the thread carries a constraint, persist it
      // (book-scoped).
      //
      // D-170: read EVERY assistant turn, oldest-first, and select through the
      // same shared helper the chip uses. Re-parsing only the newest reply broke
      // the promise the UI had already made: on a thread where the writer asked
      // for a rewrite AFTER the editor offered to remember something (REMEMBER
      // on turn 1, REVISION-only on turn 3) the chip said *On "Keep as-is", I'll
      // remember: …* and dismiss silently persisted nothing.
      try {
        const assistantReplies = await db.findingReply.findMany({
          where: { findingId, role: "assistant" },
          orderBy: { createdAt: "asc" },
          select: { content: true },
        });
        if (assistantReplies.length > 0) {
          const suggestedConstraint = selectLatestConstraint(
            assistantReplies.map((r) => ({ role: "assistant" as const, content: r.content }))
          );
          if (suggestedConstraint) {
            await upsertConversationConstraint({
              userId: user.id,
              bookId, // finding's book — server-derived
              findingId,
              category: suggestedConstraint.category,
              content: suggestedConstraint.content,
            });
            await db.suggestionFeedback.upsert({
              where: { userId_suggestionId: { userId: user.id, suggestionId: findingId } },
              create: {
                bookId, userId: user.id, suggestionId: findingId,
                suggestionType: finding.category, positive: false, suggestionText: finding.description,
              },
              update: { positive: false },
            });
          }
        }
      } catch (e) {
        console.error("[Discuss] constraint resolution failed:", e);
      }
    }

    // SIM-08: an advice-only apply (no originalText/newText — nothing to
    // replace in the chapter) previously answered the bare updated row while
    // the document stayed untouched, reading as a silent no-op. Say so plainly.
    const adviceOnlyApply =
      data.action === "apply" && !originalText && !finalNewText;

    return NextResponse.json(
      adviceOnlyApply
        ? { ...updated, note: "Advice-only finding — accepted; no chapter text was changed." }
        : updated
    );
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error(
      "PATCH /api/books/:id/editorial/findings/:findingId error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update finding" },
      { status: 500 }
    );
  }
}
