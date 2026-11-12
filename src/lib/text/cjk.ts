/**
 * P2-47 / P2-43: Chinese and Japanese are written without spaces, so every
 * counter and window that split on whitespace saw a whole chapter as one
 * "word". Han and kana characters are counted one by one (as word
 * processors count them); Hangul is space-delimited and needs nothing.
 */

const HAN_KANA_CLASS = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
const HAN_KANA = new RegExp(`[${HAN_KANA_CLASS}]`, "g");
const HAN_KANA_ONE = new RegExp(`[${HAN_KANA_CLASS}]`);
/** Ideographic punctuation and fullwidth punctuation, not letters or digits. */
const CJK_PUNCTUATION = /[　-〿！-／：-＠［-｀｛-･]/g;

export function countHanKana(text: string): number {
  return text.match(HAN_KANA)?.length ?? 0;
}

export function hasHanKana(text: string): boolean {
  return HAN_KANA_ONE.test(text);
}

function spaceSeparatedWords(text: string): number {
  const rest = text.replace(HAN_KANA, " ").replace(CJK_PUNCTUATION, " ").trim();
  return rest ? rest.split(/\s+/).length : 0;
}

/** Words: each Han or kana character, plus every space-separated word. */
export function countMixedWords(text: string): number {
  return countHanKana(text) + spaceSeparatedWords(text);
}

/** Rough tokens: about 1.5 per Han or kana character, one per CJK mark, 1.3 per other word. */
export function estimateTextTokens(text: string): number {
  const punctuation = text.match(CJK_PUNCTUATION)?.length ?? 0;
  return Math.ceil(countHanKana(text) * 1.5 + punctuation + spaceSeparatedWords(text) * 1.3);
}
