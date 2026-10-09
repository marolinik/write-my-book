/**
 * Polish Scene's limits and vocabulary, kept free of imports so the request
 * schema (read by client code too) can share them without pulling the prompt
 * builder into the browser bundle.
 */

export const POLISH_INTENSITIES = ["light", "bold"] as const;
export type PolishIntensity = (typeof POLISH_INTENSITIES)[number];

/** About 3,500 words: a long scene, and the most one reply can rewrite whole. */
export const POLISH_MAX_SELECTION_CHARS = 20_000;
/** How much of the chapter around the scene the model reads, each side. */
export const POLISH_CONTEXT_CHARS = 3_000;
export const POLISH_MAX_FOCUS_CHARS = 500;

export type PolishRejection =
  | "truncated"
  | "empty"
  | "too-short"
  | "editorial-note"
  | "reasoning-only"
  | "foreign-script";

/** The most output one rewrite may ask for, before the model's own ceiling. */
export const POLISH_MAX_OUTPUT_TOKENS = 16_000;
const MIN_OUTPUT_TOKENS = 1_024;
/** The rewrite may run longer than the scene, plus a little preamble. */
const REWRITE_GROWTH = 1.6;
const PREAMBLE_TOKENS = 512;

const HAN_KANA_HANGUL = /[぀-ヿ㐀-鿿가-힯豈-﫿]/g;
const CYRILLIC = /[Ѐ-ӿ]/g;

/**
 * Rough token count for a scene. Tokenizers spend far more per character on
 * Chinese, Japanese and Korean (about 1.5 per character) and on Cyrillic than
 * on Latin script (about 3 characters per token): a budget sized for English
 * cuts a Chinese scene off every time.
 */
export function estimatePolishTokens(text: string): number {
  const cjk = text.match(HAN_KANA_HANGUL)?.length ?? 0;
  const cyrillic = text.match(CYRILLIC)?.length ?? 0;
  const rest = text.length - cjk - cyrillic;
  return Math.ceil(cjk * 1.5 + cyrillic / 2.2 + rest / 3);
}

/** Output tokens one complete rewrite of this scene needs. */
export function polishRewriteTokens(text: string): number {
  return Math.max(
    MIN_OUTPUT_TOKENS,
    Math.ceil(estimatePolishTokens(text) * REWRITE_GROWTH) + PREAMBLE_TOKENS
  );
}

/** Whether a complete rewrite of this scene fits one reply. */
export function polishFitsBudget(text: string): boolean {
  return polishRewriteTokens(text) <= POLISH_MAX_OUTPUT_TOKENS;
}
