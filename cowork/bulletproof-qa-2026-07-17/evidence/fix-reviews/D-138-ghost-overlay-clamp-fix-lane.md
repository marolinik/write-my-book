# D-138 fix lane — ghost overlay right-edge clamp/flip

**Date:** 2026-07-26 · **Branch:** `qa/bulletproof-2026-07-17` · **Fix commit:** `a97d025`
**Lane:** workflow `wf_c0887165-459` (17 opus agents: 1 implement · 3 review lenses · 12 adversarial refuters · 1 independent verify), Fable orchestrating/judging.

## Defect

D-138 (S3, registered in `judging/P5-REJUDGE-V6-AGGREGATE.md`): ghost-text overlay
(`src/components/editor/ai-ghost-text.tsx`) rendered `position:fixed` at the RAW
caret coordinates with hardcoded `maxWidth: 500px` and no viewport clamp. Caret
near the right edge of a 390px phone leaves a few px of width → suggestion wraps
one-word-per-line into a tall clipped column running under the bottom nav,
burying the D-132 "Tap to accept" pill. Longstanding (visible in pre-fix
captures too). Named cheapest D6/D10 lift by the v6 judge panel.

## Fix shape

New pure helper `src/components/editor/ghost-overlay-placement.ts`:

- `ghostOverlayPlacement(caret {top,bottom,left}, viewportWidth) → {top,left,maxWidth}`
- `availableInline = viewportWidth − 8 − caret.left`
  - `≥ 160` (inclusive) → anchor at caret, `maxWidth = min(500, available)`
  - `< 160` → **FLIP** to next line: `top = caret.bottom`, `left = 8`,
    `maxWidth = min(500, max(0, viewportWidth − 16))` — mimics natural text wrap
- Constants exported: `OVERLAY_MAX_WIDTH_PX 500` (pre-fix behavior preserved),
  `OVERLAY_EDGE_MARGIN_PX 8`, `OVERLAY_MIN_INLINE_WIDTH_PX 160` (flip threshold —
  judgement call, below it the column degenerates one-word-per-line at text-lg).
- Pure (viewport width is a parameter) → unit-testable; the component reads
  `window.innerWidth` in ONE `buildPlacement` callback that both anchor sites
  (pause-timer render + scroll/resize reposition) route through, so the
  clamp/flip decision cannot drift. Both suggestion spans (coarse + fine) and
  the D5 pending dots consume the computed placement.

Geometry probe (390px viewport): caret.left=350 → available 32 → flip →
`{top: caret.bottom, left: 8, maxWidth: 374}` — usable full-line width, pill
on-screen. Pre-fix: ~30px column.

## TDD

`tests/unit/ghost-overlay-placement.test.ts` written FIRST, ran RED (module
missing), then GREEN 6/6: desktop passthrough (exact `{top,left,500}`),
tight-inline clamp (< 500), flip case, inclusive boundary `available === 160`
(pins `>=` vs `>`), zero/tiny viewport floor (never negative), 500 cap in both
branches. Full suite **1357/1357 (163 files)** · `tsc --noEmit` 0.

## Review lane outcome

3 lenses (regression / geometry / interaction) produced 9 findings; **all 9
adversarially refuted, 0 confirmed fix-required**. Most were concern-cleared
self-reports (slop safety, rotation reclamp, D-134 banner untouched, D5 dots
tracking). Worth keeping on record:

| ID | Note | Status |
|---|---|---|
| D-138-R1 | Desktop parity is exact only when ≥ 500px room remains; nearer the edge maxWidth clamps below 500. Deliberate, strictly non-worsening (old cap overflowed off-viewport there). | Accepted behavior |
| D-138-R2 | Clamp/flip is RIGHT-edge only; negative/off-left caret (horizontal scroll, RTL) passes through exactly as pre-fix. Conscious scope decision, not a regression. | Accepted residual |
| D-138-RESIDUAL-VERTICAL | No vertical clamp/flip-up (caret at viewport bottom). Refuter showed the claimed under-nav mechanism doesn't occur as described; logged as edge-of-edge case. | Refuted / logged |
| D-138-TEST-GAP | No component test for "resize-flip during in-progress pointer gesture keeps slop verdict" — analytically safe (pointer-coord slop + implicit capture), no regression test pinning it. | Noted, low |

Independent verify agent: tsc clean · 39/39 targeted tests (join 14, placement 6,
error-surface 19) · wiring audit PASS (no residual hardcoded 500px on suggestion
spans; both coordsAtPos sites via helper; all three renders consume placement;
desktop path compared against `git show HEAD:`).

## Re-capture list (next judge round)

- Phone shot: caret near right edge → ghost renders flipped full-width line,
  "Tap to accept" pill visible (direct D-138 before/after vs shot 06/pre-fix).
- Same scene in landscape after rotation (reclamp on resize).
- This is the D6/D10 presentational lever named by the v6 panel — pair with the
  existing re-shoot list (first-pause banner, BYOK panel, meter before/after wall).
