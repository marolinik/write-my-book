/**
 * D-130 — ghost Tab-accept inserted the raw suggestion at the cursor, so a
 * suggestion starting with a word character glued onto the word being typed
 * ("…wrote about the" + "dream: …" → "thedream: …").
 *
 * The ghost overlay renders detached from the doc, so the model never sees a
 * joining space to emit; the accept path owns the join.
 */

/** Suggestion openers that bind to the left — no space wanted before them. */
const BINDS_LEFT = /^[\s.,;:!?)\]}»”’…—–/-]/;

/**
 * Chars after which no space is wanted: whitespace, opening brackets and
 * dashes, plus quote chars. Straight quotes are ambiguous (apostrophe in
 * "don'" vs closing quote) — mid-word apostrophes are the common editor case,
 * so quotes join without a space.
 */
const NO_SPACE_AFTER = /[\s([{«“‘'"—–/-]/;

/**
 * Returns the suggestion ready to insert at the cursor, prepending a joining
 * space when both sides are word-like. `charBefore` is the single document
 * character before the cursor ("" at a doc or paragraph boundary, where
 * ProseMirror's textBetween yields nothing).
 */
export function joinGhostSuggestion(
  charBefore: string,
  suggestion: string
): string {
  if (!suggestion || !charBefore) return suggestion;
  if (NO_SPACE_AFTER.test(charBefore)) return suggestion;
  if (BINDS_LEFT.test(suggestion)) return suggestion;
  return ` ${suggestion}`;
}
