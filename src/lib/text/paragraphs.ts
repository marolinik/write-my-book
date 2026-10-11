/**
 * Paragraph splitting that does not care which line endings the text uses.
 *
 * A manuscript imported from Windows arrives with CRLF, so its paragraph
 * breaks are "\r\n\r\n". Splitting on /\n\n+/ never matches that, and the
 * whole chapter reads as ONE paragraph: finding grounding then rejected every
 * finding below paragraph 1 (live run 2026-10-11). Every paragraph count in the
 * product goes through here so they all agree with each other.
 */

/** Convert CRLF and lone CR line endings to LF. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Split text into trimmed, non-empty paragraphs. A blank line, or a line of
 * only whitespace (including the no-break spaces Word exports leave behind),
 * ends a paragraph.
 */
export function splitParagraphs(text: string): string[] {
  return normalizeLineEndings(text)
    .split(/\n[^\S\n]*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
