/**
 * D-138 — the ghost-text overlay was rendered position:fixed at the RAW caret
 * coordinates with a hard maxWidth:500px and NO viewport clamping. When the
 * caret sits near the right edge of a phone (390px) the remaining width is a
 * few px, so the suggestion wraps one-word-per-line into a tall clipped column
 * that runs under the bottom nav and buries the "Tap to accept" pill (the
 * D-132 accept affordance).
 *
 * ghostOverlayPlacement clamps the overlay to the caret when there is room and
 * FLIPS it to the next line at the left edge margin when there is not — the
 * same thing natural text does when a word won't fit before the right edge.
 *
 * Pure by design: the viewport width is a PARAMETER (no window access) so the
 * placement decision is unit-testable and the initial render and the
 * scroll/resize reposition share one source of truth. Immutable — it only ever
 * returns a fresh OverlayPlacement.
 */

/** The caret geometry the overlay anchors to (from ProseMirror coordsAtPos). */
export interface CaretRect {
  top: number;
  bottom: number;
  left: number;
}

/** Where the fixed overlay renders and how wide it may grow. */
export interface OverlayPlacement {
  top: number;
  left: number;
  maxWidth: number;
}

/**
 * The overlay's width cap. Preserves the pre-D-138 behaviour (the span used a
 * hardcoded maxWidth:500px) whenever there is ample room to the right.
 */
export const OVERLAY_MAX_WIDTH_PX = 500;

/** Gutter kept between the overlay and either viewport edge. */
export const OVERLAY_EDGE_MARGIN_PX = 8;

/**
 * Below this available inline width the column degenerates toward
 * one-word-per-line at font-serif text-lg and the accept pill wraps onto its
 * own line — that IS the D-138 symptom. Above it, anchoring at the caret still
 * reads as a suggestion. The exact value is a judgement call and challengeable
 * in review; it is the flip threshold, not a hard layout constant.
 */
export const OVERLAY_MIN_INLINE_WIDTH_PX = 160;

/**
 * Decide where the ghost overlay sits given the caret and the viewport width.
 * The margin-respecting room to the right of the caret governs the choice:
 * enough room → anchor at the caret and clamp the width to what fits (capped at
 * OVERLAY_MAX_WIDTH_PX); too little → flip to the next line at the left margin
 * with a full-line width (still capped). maxWidth is floored at 0 so a
 * degenerate viewport can never produce a negative width.
 */
export function ghostOverlayPlacement(
  caret: CaretRect,
  viewportWidth: number
): OverlayPlacement {
  // D-138: room from the caret to the right edge margin. When this is at least
  // the inline minimum the overlay stays anchored at the caret, clamped so it
  // can't overrun the edge.
  const availableInline = viewportWidth - OVERLAY_EDGE_MARGIN_PX - caret.left;
  if (availableInline >= OVERLAY_MIN_INLINE_WIDTH_PX) {
    return {
      top: caret.top,
      left: caret.left,
      maxWidth: Math.min(OVERLAY_MAX_WIDTH_PX, availableInline),
    };
  }

  // D-138: too little room to render inline — flip to the next line at the left
  // edge margin (a natural wrap) with a full-line width, margin on both sides,
  // floored at 0 for degenerate/zero viewports and capped at the max.
  const flippedWidth = Math.max(0, viewportWidth - 2 * OVERLAY_EDGE_MARGIN_PX);
  return {
    top: caret.bottom,
    left: OVERLAY_EDGE_MARGIN_PX,
    maxWidth: Math.min(OVERLAY_MAX_WIDTH_PX, flippedWidth),
  };
}
