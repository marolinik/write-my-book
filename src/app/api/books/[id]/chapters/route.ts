import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createChapterSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id/chapters — list chapters for a book. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const chapters = await db.chapter.findMany({
      where: { bookId },
      orderBy: { chapterNumber: "asc" },
    });

    return NextResponse.json(chapters);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/chapters error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chapters" },
      { status: 500 }
    );
  }
}

/** POST /api/books/:id/chapters — create a new chapter. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await parseJsonBody(req);
    const data = createChapterSchema.parse(body);

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const chapter = await db.chapter.create({
      data: {
        bookId,
        actNumber: data.actNumber,
        chapterNumber: data.chapterNumber,
        title: data.title ?? null,
      },
    });

    // Update book chapter count
    await db.book.update({
      where: { id: bookId },
      data: { chapterCount: { increment: 1 } },
    });

    return NextResponse.json(chapter, { status: 201 });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: error }, { status: 400 });
    }
    console.error("POST /api/books/:id/chapters error:", error);
    return NextResponse.json(
      { error: "Failed to create chapter" },
      { status: 500 }
    );
  }
}
