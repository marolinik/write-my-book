import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

/**
 * PATCH /api/books/:id/chapters/reorder
 *
 * Atomically renumbers a set of chapters. The corkboard and canvas views both
 * post the full new ordering here instead of firing parallel per-chapter
 * chapterNumber PATCHes (which race the @@unique([bookId, chapterNumber])
 * constraint and fail with P2002).
 *
 * The renumber is TWO-PHASE inside a single transaction to satisfy the unique
 * constraint: phase A parks every chapter at a collision-free temporary number
 * (10000 + array index), phase B assigns the finals. A one-shot "set final"
 * would collide whenever a target number is still held by another chapter mid-swap.
 *
 * Chapter-scoped documents (CHAPTER_CONTENT, briefs, plans, edit reports) are
 * resolved by (bookId, chapter_number) — see DocumentService.findByType — so
 * their `chapter_number` discriminator must follow the renumber or the prose
 * becomes unreachable. It is renumbered with the same two-phase offset. The
 * document `storageKey` (which embeds the padded number from creation time) is
 * deliberately NOT touched: it is the physical content pointer, so leaving it
 * put keeps every version's bytes exactly where they are — only the lookup
 * column moves.
 */

const MAX_CHAPTERS = 999;
const TEMP_OFFSET = 10000;

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

    // Build one transaction: phase A parks everything at a temp number, phase B
    // writes finals — for chapters AND their scoped documents.
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    // Phase A — chapters → temp.
    order.forEach((o, i) => {
      ops.push(
        db.chapter.update({
          where: { id: o.chapterId },
          data: { chapterNumber: TEMP_OFFSET + i },
        })
      );
    });
    // Phase A — documents (old number → temp). storageKey untouched.
    order.forEach((o, i) => {
      ops.push(
        db.document.updateMany({
          where: { bookId, chapterNumber: oldNumberById.get(o.chapterId) },
          data: { chapterNumber: TEMP_OFFSET + i },
        })
      );
    });
    // Phase B — chapters → final.
    order.forEach((o, i) => {
      ops.push(
        db.chapter.update({
          where: { id: o.chapterId },
          data: { chapterNumber: o.chapterNumber },
        })
      );
    });
    // Phase B — documents (temp → final).
    order.forEach((o, i) => {
      ops.push(
        db.document.updateMany({
          where: { bookId, chapterNumber: TEMP_OFFSET + i },
          data: { chapterNumber: o.chapterNumber },
        })
      );
    });

    await db.$transaction(ops);

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
