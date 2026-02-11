import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateChapterContentSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents";
import { DocumentType } from "@/generated/prisma/enums";
import { countWords } from "@/lib/utils";

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

    const result = await svc.read(doc.id);

    return NextResponse.json({
      markdown: result?.content ?? "",
      wordCount: chapter.wordCount,
      documentId: doc.id,
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

    if (existingDoc) {
      // Update existing document
      await svc.update(
        existingDoc.id,
        data.markdown,
        undefined,
        "manual_edit",
        data.changeSource ?? "user"
      );
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

    return NextResponse.json({ wordCount });
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
