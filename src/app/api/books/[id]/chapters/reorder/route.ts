import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  BookChangedError,
  lockBookChapters,
  renumberChaptersWith,
  RENUMBER_TX_OPTIONS,
} from "@/lib/chapters/renumber";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

/**
 * PATCH /api/books/:id/chapters/reorder
 *
 * Atomically renumbers a set of chapters. The corkboard and canvas views both
 * post the full new ordering here instead of firing parallel per-chapter
 * chapterNumber PATCHes (which race the @@unique([bookId, chapterNumber])
 * constraint and fail with P2002).
 *
 * The two-phase transaction itself lives in @/lib/chapters/renumber, shared with
 * the O12 structural-revision engine — accepting a proposed reorder and dragging
 * a card on the corkboard must renumber chapters and their scoped documents by
 * exactly the same rules.
 *
 * It runs under the book's chapter lock, and every number it acts on is read
 * after the lock is held. The route used to read each chapter's number first
 * and move documents by it inside a separate batch: a move accepted in another
 * tab in between made those numbers stale, and the drag carried one chapter's
 * prose onto another (review of a07a2f2). The ordering must place every chapter
 * the book holds by then; one it does not know about means the view it was
 * dragged in is out of date, and the answer is 409, not a guess at where the
 * stranger goes.
 */

const MAX_CHAPTERS = 999;

const reorderSchema = z.object({
  order: z
    .array(
      z.object({
        chapterId: z.string().uuid(),
        chapterNumber: z.number().int().min(1),
      })
    )
    .min(1)
    .max(MAX_CHAPTERS),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const { order } = reorderSchema.parse(await parseJsonBody(req));

    // Duplicate chapterIds or duplicate target numbers are structurally invalid.
    const uniqueIds = new Set(order.map((o) => o.chapterId));
    const uniqueNumbers = new Set(order.map((o) => o.chapterNumber));
    if (uniqueIds.size !== order.length || uniqueNumbers.size !== order.length) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Ownership fence.
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Every chapterId must belong to this book.
    const chapters = await db.chapter.findMany({
      where: { bookId, id: { in: order.map((o) => o.chapterId) } },
      select: { id: true },
    });
    if (chapters.length !== order.length) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      await lockBookChapters(tx, bookId);
      // Under the lock: the ordering still names exactly the book's chapters.
      const current = await tx.chapter.findMany({
        where: { bookId },
        select: { id: true },
      });
      const named = new Set(order.map((o) => o.chapterId));
      if (current.length !== order.length || current.some((c) => !named.has(c.id))) {
        throw new BookChangedError();
      }
      await renumberChaptersWith(tx, bookId, order);
    }, RENUMBER_TX_OPTIONS);

    return NextResponse.json({ reordered: order.length });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if (error instanceof BookChangedError) {
      return NextResponse.json(
        { error: "The book's chapters changed. Reload and try again.", code: "book_changed" },
        { status: 409 }
      );
    }
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("PATCH /api/books/:id/chapters/reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder chapters" },
      { status: 500 }
    );
  }
}
