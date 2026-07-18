import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateFindingSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { inferPreferenceFromDismissals, upsertConversationConstraint } from "@/lib/agents/writer-memory";
import { parseDiscussResponse } from "@/lib/editorial/discuss-prompt";
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

      // Replace the matched text with newText
      const updatedContent =
        result.content.substring(0, match.index) +
        finalNewText +
        result.content.substring(match.index + match.matchedText.length);

      // Save updated content as a new version
      await docService.update(
        doc.id,
        updatedContent,
        undefined,
        "revision",
        `finding:${findingId}`
      );

      // Update finding status
      const updated = await db.editFinding.update({
        where: { id: findingId },
        data: { status: "applied", appliedAt: new Date() },
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

    // Standard apply (advice-only) or dismiss
    // rejectedAt drives <finding_history> status — without it, dismissed
    // findings render as [pending] in agent prompts.
    const updateData: Record<string, unknown> =
      data.action === "apply"
        ? { status: "applied", appliedAt: new Date() }
        : {
            status: "dismissed",
            rejectedAt: new Date(),
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

      // Conversational learning: if the thread's latest assistant turn emitted a constraint, persist it (book-scoped).
      try {
        const lastAssistant = await db.findingReply.findFirst({
          where: { findingId, role: "assistant" },
          orderBy: { createdAt: "desc" },
        });
        if (lastAssistant) {
          const { suggestedConstraint } = parseDiscussResponse(lastAssistant.content);
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

    return NextResponse.json(updated);
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
