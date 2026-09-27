/**
 * Which imported chapters would land on the writer's existing work (P6-S04).
 *
 * The import used to send every row as `create`, and `create` upserted: a
 * partial re-import renumbered from 1 and overwrote chapters 1 and 2 — title,
 * text and an edited status reset to "drafted" — without a word. Overwriting a
 * chapter now takes an explicit per-chapter `replace`; the wizard asks, and the
 * route refuses a plan that would overwrite without one. Both read this module
 * so they agree on what counts as "the writer's work".
 */

export type ImportAction = "create" | "replace" | "skip";

/** An existing chapter as the preview reports it. */
export interface ExistingChapterSummary {
  number: number;
  title: string | null;
  wordCount: number;
}

/**
 * True for a chapter the writer has put nothing into — the untitled, empty
 * Chapter 1 every new book starts with (write-first onboarding). An import may
 * fill it without asking; any other existing chapter is the writer's.
 */
export function isBlankChapter(chapter: { title: string | null; wordCount: number }): boolean {
  return !chapter.title?.trim() && chapter.wordCount === 0;
}

/** The existing chapters an import must not overwrite without asking, by number. */
export function occupiedChapters(
  existing: ReadonlyArray<ExistingChapterSummary>
): Map<number, ExistingChapterSummary> {
  return new Map(existing.filter((ch) => !isBlankChapter(ch)).map((ch) => [ch.number, ch]));
}

export interface ImportPlanProblems {
  /** Numbers two imported rows both claim. */
  duplicates: number[];
  /** `create` rows aimed at a chapter that already holds the writer's work. */
  wouldOverwrite: number[];
  /** `replace` rows aimed at a chapter that does not exist. */
  nothingToReplace: number[];
}

/** Everything wrong with an import plan, or null when it can be written as is. */
export function findImportProblems(
  rows: ReadonlyArray<{ number: number; action: ImportAction }>,
  existing: ReadonlyArray<ExistingChapterSummary>
): ImportPlanProblems | null {
  const written = rows.filter((row) => row.action !== "skip");
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const row of written) {
    if (seen.has(row.number)) duplicates.add(row.number);
    seen.add(row.number);
  }

  const exists = new Set(existing.map((ch) => ch.number));
  const occupied = occupiedChapters(existing);
  const wouldOverwrite = written
    .filter((row) => row.action === "create" && occupied.has(row.number))
    .map((row) => row.number);
  const nothingToReplace = written
    .filter((row) => row.action === "replace" && !exists.has(row.number))
    .map((row) => row.number);

  if (duplicates.size === 0 && wouldOverwrite.length === 0 && nothingToReplace.length === 0) {
    return null;
  }
  return { duplicates: [...duplicates], wouldOverwrite, nothingToReplace };
}
