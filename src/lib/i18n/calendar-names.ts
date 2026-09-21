// src/lib/i18n/calendar-names.ts
//
// Month and weekday names, from the platform rather than the dictionary.
//
// Two components shipped their own `["Jan", "Feb", …]` array — the heatmap's
// month ruler and the year-in-writing card's peak month. Eighty-four
// dictionary values would have been the wrong fix: every runtime already
// knows what January is called in the reader's language, and a calendar name
// is exactly what `Intl` exists for.

/** "Jan", "Feb", … in the reader's language, indexed by month number (0-11). */
export function shortMonthNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: "short" });
  // The day is arbitrary; the 15th avoids every timezone's month boundary.
  return Array.from({ length: 12 }, (_, month) =>
    format.format(new Date(Date.UTC(2021, month, 15)))
  );
}

/**
 * "Mon", "Tue", … indexed the way a `Date` reports its day: 0 is Sunday.
 * 2021-08-01 was a Sunday, so the offset needs no arithmetic.
 */
export function shortWeekdayNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, day) =>
    format.format(new Date(Date.UTC(2021, 7, 1 + day)))
  );
}
