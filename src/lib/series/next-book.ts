// src/lib/series/next-book.ts
//
// UDG round-3 (Filip + Olivera): a lightweight, dependency-free rule for "what's
// the next book to start in my series, and what's the per-book finishing state?"
// Purely Book/Series-field driven — never loads chapter rows (rows are the
// dashboard/hub's cheap path).
//
// Semantics reuses the app's own completion definition (src/lib/shelf/assign-shelf.ts).

/** Book.status values that mean "this volume is finished." */
export const FINISHED_BOOK_STATUSES: ReadonlySet<string> = new Set([
  "complete",
  "export",
]);

export interface SeriesBookLite {
  id: string;
  bookNumber: number;
  status: string;
}

export interface SeriesNextBook {
  /** The next volume number a writer should work on, or null if all planned are done. */
  nextBookNumber: number | null;
  /** Count of finished (complete/export) volumes. */
  finishedCount: number;
  /** Count of in-progress (started but not finished) volumes. */
  inProgressCount: number;
}

export function isBookFinished(status: string): boolean {
  return FINISHED_BOOK_STATUSES.has(status);
}

/**
 * Determine the next volume number to start within a series.
 *
 * Rule: sort books by bookNumber ascending. A volume is "next" if every lower
 * numbered volume is finished; the first such volume is the next to start. If
 * all existing volumes are finished, the next slot is `existing.length + 1`
 * (the next expected number), capped conceptually by `plannedBooks` — the hub
 * card shows the raw next number; the caller can cap display by plannedBooks.
 */
export function computeSeriesNextBook(
  books: readonly SeriesBookLite[]
): SeriesNextBook {
  const sorted = [...books].sort((a, b) => a.bookNumber - b.bookNumber);
  let finishedCount = 0;
  let inProgressCount = 0;

  for (const b of sorted) {
    if (isBookFinished(b.status)) finishedCount++;
    else inProgressCount++;
  }

  // Walk ascending; the first volume that is NOT finished is the next to start.
  for (const b of sorted) {
    if (!isBookFinished(b.status)) {
      return {
        nextBookNumber: b.bookNumber,
        finishedCount,
        inProgressCount,
      };
    }
  }

  // All finished — next slot is the next number after the highest existing.
  const maxNumber =
    sorted.length > 0 ? sorted[sorted.length - 1].bookNumber : 0;
  return {
    nextBookNumber: maxNumber + 1,
    finishedCount,
    inProgressCount,
  };
}

/** Per-volume row for the hub's continuation-deltas list. */
export interface BookContinuationRow {
  id: string;
  bookNumber: number;
  status: string;
  wordCount: number;
}