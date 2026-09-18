/**
 * O2 — series documents were a concatenation, not a synthesis.
 *
 * Each book's document was spliced into the series file verbatim under a
 * `## Book NN Contributions` heading, which produced three visible defects in
 * the owner's own trilogy:
 *
 *   - the book document kept its `# TITLE`, so an h1 sat nested under an h2 and
 *     every renderer treated it as a new top-level document;
 *   - the file opened at Book 02, because Book 01 never contributed and nothing
 *     said so — the absence read as "book 1 has nothing to say";
 *   - a book whose document arrived later was appended at the end, so reading
 *     order and book order disagreed.
 *
 * Composition is pure and lives here so each rule is testable without a series.
 */

export interface BookSection {
  bookNumber: number;
  bookName: string;
  content: string;
  /** The book's own language, so a mixed-language series says so. */
  language?: string;
}

export interface MissingBook {
  bookNumber: number;
  bookName: string;
}

export interface ComposeInput {
  title: string;
  sections: readonly BookSection[];
  seriesLanguage?: string;
  missingBooks: readonly MissingBook[];
}

const MAX_HEADING = 6;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Push every ATX heading down by `levels`, capped at h6. Fenced code blocks are
 * left alone: a `#` inside a fence is content, not structure.
 */
export function demoteHeadings(markdown: string, levels: number): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const match = /^(#{1,6})(\s)/.exec(line);
      if (!match) return line;
      const depth = Math.min(match[1].length + levels, MAX_HEADING);
      return "#".repeat(depth) + line.slice(match[1].length);
    })
    .join("\n");
}

/** One book's section: an h2 header plus its document demoted beneath it. */
export function buildBookSection(
  section: BookSection,
  seriesLanguage?: string
): string {
  const differs =
    section.language && seriesLanguage && section.language !== seriesLanguage;
  const languageNote = differs ? ` _(${section.language})_` : "";
  const header = `## Book ${pad(section.bookNumber)} — ${section.bookName}${languageNote}`;
  return `${header}\n\n${demoteHeadings(section.content.trim(), 2)}`;
}

/** The note that makes an absent book visible instead of a silent gap. */
function missingNote(missing: readonly MissingBook[]): string {
  if (missing.length === 0) return "";
  const list = missing
    .map((m) => `Book ${pad(m.bookNumber)} — ${m.bookName}`)
    .join(", ");
  return `> No contribution yet from: ${list}. What follows covers the other books only.\n`;
}

export function composeSeriesDocument(input: ComposeInput): string {
  const ordered = [...input.sections].sort((a, b) => a.bookNumber - b.bookNumber);
  const body = ordered
    .map((s) => buildBookSection(s, input.seriesLanguage))
    .join("\n\n");
  const note = missingNote(input.missingBooks);

  return [`# ${input.title}`, note, body].filter(Boolean).join("\n\n").trimEnd();
}

/**
 * Replace one book's section in an existing series document, or insert it in
 * book order. Appending was the old behaviour and is what put Book 01 at the
 * bottom when its document arrived last.
 */
export function upsertBookSection(
  existing: string,
  section: BookSection,
  seriesLanguage?: string
): string {
  const rendered = buildBookSection(section, seriesLanguage);
  const lines = existing.split("\n");

  const headerIndexes: Array<{ index: number; bookNumber: number }> = [];
  lines.forEach((line, i) => {
    const m = /^## Book (\d+)/.exec(line);
    if (m) headerIndexes.push({ index: i, bookNumber: Number(m[1]) });
  });

  const own = headerIndexes.find((h) => h.bookNumber === section.bookNumber);
  if (own) {
    const next = headerIndexes.find((h) => h.index > own.index);
    const end = next ? next.index : lines.length;
    const replaced = [
      ...lines.slice(0, own.index),
      ...rendered.split("\n"),
      "",
      ...lines.slice(end),
    ];
    return replaced.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  }

  const after = headerIndexes.find((h) => h.bookNumber > section.bookNumber);
  if (after) {
    const inserted = [
      ...lines.slice(0, after.index),
      ...rendered.split("\n"),
      "",
      ...lines.slice(after.index),
    ];
    return inserted.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  }

  return `${existing.trimEnd()}\n\n${rendered}`;
}
