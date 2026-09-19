// src/lib/i18n/plural.ts
//
// Locale-driven noun pluralisation. Each countable noun ships its forms per
// locale and the call site picks between them, instead of hard-coding an
// English "s".
//
// Two forms are enough for English, German, Spanish and French. Serbian and
// Russian need three: "1 knjiga", "3 knjige", "5 knjiga" — the shelf read
// "3 knjiga", which is wrong in a way a reader notices immediately (S3-24).
// Chinese needs one, and gets it by passing the same word twice.
//
// Deliberately NOT Intl.PluralRules: its categories are richer than the
// dictionaries, so a noun that ships two forms would have nothing to resolve a
// "few" to. The rule below is the Slavic one, written out, and a noun that does
// not carry a `few` form simply never reaches it.

/** Languages whose counts take a distinct 2–4 form. */
const THREE_FORM_LANGUAGES = new Set(["sr", "ru", "hr", "bs", "uk"]);

export interface PluralOptions {
  /** The 2–4 form. Without it a three-form language falls back to `many`. */
  few?: string;
  /** UI language code; only its first segment matters ("sr-Latn-RS" → "sr"). */
  language?: string;
}

/**
 * The Slavic rule. The last digit decides, except in the teens — 11 through 14
 * take the many form although they end in 1 through 4.
 */
function slavicForm(count: number): "one" | "few" | "many" {
  const n = Math.abs(count);
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "many";

  const last = n % 10;
  if (last === 1) return "one";
  if (last >= 2 && last <= 4) return "few";
  return "many";
}

/** Picks the noun form for a count. */
export function pluralNoun(
  count: number,
  one: string,
  many: string,
  options?: PluralOptions
): string {
  const language = (options?.language ?? "en").split("-")[0];

  if (THREE_FORM_LANGUAGES.has(language)) {
    switch (slavicForm(count)) {
      case "one":
        return one;
      case "few":
        // A noun that ships only two forms keeps the old behaviour rather than
        // inventing a word for it.
        return options?.few ?? many;
      default:
        return many;
    }
  }

  return count === 1 ? one : many;
}

/** Renders "1 chapter" / "3 chapters" / "3 knjige" — never "1 chapters" (D-163). */
export function countWithNoun(
  count: number,
  one: string,
  many: string,
  options?: PluralOptions
): string {
  return `${count} ${pluralNoun(count, one, many, options)}`;
}
