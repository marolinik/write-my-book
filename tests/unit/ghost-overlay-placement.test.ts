import { describe, it, expect } from "vitest";
import {
  ghostOverlayPlacement,
  OVERLAY_MAX_WIDTH_PX,
  OVERLAY_EDGE_MARGIN_PX,
  OVERLAY_MIN_INLINE_WIDTH_PX,
  type CaretRect,
} from "@/components/editor/ghost-overlay-placement";

/**
 * D-138 — on a phone (390px viewport) the ghost-text overlay renders
 * position:fixed at the RAW caret coordinates with a hard maxWidth:500px and NO
 * viewport clamping. When the caret sits near the right edge the remaining
 * width is a few px, so the suggestion wraps one-word-per-line into a tall
 * clipped column that runs under the bottom nav and buries the "Tap to accept"
 * pill (the D-132 accept affordance).
 *
 * ghostOverlayPlacement(caret, viewportWidth) decides where the overlay sits:
 * - ample room to the right of the caret → passthrough (anchor at caret, full
 *   500px cap — the pre-D-138 behaviour, unchanged on desktop);
 * - some room but tight → anchor at caret, clamp maxWidth to what fits;
 * - too little room to render inline (< OVERLAY_MIN_INLINE_WIDTH_PX) → FLIP the
 *   overlay to the next line at the left edge margin, mimicking a natural text
 *   wrap so it never degenerates into a one-word column.
 * Pure (viewportWidth is a parameter, no window access) so it is unit-testable.
 */
describe("ghostOverlayPlacement — D-138 right-edge overlay clamp/flip", () => {
  // Desktop caret with acres of room to the right.
  const desktopCaret: CaretRect = { top: 100, bottom: 120, left: 40 };

  it("passes through untouched when there is ample room (desktop)", () => {
    const placement = ghostOverlayPlacement(desktopCaret, 1440);
    expect(placement).toEqual({
      top: 100,
      left: 40,
      maxWidth: OVERLAY_MAX_WIDTH_PX,
    });
  });

  it("anchors at the caret and clamps maxWidth to the available width when tight but still inline-viable", () => {
    // viewport 390, caret.left 130 → available = 390 - 8 - 130 = 252 (>= 160).
    const caret: CaretRect = { top: 200, bottom: 224, left: 130 };
    const available = 390 - OVERLAY_EDGE_MARGIN_PX - 130;
    expect(available).toBeGreaterThanOrEqual(OVERLAY_MIN_INLINE_WIDTH_PX);

    const placement = ghostOverlayPlacement(caret, 390);
    expect(placement.top).toBe(200); // still anchored at the caret line
    expect(placement.left).toBe(130);
    expect(placement.maxWidth).toBe(available); // clamped below 500
    expect(placement.maxWidth).toBeLessThan(OVERLAY_MAX_WIDTH_PX);
  });

  it("FLIPS to the next line at the edge margin when available width is below the inline minimum", () => {
    // viewport 390, caret.left 350 → available = 390 - 8 - 350 = 32 (< 160).
    const caret: CaretRect = { top: 200, bottom: 224, left: 350 };
    const available = 390 - OVERLAY_EDGE_MARGIN_PX - 350;
    expect(available).toBeLessThan(OVERLAY_MIN_INLINE_WIDTH_PX);

    const placement = ghostOverlayPlacement(caret, 390);
    // Flipped down to the next line, re-anchored at the left edge margin.
    expect(placement.top).toBe(224); // caret.bottom
    expect(placement.left).toBe(OVERLAY_EDGE_MARGIN_PX);
    // Full line width minus a margin on each side, capped at 500.
    expect(placement.maxWidth).toBe(390 - 2 * OVERLAY_EDGE_MARGIN_PX);
  });

  it("does NOT flip at the exact boundary available === min inline width", () => {
    // caret.left chosen so available === OVERLAY_MIN_INLINE_WIDTH_PX exactly.
    const viewportWidth = 390;
    const left =
      viewportWidth - OVERLAY_EDGE_MARGIN_PX - OVERLAY_MIN_INLINE_WIDTH_PX;
    const caret: CaretRect = { top: 300, bottom: 330, left };

    const placement = ghostOverlayPlacement(caret, viewportWidth);
    // Boundary is inclusive: still anchored inline at the caret, not flipped.
    expect(placement.top).toBe(300);
    expect(placement.left).toBe(left);
    expect(placement.maxWidth).toBe(OVERLAY_MIN_INLINE_WIDTH_PX);
  });

  it("never yields a negative maxWidth on a degenerate zero/tiny viewport", () => {
    const zeroCaret: CaretRect = { top: 5, bottom: 10, left: 0 };
    const atZero = ghostOverlayPlacement(zeroCaret, 0);
    expect(atZero.maxWidth).toBeGreaterThanOrEqual(0); // floored, never negative
    expect(atZero.top).toBe(10); // flipped to caret.bottom
    expect(atZero.left).toBe(OVERLAY_EDGE_MARGIN_PX);

    const tinyCaret: CaretRect = { top: 5, bottom: 10, left: 6 };
    const atTiny = ghostOverlayPlacement(tinyCaret, 10);
    expect(atTiny.maxWidth).toBeGreaterThanOrEqual(0);
  });

  it("never exceeds OVERLAY_MAX_WIDTH_PX in any branch", () => {
    // Inline branch on an enormous viewport.
    const inline = ghostOverlayPlacement(
      { top: 0, bottom: 20, left: 0 },
      5000
    );
    expect(inline.maxWidth).toBe(OVERLAY_MAX_WIDTH_PX);

    // Flip branch on an enormous viewport (caret jammed against the far edge).
    const flipped = ghostOverlayPlacement(
      { top: 0, bottom: 20, left: 4999 },
      5000
    );
    expect(flipped.maxWidth).toBe(OVERLAY_MAX_WIDTH_PX);
  });
});
