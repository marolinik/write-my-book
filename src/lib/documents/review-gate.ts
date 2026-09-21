/**
 * D-201 — what a setup gate is allowed to count.
 *
 * The artifact contract recovers a run's deliverable out of the assistant's
 * final text when the run persisted nothing itself. It cannot tell a Story
 * Bible from the coach's interview turn, so a list of twelve questions could
 * become a STORY_BIBLE document — and every gate in the product tested
 * existence only, so the wizard advanced and downstream agents took the
 * questions for canon.
 *
 * A recovered document carries its own evidence: version 1 is stamped with
 * `TRANSCRIPT_RECOVERY_SOURCE`. "Nobody has reviewed it" is exactly "still on
 * version 1, and that version is a recovery". The writer opening it and saving
 * makes version 2, and the gate opens by itself — no review flag to set, no
 * column to migrate, and nothing for a future writer to get stuck behind.
 */

/** `change_source` stamped on a document recovered from a session transcript. */
export const TRANSCRIPT_RECOVERY_SOURCE = "transcript-recovery";

/**
 * The Prisma `where` fragment that drops documents still awaiting review.
 *
 * Both halves matter. Without `currentVersion` it would hide a Story Bible the
 * writer has since rewritten; without the source it would hide every document
 * on its first version, which is most of them.
 */
export const NOT_AWAITING_REVIEW = {
  NOT: {
    currentVersion: 1,
    versions: { some: { changeSource: TRANSCRIPT_RECOVERY_SOURCE } },
  },
} as const;

/** A document as this check needs to see it. */
export interface ReviewableDocument {
  currentVersion: number;
  versions: ReadonlyArray<{ changeSource: string }>;
}

/** Whether this document was recovered from a transcript and never touched since. */
export function isAwaitingReview(document: ReviewableDocument): boolean {
  return (
    document.currentVersion === 1 &&
    document.versions.some((version) => version.changeSource === TRANSCRIPT_RECOVERY_SOURCE)
  );
}

/**
 * The document types a book may be credited with for setup purposes — the one
 * query every gate should ask, so a new gate cannot forget the exclusion.
 */
export async function setupDocumentTypes(bookId: string): Promise<Set<string>> {
  const { db } = await import("@/lib/db");
  const documents = await db.document.findMany({
    where: { bookId, ...NOT_AWAITING_REVIEW },
    select: { type: true },
  });
  return new Set(documents.map((document) => document.type));
}
