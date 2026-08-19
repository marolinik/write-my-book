/**
 * D-130 — ghost Tab-accept inserted the raw suggestion at the cursor, so a
 * suggestion starting with a word character glued onto the word being typed
 * ("…wrote about the" + "dream: …" → "thedream: …").
 *
 * The ghost overlay renders detached from the doc, so the model never sees a
 * joining space to emit; the accept path owns the join.
 *
 * Contract: `before` is up to the LAST TWO document characters before the
 * cursor ("" at a doc or paragraph boundary, where ProseMirror's textBetween
 * yields nothing). The second-to-last character disambiguates a trailing quote:
 * an apostrophe / opening quote ("don'", 'we"', "s’") binds to the left, while a
 * closing quote that follows sentence punctuation ('."', '.”') ends a sentence
 * so the next one needs a leading space. One-character callers stay valid — a
 * missing second-to-last character is treated as absent.
 */

/**
 * Suggestion openers that bind to the left — no space wanted before them.
 * Includes the straight apostrophe so a suggestion like "'s edge" glues onto
 * the prior word. Straight/curly DOUBLE quotes are intentionally excluded: a
 * suggestion-initial `"` is dominantly an OPENING quote, which wants a leading
 * space.
 */
const BINDS_LEFT = /^[\s.,;:!?)\]}»”’'…—–/-]/;

/**
 * Last document characters after which no space is wanted regardless of the
 * suggestion: whitespace, opening brackets, opening curly quotes, dashes and
 * the slash. Straight and curly quotes are deliberately absent — they are
 * ambiguous (apostrophe vs. closing quote) and handled separately.
 */
const NO_SPACE_AFTER = /[\s([{«“‘—–/-]/;

/**
 * Quote characters that are either a trailing apostrophe / opening quote (glue)
 * or a closing quote after sentence punctuation (space).
 */
const AMBIGUOUS_QUOTE = /['"’”]/;

/**
 * Sentence-level punctuation that, immediately before a closing quote, ends a
 * clause so the following sentence needs a leading space.
 */
const SENTENCE_PUNCT = /[.!?,;:…]/;

/**
 * Returns the suggestion ready to insert at the cursor, prepending a joining
 * space when both sides are word-like. `before` is up to the last two document
 * characters before the cursor (see the module contract above).
 */
export function joinGhostSuggestion(
  before: string,
  suggestion: string
): string {
  if (!suggestion || !before) return suggestion;

  const last = before[before.length - 1];
  const prev = before.length >= 2 ? before[before.length - 2] : "";

  if (NO_SPACE_AFTER.test(last)) return suggestion;

  // Ambiguous trailing quote: a closing quote after sentence punctuation is a
  // sentence boundary (fall through to the normal space rule); otherwise it is
  // an apostrophe / opening quote and binds to the left.
  if (AMBIGUOUS_QUOTE.test(last) && !(prev && SENTENCE_PUNCT.test(prev))) {
    return suggestion;
  }

  if (BINDS_LEFT.test(suggestion)) return suggestion;
  return ` ${suggestion}`;
}
