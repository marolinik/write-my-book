// src/lib/i18n/relative-time.ts
//
// One relative-time formatter for the whole app.
//
// Five components had written their own: the book page, the blackboard panel,
// both memory panels and the document library. Four of them returned English
// —"just now", "3m ago", "Never" — from a helper no scan over the markup could
// see, because by the time the string reaches JSX it is a function call. The
// fifth had already been localized, and its shape is the one kept here.
//
// The forms live in `docLibrary`, which is where the localized copy already
// shipped; every caller passes that group.

/** The four spoken forms plus the empty case. */
export interface RelativeTimeStrings {
  never: string;
  justNow: string;
  /** Carries `{n}`. */
  minutesAgo: string;
  /** Carries `{n}`. */
  hoursAgo: string;
  /** Carries `{n}`. */
  daysAgo: string;
}

/**
 * "just now", "12m ago", "3d ago" — and, past a week, the date itself in the
 * reader's locale, because "43d ago" is not how anyone reads a calendar.
 */
export function relativeTime(
  date: Date | string | null | undefined,
  locale: string,
  s: RelativeTimeStrings
): string {
  if (!date) return s.never;

  const when = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(when.getTime())) return s.never;

  const minutes = Math.floor((Date.now() - when.getTime()) / 60000);
  if (minutes < 1) return s.justNow;
  if (minutes < 60) return s.minutesAgo.replace("{n}", String(minutes));

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return s.hoursAgo.replace("{n}", String(hours));

  const days = Math.floor(hours / 24);
  if (days < 7) return s.daysAgo.replace("{n}", String(days));

  return when.toLocaleDateString(locale);
}
