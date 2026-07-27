import { db } from "@/lib/db";

export interface BookCounters {
  chapterCount: number;
  wordCount: number;
}

/**
 * Recompute `books.chapter_count` and `books.word_count` from the book's
 * chapter rows and store both.
 *
 * D-194 established the recount for the count: a blind +1/-1 delta silently
 * preserves (or deepens) whatever drift a book already carries, while a
 * recount converges it on every touch. D-200 found `word_count` had never been
 * given the same treatment — its only writer was the delta increment on the
 * chapter-content save, so a deleted chapter's words stayed in the book total
 * forever and the number could only go up.
 *
 * The two counters are read in ONE aggregate and written in ONE update so they
 * can never disagree about which set of chapter rows they describe. Callers
 * that need the reconciled values back (import, stats responses) get them
 * instead of re-querying.
 */
export async function reconcileBookCounters(
  bookId: string
): Promise<BookCounters> {
  const agg = await db.chapter.aggregate({
    where: { bookId },
    _count: { _all: true },
    _sum: { wordCount: true },
  });

  // An empty chapter set aggregates to a NULL sum — that is zero words, not
  // "leave the stored total where it was".
  const counters: BookCounters = {
    chapterCount: agg._count._all,
    wordCount: agg._sum.wordCount ?? 0,
  };

  await db.book.update({ where: { id: bookId }, data: counters });

  return counters;
}
