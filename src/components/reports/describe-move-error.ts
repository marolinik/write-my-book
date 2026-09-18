/**
 * The writer's reason a move could not run.
 *
 * The engine answers with a code and an English sentence; the code is the
 * contract, the sentence is a developer's note. Showing the sentence put
 * "This proposal is already failed." in the middle of a Serbian panel and told
 * the writer nothing about what to do (S3-8).
 */
export function describeMoveError(
  code: string | undefined,
  fallback: string,
  s: Record<string, string>
): string {
  const byCode: Record<string, string | undefined> = {
    not_pending: s.errNotPending,
    chapter_not_found: s.errChapterGone,
    anchor_not_found: s.errAnchorMissing,
    anchor_ambiguous: s.errAnchorAmbiguous,
    anchor_too_early: s.errAnchorTooEarly,
    not_adjacent: s.errNotAdjacent,
    book_changed: s.errBookChanged,
  };
  return (code && byCode[code]) || fallback;
}
