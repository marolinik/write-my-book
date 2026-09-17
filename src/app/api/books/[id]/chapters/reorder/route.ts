import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildRenumberOps } from "@/lib/chapters/renumber";
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

    // Every chapterId must belong to this book. Fetch the current numbers so
    // the document renumber can key off each chapter's OLD chapter_number.
    const chapters = await db.chapter.findMany({
      where: { bookId, id: { in: order.map((o) => o.chapterId) } },
      select: { id: true, chapterNumber: true },
    });
    if (chapters.length !== order.length) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    const oldNumberById = new Map(
      chapters.map((c) => [c.id, c.chapterNumber])
    );

    await db.$transaction(buildRenumberOps(bookId, order, oldNumberById));

    return NextResponse.json({ reordered: order.length });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
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
