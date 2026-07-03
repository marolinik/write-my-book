import { summarizeBook } from "./summarize-book";
import type { ChapterRollup, Shelf, ShelfBookInput, ShelfGroups } from "./types";

export interface GroupBooksArgs {
  books: ShelfBookInput[];
  rollups: Map<string, ChapterRollup>;
  lastChapters: Map<string, { id: string; chapterNumber: number }>;
  now: Date;
}

const EMPTY_ROLLUP: ChapterRollup = { drafted: 0, analyzed: 0 };

/** Classifies + summarizes every book into its shelf, each sorted updatedAt desc. */
export function groupBooks({ books, rollups, lastChapters, now }: GroupBooksArgs): ShelfGroups {
  const groups: ShelfGroups = {
    currentlyWriting: [],
    waiting: [],
    completed: [],
    archived: [],
  };
  for (const book of books) {
    const view = summarizeBook(
      book,
      rollups.get(book.id) ?? EMPTY_ROLLUP,
      lastChapters.get(book.id) ?? null,
      now,
    );
    groups[view.shelf].push(view);
  }
  for (const key of Object.keys(groups) as Shelf[]) {
    groups[key].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  return groups;
}
