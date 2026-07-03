import { assignShelf } from "./assign-shelf";
import type { ChapterRollup, ShelfBookInput, ShelfBookView } from "./types";

const MS_PER_DAY = 86_400_000;

/** Whole days from `then` to `now`, clamped at 0 (never negative). */
export function daysBetween(now: Date, then: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / MS_PER_DAY));
}

/** Builds the per-card view model from a book row, its rollup, and its latest chapter. */
export function summarizeBook(
  book: ShelfBookInput,
  rollup: ChapterRollup,
  lastChapter: { id: string; chapterNumber: number } | null,
  now: Date,
): ShelfBookView {
  return {
    id: book.id,
    name: book.name,
    genre: book.genre,
    shelf: assignShelf(book),
    words: book.wordCount,
    chapters: book.chapterCount,
    pendingFindings: book.pendingFindings,
    lastTouchedDays: daysBetween(now, book.updatedAt),
    drafted: rollup.drafted,
    analyzed: rollup.analyzed,
    updatedAt: book.updatedAt,
    lastChapterId: lastChapter?.id ?? null,
    lastChapterNumber: lastChapter?.chapterNumber ?? null,
  };
}
