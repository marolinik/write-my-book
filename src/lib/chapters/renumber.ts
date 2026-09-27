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
  // One list from here down: parking and assignment must see the same chapters.
  order = withUnnamedChapters(order, allChapters ?? []);

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
 * The caller's ordering followed by every chapter it did not name, which keep
 * their relative order and land after the named ones (see buildRenumberOps).
 */
function withUnnamedChapters(
  order: readonly OrderingEntry[],
  allChapters: ReadonlyArray<{ id: string; chapterNumber: number }>
): OrderingEntry[] {
  const named = new Set(order.map((o) => o.chapterId));
  const unnamed = allChapters
    .filter((c) => !named.has(c.id))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const lastNamed = order.reduce((max, o) => Math.max(max, o.chapterNumber), 0);
  const appended: OrderingEntry[] = unnamed.map((c, i) => ({
    chapterId: c.id,
    chapterNumber: lastNamed + 1 + i,
  }));

  return [...order, ...appended];
}

/** What a set-based renumber needs from a client: the chapter list and raw SQL. */
export type RenumberClient = Pick<Prisma.TransactionClient, "chapter" | "$executeRaw">;

/**
 * Transaction options for anything that renumbers. Prisma's default interactive
 * timeout is 5 s; a structural move on a long book must not be cut off halfway
 * by a slow database (P6-S10). The renumber itself is four statements, so this
 * is headroom, not the expected cost.
 */
export const RENUMBER_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * Renumber a book's chapters on the caller's transaction, in four set-based
 * statements whatever the book's length.
 *
 * P6-S10: the op-per-row version is four round trips PER CHAPTER. A merge on a
 * 400-chapter book spent more than Prisma's 5 s transaction budget in the
 * renumber alone, and because the merge had already deleted the absorbed
 * chapter outside it, the book was left with a gap in its numbering and no
 * undo. Taking the client as a parameter is what lets a structural move run its
 * deletes, this renumber and its own status change as ONE transaction.
 *
 * Same two phases as buildRenumberOps — every chapter of the book (named or
 * not) and its documents are parked at TEMP_OFFSET + i before any final number
 * is assigned, because Postgres checks a non-deferrable unique index row by row
 * inside a single UPDATE.
 */
export async function renumberChaptersWith(
  client: RenumberClient,
  bookId: string,
  order: readonly OrderingEntry[]
): Promise<void> {
  if (order.length === 0) return;

  // The WHOLE book, not just the named chapters: anything left unparked is a
  // collision waiting to happen (see buildRenumberOps).
  const chapters = await client.chapter.findMany({
    where: { bookId },
    select: { id: true, chapterNumber: true },
  });
  const oldNumberById = new Map(chapters.map((c) => [c.id, c.chapterNumber]));

  // A named chapter the book no longer has would silently leave a hole where
  // its target number was. Fail instead, and the transaction takes nothing.
  const missing = order.find((o) => !oldNumberById.has(o.chapterId));
  if (missing) {
    throw new Error(`Chapter ${missing.chapterId} is not in this book any more.`);
  }

  const full = withUnnamedChapters(order, chapters);
  const ids = full.map((o) => o.chapterId);
  const oldNumbers = full.map((o) => oldNumberById.get(o.chapterId) as number);
  const parked = full.map((_, i) => TEMP_OFFSET + i);
  const targets = full.map((o) => o.chapterNumber);

  // Phase A — chapters, then their documents (old number → parked).
  await client.$executeRaw`
    UPDATE chapters AS c SET chapter_number = v.parked
    FROM unnest(${ids}::text[], ${parked}::int[]) AS v(id, parked)
    WHERE c.id = v.id AND c.book_id = ${bookId}`;
  await client.$executeRaw`
    UPDATE documents AS d SET chapter_number = v.parked
    FROM unnest(${oldNumbers}::int[], ${parked}::int[]) AS v(old_number, parked)
    WHERE d.book_id = ${bookId} AND d.chapter_number = v.old_number`;

  // Phase B — chapters, then their documents (parked → final). storageKey is
  // never touched: it is the physical pointer to the bytes. `updated_at` moves
  // as it did when each row went through Prisma's update, which stamps
  // @updatedAt itself — in UTC, as Prisma stores every timestamp.
  await client.$executeRaw`
    UPDATE chapters AS c SET chapter_number = v.target, updated_at = (now() AT TIME ZONE 'UTC')
    FROM unnest(${ids}::text[], ${targets}::int[]) AS v(id, target)
    WHERE c.id = v.id AND c.book_id = ${bookId}`;
  await client.$executeRaw`
    UPDATE documents AS d SET chapter_number = v.target, updated_at = (now() AT TIME ZONE 'UTC')
    FROM unnest(${parked}::int[], ${targets}::int[]) AS v(parked, target)
    WHERE d.book_id = ${bookId} AND d.chapter_number = v.parked`;
}

/**
 * Renumber a book's chapters in their own transaction. Reads each chapter's
 * current number itself, so callers only supply the target ordering. A caller
 * that passes an empty ordering gets a no-op, not an empty transaction.
 */
export async function renumberChapters(
  bookId: string,
  order: readonly OrderingEntry[]
): Promise<void> {
  if (order.length === 0) return;
  await db.$transaction(
    (tx) => renumberChaptersWith(tx, bookId, order),
    RENUMBER_TX_OPTIONS
  );
}
