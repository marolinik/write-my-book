import type { ShelfBookView } from "./types";

/** Human phrase for "how long since this book was last touched". */
export function lastTouched(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * Build the one-line subtitle shown under a Shelf card title.
 *
 * `locale` is a BCP-47 tag (from `localeFor(preferredLanguage)`) so word
 * counts follow the user's language — e.g. Serbian renders 2026 as "2.026",
 * not the server/system locale. Passing a bare number here would leak the
 * host locale (the F6 bug).
 */
export function buildSubtitle(book: ShelfBookView, locale: string): string {
  const words = `${book.words.toLocaleString(locale)} words`;
  switch (book.shelf) {
    case "currentlyWriting":
      return book.chapters > 0
        ? `${words} · drafted ${book.drafted}/${book.chapters} · last touched ${lastTouched(book.lastTouchedDays)}`
        : `${words} · not started · created ${lastTouched(book.lastTouchedDays)}`;
    case "waiting": {
      const notes = `${book.pendingFindings} note${book.pendingFindings === 1 ? "" : "s"} pending`;
      return book.chapters > 0
        ? `${notes} · dev-edit ${book.analyzed}/${book.chapters} chapters`
        : notes;
    }
    case "completed":
      return `Finished · ${words} · ${book.chapters} chapters`;
    case "archived":
      return `Archived · ${words}`;
  }
}
