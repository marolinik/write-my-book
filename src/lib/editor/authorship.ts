/**
 * S11: AI authorship provenance.
 *
 * The status bar can only make an honest "X% yours" claim when real
 * per-paragraph provenance has actually been recorded (via a
 * `data-author="human" | "ai" | "ai-edited"` attribute on each paragraph).
 * Until that tracking ships, nothing writes those attributes, so the only
 * values ever fed in are aiWords = 0 / aiEditedWords = 0 — which would render
 * a fabricated "100% yours" on a fully AI-drafted chapter.
 *
 * `hasTrackedAuthorship` is the gate: the readout renders only when genuine
 * AI provenance exists. A chapter with no recorded AI contribution has nothing
 * truthful to attribute, so the tracker stays hidden rather than lying.
 */

export interface AuthorshipStats {
  humanWords: number;
  aiWords: number;
  aiEditedWords: number;
  totalWords: number;
}

/**
 * True only when real AI provenance has been recorded for this chapter.
 * When false, the authorship readout must be omitted — displaying it would
 * claim "100% yours" from data that was never actually tracked.
 */
export function hasTrackedAuthorship(stats: AuthorshipStats): boolean {
  return stats.aiWords > 0 || stats.aiEditedWords > 0;
}
