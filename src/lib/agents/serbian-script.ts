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
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const mapped = CYRILLIC_TO_LATIN[ch];
    if (mapped === undefined) {
      out += ch;
      continue;
    }

    // Digraph from an uppercase Cyrillic letter: "Lj" normally, "LJ" when the
    // surrounding run is uppercase.
    if (mapped.length === 2 && mapped[0] === mapped[0].toUpperCase()) {
      const next = text[i + 1];
      const nextIsUpperCyrillic =
        next !== undefined &&
        CYRILLIC_RANGE.test(next) &&
        next === next.toUpperCase() &&
        next !== next.toLowerCase();
      out += nextIsUpperCyrillic ? mapped.toUpperCase() : mapped;
      continue;
    }

    out += mapped;
  }
  return out;
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
  return language === "sr" ? toSerbianLatin(text) : text;
}
