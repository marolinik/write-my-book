import type { ChapterRollup, ChapterStatusRow } from "./types";

const DRAFTED: ReadonlySet<string> = new Set([
  "drafted",
  "dev_edited",
  "line_edited",
  "beta_read",
  "beta_passed",
]);
const ANALYZED: ReadonlySet<string> = new Set([
  "dev_edited",
  "line_edited",
  "beta_read",
  "beta_passed",
]);

/** Folds chapter.groupBy rows into a per-book {drafted, analyzed} tally. */
export function buildRollups(rows: ChapterStatusRow[]): Map<string, ChapterRollup> {
  const map = new Map<string, ChapterRollup>();
  for (const row of rows) {
    const prev = map.get(row.bookId) ?? { drafted: 0, analyzed: 0 };
    map.set(row.bookId, {
      drafted: prev.drafted + (DRAFTED.has(row.status) ? row.count : 0),
      analyzed: prev.analyzed + (ANALYZED.has(row.status) ? row.count : 0),
    });
  }
  return map;
}
