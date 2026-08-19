/**
 * Applicability rules for editorial findings (D-41).
 *
 * A finding whose replacement text (`newText`) is blank — empty or only
 * whitespace — must never be presented as an applicable suggestion: applying it
 * would silently delete the passage named by `originalText`. These helpers are
 * the single source of truth for "does this finding carry a real, non-destructive
 * replacement", shared by the read path (list route) and the write path (apply
 * route) so the two can never disagree.
 *
 * Note the asymmetry with `originalText`: a blank `originalText` with a real
 * `newText` is an intentional INSERTION (the D-13 empty-span rule), so blankness
 * is only destructive on the replacement side.
 */

/**
 * Zero-width characters that survive String.trim() (not Unicode WhiteSpace)
 * but render as nothing — a replacement made only of these is an invisible,
 * effectively-destructive edit: U+200B zero width space, U+200C ZWNJ,
 * U+200D ZWJ, U+2060 word joiner.
 */
const ZERO_WIDTH_CHARS = new RegExp("[\\u200B\\u200C\\u200D\\u2060]", "g");

/** True when a string is absent or contains only whitespace / zero-width characters. */
export function isBlank(text: string | null | undefined): boolean {
  return text == null || text.replace(ZERO_WIDTH_CHARS, "").trim().length === 0;
}

/**
 * A replacement is "destructive" when a target passage is named
 * (`originalText` present) but the replacement is blank — applying it would
 * delete the passage. This is the D-41a shape that must be refused, never
 * auto-applied.
 */
export function isDestructiveReplacement(
  originalText: string | null | undefined,
  newText: string | null | undefined
): boolean {
  return !isBlank(originalText) && isBlank(newText);
}

/**
 * True only when applying the finding performs a real, non-destructive text
 * replacement: a target passage to find AND a non-blank replacement to insert.
 * Advice-only findings (no target passage) are not auto-applicable.
 */
export function isAutoApplicable(
  originalText: string | null | undefined,
  newText: string | null | undefined
): boolean {
  return !isBlank(originalText) && !isBlank(newText);
}
