/**
 * Serbian is written in two scripts. A book set to `sr` is Latin ("latinica"),
 * and the prompts say so in capitals — but script choice is a model behaviour,
 * not a guarantee: local models drift into Cyrillic mid-session, so the writer
 * gets a chat and documents in the script they did not choose.
 *
 * Transliteration is deterministic and lossless in this direction: every
 * Cyrillic letter of the Serbian alphabet has exactly one Latin counterpart,
 * including the three digraphs (lj, nj, dž). The reverse is ambiguous, which is
 * why this only ever converts Cyrillic to Latin, never back.
 */

/** Serbian Cyrillic to Latin, including the digraph letters. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž",
  з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n",
  њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "ć", у: "u",
  ф: "f", х: "h", ц: "c", ч: "č", џ: "dž", ш: "š",
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Ђ: "Đ", Е: "E", Ж: "Ž",
  З: "Z", И: "I", Ј: "J", К: "K", Л: "L", Љ: "Lj", М: "M", Н: "N",
  Њ: "Nj", О: "O", П: "P", Р: "R", С: "S", Т: "T", Ћ: "Ć", У: "U",
  Ф: "F", Х: "H", Ц: "C", Ч: "Č", Џ: "Dž", Ш: "Š",
};

const CYRILLIC_RANGE = /[Ѐ-ӿ]/;

/** Whether the text contains any Cyrillic at all. */
export function containsCyrillic(text: string): boolean {
  return CYRILLIC_RANGE.test(text);
}

/**
 * Convert Serbian Cyrillic to Latin, leaving every other character untouched.
 *
 * Digraphs follow Serbian casing rules: a capital Cyrillic letter inside an
 * all-caps run stays all-caps ("ЊЕГОВ" becomes "NJEGOV"), while a capitalised
 * word gets the title form ("Његов" becomes "Njegov"). Getting this wrong is
 * what makes machine transliteration look wrong to a native reader.
 */
export function toSerbianLatin(text: string): string {
  if (!containsCyrillic(text)) return text;

  let out = "";
  for (let i = 0; i < text.length; i++) out += latinAt(text, i);
  return out;
}

/** The Latin for the character at `i`, which may be a digraph. */
function latinAt(text: string, i: number): string {
  const ch = text[i];
  const mapped = CYRILLIC_TO_LATIN[ch];
  if (mapped === undefined) return ch;

  // Digraph from an uppercase Cyrillic letter: "Lj" normally, "LJ" when the
  // surrounding run is uppercase.
  if (mapped.length === 2 && mapped[0] === mapped[0].toUpperCase()) {
    const next = text[i + 1];
    const nextIsUpperCyrillic =
      next !== undefined &&
      CYRILLIC_RANGE.test(next) &&
      next === next.toUpperCase() &&
      next !== next.toLowerCase();
    return nextIsUpperCyrillic ? mapped.toUpperCase() : mapped;
  }

  return mapped;
}

/**
 * `toSerbianLatin`, with the way back: `toSource[k]` is the index in `text` of
 * the character that produced `latin[k]`, and one last entry is `text.length`.
 *
 * Lets a Latin quote find the passage it quotes in Cyrillic prose and name that
 * span in the prose's own characters (P6-S12).
 */
export function toSerbianLatinWithMap(text: string): { latin: string; toSource: number[] } {
  let latin = "";
  const toSource: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const piece = latinAt(text, i);
    latin += piece;
    for (let k = 0; k < piece.length; k++) toSource.push(i);
  }
  toSource.push(text.length);
  return { latin, toSource };
}

/**
 * Enforce the script a book is written in.
 *
 * Only `sr` is enforced: it is the language whose writers choose a script, and
 * the only one where a model silently switching produces text the writer cannot
 * use. Every other language passes through untouched — Russian, Ukrainian and
 * the rest are Cyrillic by right.
 */
export function enforceBookScript(text: string, language: string | undefined): string {
  return stripStrayCjk(language === "sr" ? toSerbianLatin(text) : text, language);
}

/**
 * Stray CJK in a book that is not Chinese, Japanese or Korean.
 *
 * The local model sometimes leaks Chinese characters into a sentence in
 * another language (live, 2026-10-09: "Na makro平面u, knjiga ima dva ritma").
 * A leak is a few characters, or a sliver of the text; a longer passage (a
 * quoted poem the story needs) is deliberate and stays.
 */
const CJK_LANGUAGES = new Set(["zh", "ja", "ko"]);
const CJK_RUN =
  /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF\uFF00-\uFF65]+/g;
const MAX_LEAK_CHARS = 8;
const MAX_LEAK_SHARE = 0.02;

export function hasStrayCjk(text: string, language: string | undefined): boolean {
  if (!language || CJK_LANGUAGES.has(language)) return false;
  const cjk = (text.match(CJK_RUN) ?? []).reduce((n, run) => n + run.length, 0);
  if (cjk === 0) return false;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return cjk <= MAX_LEAK_CHARS || cjk / Math.max(1, letters) <= MAX_LEAK_SHARE;
}

/** Remove a stray leak; the spacing it leaves behind is tidied, never the lines. */
export function stripStrayCjk(text: string, language: string | undefined): string {
  if (!hasStrayCjk(text, language)) return text;
  return text
    .replace(CJK_RUN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n");
}

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Enforce the book's script on a QUOTE of the manuscript — an anchor, or the
 * passage a finding would replace — without breaking the quote.
 *
 * A quote has to be found in the chapter, or Apply cannot use it. The writer's
 * own prose is never transliterated (a pasted Cyrillic paragraph stays
 * Cyrillic), so a transliterated quote of it could never be found: every
 * finding on a Cyrillic passage answered 409 "may have been edited" (P6-S12).
 * A quote is transliterated only when that is what makes it match — the
 * model's stray homoglyphs in a quote of Latin prose (C-4).
 */
export function enforceQuoteScript(
  quote: string,
  manuscript: string,
  language: string | undefined
): string {
  const enforced = enforceBookScript(quote, language);
  if (enforced === quote) return quote;

  const prose = collapseWhitespace(manuscript);
  const found = (text: string) => prose.includes(collapseWhitespace(text));
  return found(quote) && !found(enforced) ? quote : enforced;
}
