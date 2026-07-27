import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createChapterSchema } from "@/lib/validation";
import { reconcileBookCounters } from "@/lib/books/book-counters";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

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

    // D-194: store the AUTHORITATIVE count, not a blind +1. A blind delta
    // silently preserves any pre-existing drift (books created before the
    // placeholder-Chapter-1 fix start at 0 with one real chapter), while a
    // recount converges the denormalised column on every create. D-200 folds
    // the word total into the same recount, so a book carrying stale words
    // from a deleted chapter converges here too.
    await reconcileBookCounters(bookId);

    return NextResponse.json(chapter, { status: 201 });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    // D-20: a duplicate chapterNumber (e.g. the auto-created placeholder
    // Chapter 1) trips the @@unique([bookId, chapterNumber]) constraint, which
    // Prisma raises as P2002. That is a client/conflict condition, not a server
    // fault — return a clean 409, not a raw 500.
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "A chapter with that number already exists in this book" },
        { status: 409 }
      );
    }
    console.error("POST /api/books/:id/chapters error:", error);
    return NextResponse.json(
      { error: "Failed to create chapter" },
      { status: 500 }
    );
  }
}
