export type Shelf = "currentlyWriting" | "waiting" | "completed" | "archived";

/** A book row plus the two derived signals the classifier needs. */
export interface ShelfBookInput {
  id: string;
  name: string;
  genre: string | null;
  status: string; // concept | planning | writing | editing | beta | export | complete
  wordCount: number;
  archivedAt: Date | null;
  updatedAt: Date;
  chapterCount: number; // total chapters (from _count.chapters)
  pendingFindings: number; // count of EditFinding status="pending" (filtered _count)
}

/** Per-book chapter-status tallies derived from chapter.groupBy. */
export interface ChapterRollup {
  drafted: number; // chapters with a draft or beyond
  analyzed: number; // dev_edited | line_edited | beta_read | beta_passed
}

/** One row of chapter.groupBy({ by: ['bookId','status'] }). */
export interface ChapterStatusRow {
  bookId: string;
  status: string;
  count: number;
}

/** The presentational view model for one card. */
export interface ShelfBookView {
  id: string;
  name: string;
  genre: string | null;
  shelf: Shelf;
  words: number;
  chapters: number;
  pendingFindings: number;
  lastTouchedDays: number; // whole days since updatedAt (0 = today)
  drafted: number;
  analyzed: number;
  updatedAt: Date;
  lastChapterId: string | null; // Continue deep-link target; null → fall back to Open
  lastChapterNumber: number | null;
}

export interface ShelfGroups {
  currentlyWriting: ShelfBookView[];
  waiting: ShelfBookView[];
  completed: ShelfBookView[];
  archived: ShelfBookView[];
}
