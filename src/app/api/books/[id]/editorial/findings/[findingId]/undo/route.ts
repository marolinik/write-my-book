import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DocumentService, VersionConflictError } from "@/lib/documents";
import { DocumentType } from "@/generated/prisma/enums";

type RouteParams = { params: Promise<{ id: string; findingId: string }> };

/** Replace U+FFFD replacement characters with em dash (mirrors chapter-content GET/PUT). */
function sanitizeUnicode(text: string): string {
  return text.replace(/\uFFFD/g, "\u2014");
}

/**
 * How many times does `needle` occur in `content`?
 */
function countOccurrences(content: string, needle: string): number {
  if (!needle) return 0;
  return content.split(needle).length - 1;
}

/** POST /api/books/:id/editorial/findings/:findingId/undo — Revert finding to pending. */
export async function POST(req: NextRequest, { params }: RouteParams) {
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

    if (finding.status === "pending") {
      return NextResponse.json(
        { error: "Finding is already pending" },
        { status: 400 }
      );
    }

    // Which action to describe once we know whether text was actually reverted.
    let textReverted = false;
    // Note surfaced to the caller only when we deliberately left the chapter
    // untouched (text edited further / ambiguous match / pre-fix finding).
    let note: string | undefined;

    // Reverse auto-applied text changes if the finding was applied with patches
    if (
      finding.status === "applied" &&
      finding.originalText &&
      finding.newText
    ) {
      const docService = new DocumentService(user.id, bookId);
      const doc = await docService.findByType(
        DocumentType.CHAPTER_CONTENT,
        finding.chapterNumber
      );

      if (doc) {
        const result = await docService.read(doc.id);
        if (result) {
          const currentVersion = result.document.currentVersion;
          const content = result.content;
          const newText = finding.newText;
          const originalText = finding.originalText;

          // Decide whether and where to reverse. Prefer the EXACT spot this
          // apply touched — a later undo must never re-search the whole doc
          // and grab an unrelated earlier occurrence of the same newText.
          const storedLocation = finding.locationStart
            ? parseInt(finding.locationStart, 10)
            : NaN;
          let reversedContent: string | undefined;
          let expectedVersion: number | undefined;

          if (Number.isInteger(storedLocation)) {
            // Exact-location reversal: the text at the recorded span must STILL
            // be exactly what we inserted, or the chapter was edited further
            // there and we must not reverse a lookalike.
            const atSpot = content.substring(
              storedLocation,
              storedLocation + newText.length
            );
            if (atSpot !== newText) {
              // The chapter changed at that exact spot since apply — leave the
              // text as-is, only reset the finding status (and tell the caller).
              note =
                "The passage this finding changed has been edited further since it was applied, so the text was left as-is; the finding was reset to pending.";
            } else {
              reversedContent =
                content.substring(0, storedLocation) +
                originalText +
                content.substring(storedLocation + newText.length);
              // Optimistically lock the reversal against the version just read;
              // a concurrent writer between read and write must reject, not
              // clobber.
              expectedVersion = currentVersion;
            }
          } else {
            // Finding applied BEFORE the location fix: no recorded location.
            // Fall back to the legacy indexOf reversal ONLY when the search is
            // unambiguous — newText must occur EXACTLY once. Zero or multiple
            // matches mean we cannot infer which one apply touched, so we never
            // guess (a multi-match would be an ambiguous reversal).
            const occurrences = countOccurrences(content, newText);
            if (occurrences !== 1) {
              note =
                occurrences === 0
                  ? "The change this finding applied is no longer present in the chapter; the finding was reset to pending."
                  : "The text this finding applied appears more than once and its exact location was not recorded, so it could not be safely reverted; the finding was reset to pending.";
            } else {
              const index = content.indexOf(newText);
              reversedContent =
                content.substring(0, index) +
                originalText +
                content.substring(index + newText.length);
              expectedVersion = currentVersion;
            }
          }

          if (reversedContent !== undefined) {
            try {
              await docService.update(
                doc.id,
                reversedContent,
                undefined,
                "revision",
                `undo-finding:${findingId}`,
                expectedVersion
              );
              textReverted = true;
            } catch (error) {
              if (error instanceof VersionConflictError) {
                // A concurrent writer moved the document past the version this
                // undo read — nothing was reversed and the finding was NOT reset
                // (its state describes an apply the server can no longer verify).
                // Answer the same version_conflict envelope the apply path uses.
                const current = await docService.readPinned(doc.id);
                return NextResponse.json(
                  {
                    error: "version_conflict",
                    currentVersion:
                      current?.document.currentVersion ?? currentVersion,
                    serverContent: sanitizeUnicode(current?.content ?? ""),
                  },
                  { status: 409 }
                );
              }
              throw error;
            }
          }
        }
      }
    }

    const updated = await db.editFinding.update({
      where: { id: findingId },
      data: {
        status: "pending",
        appliedAt: null,
        rejectedAt: null,
        dismissReason: null,
      },
    });

    await db.editAction.create({
      data: {
        bookId,
        chapterNumber: finding.chapterNumber,
        actionType: "undo",
        findingId,
        description: `Undid ${finding.status} action on finding: ${finding.category}${textReverted ? " (text reverted)" : ""}`,
      },
    });

    return NextResponse.json(note ? { ...updated, note } : updated);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "POST /api/books/:id/editorial/findings/:findingId/undo error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to undo finding" },
      { status: 500 }
    );
  }
}