import type { ShelfBookView } from "./types";
import type { UIStrings } from "@/lib/i18n/ui-strings";
import { pluralNoun } from "@/lib/i18n/plural";

/** The subtitle's own words. A subset, so callers need not pass the dictionary. */
export type SubtitleStrings = Pick<
  UIStrings["bookList"],
  | "subWords"
  | "subDrafted"
  | "subNotStarted"
  | "subCreated"
  | "subLastTouched"
  | "subToday"
  | "subYesterday"
  | "subDaysAgo"
  | "subNoteOne"
  | "subNoteMany"
  | "subNotesPending"
  | "subDevEdited"
  | "subFinished"
  | "subArchived"
  | "chapters"
>;

/** Human phrase for "how long since this book was last touched". */
export function lastTouched(days: number, s: SubtitleStrings): string {
  if (days <= 0) return s.subToday;
  if (days === 1) return s.subYesterday;
  return s.subDaysAgo.replace("{n}", String(days));
}

/**
 * Build the one-line subtitle shown under a Shelf card title.
 *
 * `locale` is a BCP-47 tag (from `localeFor(preferredLanguage)`) so word counts
 * follow the user's language — e.g. Serbian renders 2026 as "2.026", not the
 * server/system locale. Passing a bare number here would leak the host locale
 * (the F6 bug).
 *
 * The words themselves were assembled in English — "56.874 words · drafted
 * 31/31 · last touched today" sat under a Serbian title, with the number
 * correctly localised and nothing else (S3-25). They come from the dictionary
 * now; the shape of the line is unchanged.
 */
export function buildSubtitle(
  book: ShelfBookView,
  locale: string,
  s: SubtitleStrings,
  /** UI language, so "1 note" / "3 notes" / "3 napomene" come out right. */
  language?: string
): string {
  const words = `${book.words.toLocaleString(locale)} ${s.subWords}`;
  const touched = lastTouched(book.lastTouchedDays, s);

  const counted = (template: string, a: number, b: number) =>
    template.replace("{a}", String(a)).replace("{b}", String(b));

  switch (book.shelf) {
    case "currentlyWriting":
      return book.chapters > 0
        ? `${words} · ${counted(s.subDrafted, book.drafted, book.chapters)} · ${s.subLastTouched} ${touched}`
        : `${words} · ${s.subNotStarted} · ${s.subCreated} ${touched}`;
    case "waiting": {
      const notes = s.subNotesPending
        .replace("{n}", String(book.pendingFindings))
        .replace(
          "{noun}",
          pluralNoun(book.pendingFindings, s.subNoteOne, s.subNoteMany, {
            language,
          })
        );
      return book.chapters > 0
        ? `${notes} · ${counted(s.subDevEdited, book.analyzed, book.chapters)}`
        : notes;
    }
    case "completed":
      return `${s.subFinished} · ${words} · ${book.chapters} ${s.chapters.toLowerCase()}`;
    case "archived":
      return `${s.subArchived} · ${words}`;
  }
}
