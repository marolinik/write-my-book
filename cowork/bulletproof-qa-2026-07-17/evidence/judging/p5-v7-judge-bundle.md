# P5 re-judge v7 — blind judge bundle

**Date:** 2026-07-26 · **Build judged:** `72b6338` (fix commits `a97d025` D-138, `7657588` D-139, `01192a3` D5 Stage 1 + D-142) · **Persona:** P5 "Sam", free-tier phone-first writer (390x844, coarse pointer, seeded qwen36 default, no BYOK initially)

Judge instructions: score the ten P5 dimensions (D1–D11 minus D7, per prior rounds) 1–10 from THIS bundle + the referenced evidence files. Prior round v6 = 5.0 MIN (floors D5/D10/D11 at 5.0, D4-carry; D2 6.5, D3b 6.0). Be adversarial: the bundle self-reports gaps — verify claims against the evidence paths before crediting them.

## What changed since v6 (claims + evidence)

### D5 — responsiveness/latency honesty (was 5.0, floor)
Ghost text now STREAMS via a first-text-gate SSE (spec `fix-reviews/D5-ghost-streaming-spec.md`, design panel 9/8/9):
- Server holds the HTTP status until the first real text delta — reasoning-only/cut-off still answer real 422/502 JSON (no in-band lie); 429 wall unchanged pre-stream.
- **On camera** (`p5-wave-c/31a/31b/31c`, §v7 addendum of `CAPTURE-2026-07-25.md`): instrumented 100ms-poll timeline len 9→56→105→133→148→150→155 between t=5.5s and t=11.1s; `200 text/event-stream`; `Server-Timing: ttft;dur=1124` warm.
- Honest latency disclosure shipped: measured timing chip visible in 31c ("~6.7s"), >8s still-writing affordance in the cursor overlay, warmup ping on mount.
- DISCLOSED: TTFT distribution 1.1s / 5.9s (dev route compile, D-128 class) / **17.0s provider-side spike** (OpenRouter free-tier qwen36) — streaming + affordances make the spike visible, they cannot remove it. Run-3 wart: ~4.4s `finalMessage()` tail before accept arms (registered for Stage 2). Inline-edit still atomic JSON (Stage 2), but D-142 abort-billing fixed on both routes.
- Billing integrity preserved under streaming: bill-at-settle decision table (`src/lib/llm/quick-assist-stream.ts` header), 39 new tests, suite 1403/1403. **NEW D-142 fixed**: pre-fix, a typing-resumed abort completed server-side and still billed + advanced the free meter.

### D6/D10 — flagship moment presentation (D10 was 5.0, floor)
- **D-138 CLOSED on camera** (`28-phone-ghost-edge-flip.png`): caret at x=261 near right edge → overlay FLIPS to next line, left=8/top=caret.bottom/maxWidth=374 measured exact; pill fully visible. Pre-fix: one-word-per-line column burying the pill. Rotation reclamp proven numerically (`29`, run-1 log: inline left=655, maxWidth=180.578 = exact remaining room).
- **D-136 RECLASSIFIED** (`fix-reviews/D-136-adjudication-nextjs-dev-indicator.md`): the red "N Issues ×" pill in EVERY prior shot is the **Next.js dev-tools error indicator** (nextjs-portal shadow DOM; live probe + source sweep) — dev-server chrome the writer never sees in prod. Shots 30/31 are the first under the v8 protocol (portal hidden): bottom nav fully clean.

### D11 — failure-state honesty on phone (was 5.0, floor)
- **D-139 CLOSED on camera** (`30-phone-422-toast-top.png`): quick-assist toasts now top-center on ≤640px (measured top=80px, below chrome), desktop unchanged; same staged-422 protocol as v6 shot 27 (disclosed, reverted). Open Settings action intact.
- Wall banner (D-134) lifecycle unchanged and re-verified by the streaming lane's client-lens review.

### Registers/adjudications since v6
`fix-reviews/D-138-ghost-overlay-clamp-fix-lane.md` · `D-136-adjudication-nextjs-dev-indicator.md` · `D5-ghost-streaming-spec.md` (incl. D-142 register). New defects registered this wave: D-141 (S4 hydration-mismatch warning, unattributed), D-142 (S2 abort-bills, FIXED in `01192a3`). Next free: D-143.

## Disclosed gaps (unchanged from v6 unless noted)
- Inline-edit on touch: still NO camera evidence (registered re-shoot item; D-142 fix on that route is test-proven only).
- BYOK settings-panel first-run, first-pause banner shot, non-seeded manuscript run: still missing.
- D9 retention surfaces: bundle contains none (v5/v6 carry precedent applies).
- D-140 mid-clause accept: open (S4 design memo); accept-armed-on-done did not worsen it.
- All captures on dev :3001 with DEV_CLERK_ID bypass as Sam; Clerk-js CDN intentionally unreachable (fake publishable key) — see v6 harness notes.
- D5 evidence is dev-server; prod TTFT unmeasured (D-128 open).

## Scoring reminder
Floors last round: D5 5.0 · D10 5.0 · D11 5.0 · D4 carry · D9 carry. Everything above is claimed AGAINST those floors; verify, then score all ten dimensions with one-line justifications and name the new floor.
