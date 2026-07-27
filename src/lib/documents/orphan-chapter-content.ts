/**
 * D-190 / D-115 — deleted-chapter prose resurrection guard.
 *
 * Chapter-scoped documents are addressed by `(bookId, type, chapter_number)`;
 * there is no `chapterId` column (see prisma/schema.prisma `Document`). So when
 * a chapter is deleted its CHAPTER_CONTENT row survives, and the next chapter
 * created at that number — `/chapters/new` auto-defaults to the freed number —
 * resolves to the dead chapter's prose. Captured in the UI: a brand-new chapter
 * opened full of deleted text under a "Fresh Start" badge, `wordCount: 0` over a
 * non-empty body, and the first autosave adopted the deleted words into the new
 * chapter's history with no conflict and no signal at all.
 *
 * Without a schema change (existing orphan rows and their cleanup are a
 * separate, founder-level policy call) the honest identity signal is
 * chronology: a content document created BEFORE the chapter row that currently
 * occupies its number cannot be that chapter's prose.
 *
 * Reorder does not break this: `chapters/reorder` renumbers each chapter AND
 * its documents inside one transaction and touches no `created_at`, so the
 * chapter↔document pairing survives a reorder intact.
 *
 * The rule is deliberately conservative in one direction — showing deleted
 * prose is bad, but HIDING a writer's real prose would be worse:
 *   - both timestamps must be known (missing ⇒ not orphaned),
 *   - the chapter must have zero counted words (a chapter that already has
 *     words either wrote them here or already adopted them pre-fix, and either
 *     way its current content must never be blanked).
 */

export interface OrphanContentInput {
  /** `documents.created_at` of the resolved CHAPTER_CONTENT row. */
  docCreatedAt?: Date | string | null;
  /** `chapters.created_at` of the chapter that now holds that number. */
  chapterCreatedAt?: Date | string | null;
  /** Denormalised `chapters.word_count` — 0 for a never-written chapter. */
  chapterWordCount?: number | null;
}

function toMillis(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * True when the resolved CHAPTER_CONTENT document belongs to a chapter that no
 * longer exists, and must therefore not be served, saved into, or exported as
 * the current chapter's content.
 */
export function isOrphanedChapterContent(input: OrphanContentInput): boolean {
  if ((input.chapterWordCount ?? 0) !== 0) return false;

  const docMs = toMillis(input.docCreatedAt);
  const chapterMs = toMillis(input.chapterCreatedAt);
  if (docMs === null || chapterMs === null) return false;

  return docMs < chapterMs;
}

/**
 * `change_source` stamped on the save that reclaims an orphaned row for its new
 * chapter. Distinct on purpose: version history can then show where the deleted
 * chapter's versions end and the new chapter's begin (see D-191).
 */
export const ORPHAN_RECLAIM_SOURCE = "orphan-reclaim";
