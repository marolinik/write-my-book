import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateChapterContentSchema } from "@/lib/validation";
import { DocumentService, VersionConflictError } from "@/lib/documents";
import { DocumentType } from "@/generated/prisma/enums";
import { countWords } from "@/lib/utils";

/** Replace U+FFFD replacement characters with em dash (most common corruption case). */
function sanitizeUnicode(text: string): string {
  return text.replace(/\uFFFD/g, '\u2014');
}

type RouteParams = { params: Promise<{ id: string; chapterId: string }> };

/** GET /api/books/:id/chapters/:chapterId/content — get chapter markdown. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, chapterId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, bookId },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "Chapter not found" },
        { status: 404 }
      );
    }

    const svc = new DocumentService(user.id, bookId);
    const doc = await svc.findByType(
      DocumentType.CHAPTER_CONTENT,
      chapter.chapterNumber
    );

    if (!doc) {
      return NextResponse.json({ markdown: "", wordCount: 0 });
    }

    // readPinned: pair currentVersion with that exact version's snapshot so
    // the client's initial version stamp matches the content it loaded.
    const result = await svc.readPinned(doc.id);

    const rawContent = result?.content ?? "";
    return NextResponse.json({
      markdown: sanitizeUnicode(rawContent),
      wordCount: chapter.wordCount,
      documentId: doc.id,
      version: result?.document.currentVersion ?? doc.currentVersion,
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "GET /api/books/:id/chapters/:chapterId/content error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }
}

/** PUT /api/books/:id/chapters/:chapterId/content — save chapter markdown. */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, chapterId } = await params;
    const body = await req.json();
    const data = updateChapterContentSchema.parse(body);

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, bookId },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "Chapter not found" },
        { status: 404 }
      );
    }

    const svc = new DocumentService(user.id, bookId);
    const existingDoc = await svc.findByType(
      DocumentType.CHAPTER_CONTENT,
      chapter.chapterNumber
    );

    const wordCount = countWords(data.markdown);
    let version: number;

    if (existingDoc) {
      // Update existing document (optimistically locked when the client
      // stamps expectedVersion; legacy bodies stay last-write-wins)
      try {
        const result = await svc.update(
          existingDoc.id,
          data.markdown,
          undefined,
          "manual_edit",
          data.changeSource ?? "user",
          data.expectedVersion
        );
        // Stamp the client with the DocumentVersion row created inside the
        // CAS transaction (always expectedVersion+1 under the lock) — NOT the
        // re-read document.currentVersion, which can already reflect a
        // concurrent unguarded writer and would convert a detectable 409
        // into a silent overwrite on the next stamped save.
        version = result.version.version;
      } catch (error) {
        if (error instanceof VersionConflictError) {
          // CAS rejected — nothing was written. Return the server's current
          // state before any word-count mutation. Sanitize identically to
          // GET so client equality checks are symmetric. readPinned pairs
          // currentVersion with that exact version's snapshot content (the
          // live key may not be written yet by the winning writer).
          const current = await svc.readPinned(existingDoc.id);
          return NextResponse.json(
            {
              error: "version_conflict",
              currentVersion:
                current?.document.currentVersion ??
                existingDoc.currentVersion,
              serverContent: sanitizeUnicode(current?.content ?? ""),
            },
            { status: 409 }
          );
        }
        throw error;
      }
    } else {
      // Create new document
      await svc.create(
        DocumentType.CHAPTER_CONTENT,
        data.markdown,
        chapter.title ?? `Chapter ${chapter.chapterNumber}`,
        chapter.chapterNumber,
        chapter.actNumber,
        data.changeSource ?? "user"
      );
      version = 1;
    }

    // Update chapter and book word counts
    const oldWordCount = chapter.wordCount;
    const wordDelta = wordCount - oldWordCount;

    await db.chapter.update({
      where: { id: chapterId },
      data: { wordCount },
    });

    await db.book.update({
      where: { id: bookId },
      data: { wordCount: { increment: wordDelta } },
    });

    // book.wordCount is the pre-update value (fetched above); wordDelta is this
    // save's change — their sum is the new cumulative total the client needs.
    return NextResponse.json({
      wordCount,
      version,
      bookWordCount: book.wordCount + wordDelta,
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error(
      "PUT /api/books/:id/chapters/:chapterId/content error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to save content" },
      { status: 500 }
    );
  }
}
