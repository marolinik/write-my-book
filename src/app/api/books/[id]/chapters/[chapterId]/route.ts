import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateChapterSchema } from "@/lib/validation";
import { deleteChapterChunks } from "@/lib/vector";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string; chapterId: string }> };

/** GET /api/books/:id/chapters/:chapterId */
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
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    return NextResponse.json(chapter);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/chapters/:chapterId error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chapter" },
      { status: 500 }
    );
  }
}

/** PATCH /api/books/:id/chapters/:chapterId */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, chapterId } = await params;
    const body = await parseJsonBody(req);
    const data = updateChapterSchema.parse(body);

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const existing = await db.chapter.findFirst({
      where: { id: chapterId, bookId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    const chapter = await db.chapter.update({
      where: { id: chapterId },
      data,
    });

    return NextResponse.json(chapter);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("PATCH /api/books/:id/chapters/:chapterId error:", error);
    return NextResponse.json(
      { error: "Failed to update chapter" },
      { status: 500 }
    );
  }
}

/** DELETE /api/books/:id/chapters/:chapterId */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, chapterId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const existing = await db.chapter.findFirst({
      where: { id: chapterId, bookId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    // Clean up vector memory for this chapter's content (fire-and-forget)
    deleteChapterChunks(bookId, existing.chapterNumber).catch(() => {});

    await db.chapter.delete({ where: { id: chapterId } });

    await db.book.update({
      where: { id: bookId },
      data: { chapterCount: { decrement: 1 } },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/books/:id/chapters/:chapterId error:", error);
    return NextResponse.json(
      { error: "Failed to delete chapter" },
      { status: 500 }
    );
  }
}
