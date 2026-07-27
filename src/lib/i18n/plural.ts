// src/lib/i18n/plural.ts
//
// Minimal, locale-driven noun pluralisation. Follows the pattern already in the
// dictionaries (`bookList.book` / `bookList.books`, used by books/page.tsx):
// each countable noun ships a singular and a plural form per locale, and the
// call site picks between them instead of hard-coding an English "s".
//
// Deliberately NOT Intl.PluralRules: the dictionaries only carry two forms per
// noun, so a "few"/"many" category (Slavic) would have nothing to resolve to.
// Languages needing a third form must gain a third dictionary key first.

/** Picks the singular or plural noun form for a count. */
export function pluralNoun(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** Renders "1 chapter" / "3 chapters" — never "1 chapters" (D-163). */
export function countWithNoun(count: number, one: string, many: string): string {
  return `${count} ${pluralNoun(count, one, many)}`;
}
