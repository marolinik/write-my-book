import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Atomic chapter renumbering, shared by the manual reorder endpoint (corkboard,
 * canvas) and the O12 structural-revision engine.
 *
 * The renumber is TWO-PHASE inside a single transaction to satisfy the
 * `@@unique([bookId, chapterNumber])` constraint: phase A parks every chapter at
 * a collision-free temporary number (10000 + array index), phase B assigns the
 * finals. A one-shot "set final" would collide whenever a target number is still
 * held by another chapter mid-swap.
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

export const TEMP_OFFSET = 10000;

export interface OrderingEntry {
  chapterId: string;
  chapterNumber: number;
}

/**
 * Build the ordered transaction ops for a renumber. `oldNumberById` must carry
 * the CURRENT number of every chapter in `order` — the document renumber keys
 * off it.
 *
 * `allChapters` is every chapter the book currently holds. A caller replaying a
 * stored ordering — undo does exactly this — can hand over an `order` that does
 * not mention them all, because the book gained a chapter after the snapshot
 * was taken. Those chapters still have to be parked, or a final number walks
 * into one of them and the transaction dies on the unique index (S3-6). They
 * keep their prose and their relative order, and land after the named ones.
 */
export function buildRenumberOps(
  bookId: string,
  order: readonly OrderingEntry[],
  oldNumberById: ReadonlyMap<string, number>,
  allChapters?: ReadonlyArray<{ id: string; chapterNumber: number }>
): Prisma.PrismaPromise<unknown>[] {
  const named = new Set(order.map((o) => o.chapterId));
  const unnamed = (allChapters ?? [])
    .filter((c) => !named.has(c.id))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const lastNamed = order.reduce((max, o) => Math.max(max, o.chapterNumber), 0);
  const appended: OrderingEntry[] = unnamed.map((c, i) => ({
    chapterId: c.id,
    chapterNumber: lastNamed + 1 + i,
  }));

  // One list from here down: parking and assignment must see the same chapters.
  order = [...order, ...appended];

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
  order.forEach((o) => {
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

  return ops;
}

/**
 * Renumber a book's chapters in one transaction. Reads each chapter's current
 * number itself, so callers only supply the target ordering. A caller that
 * passes an empty ordering gets a no-op, not an empty transaction.
 */
export async function renumberChapters(
  bookId: string,
  order: readonly OrderingEntry[]
): Promise<void> {
  if (order.length === 0) return;

  // The WHOLE book, not just the named chapters: anything left unparked is a
  // collision waiting to happen (see buildRenumberOps).
  const chapters = await db.chapter.findMany({
    where: { bookId },
    select: { id: true, chapterNumber: true },
  });
  const oldNumberById = new Map(chapters.map((c) => [c.id, c.chapterNumber]));

  await db.$transaction(buildRenumberOps(bookId, order, oldNumberById, chapters));
}
