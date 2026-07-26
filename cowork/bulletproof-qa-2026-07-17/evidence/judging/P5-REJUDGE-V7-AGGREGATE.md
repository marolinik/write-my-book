# P5 re-judge v7 — aggregate verdict

**Date:** 2026-07-26 · **Build:** `72b6338` · **Panel:** wf_f132a332-f8e, 3 blind opus judges (floor-hunter / writer-advocate / evidence-auditor), Fable aggregating · **Bundle:** `p5-v7-judge-bundle.md`

## Verdict: **P5 = 5.0 UNCHANGED — but the floor moved.**

| Dim | J1 | J2 | J3 | Consensus |
|---|---|---|---|---|
| D1 onboarding-to-first-word | 6 | 6 | 6 | 6.0 |
| D2 draft-safety | 6.5 | 6.5 | 6.5 | 6.5 |
| D3a keyboard flow | 6.5 | 6 | 6.5 | 6.5 |
| D3b touch flow | 6.5 | 6 | 6.5 | 6.5 |
| **D4 model-comprehension (carry)** | **5** | **5** | **5** | **5.0 = FLOOR** |
| D5 responsiveness/latency-honesty | 6.5 | 6.5 | 6 | 6.5 |
| D6 flagship-moment quality | 6.5 | 6 | 6.5 | 6.5 |
| D8 voice-fit | 6 | 6 | 6 | 6.0 |
| D9 retention (carry) | 6 | 6 | 6 | 6.0 |
| D10 flagship presentation | 6.5 | 6 | 6.5 | 6.5 |
| D11 failure-state honesty | 6 | 6 | 6.5 | 6.0 |

**Unanimous on every load-bearing point:**
- The v6 floor cluster (D5/D10/D11 @5.0) is **genuinely cleared** — every judge verified on camera + in source: D5 5.0→6/6.5 (tokens flowing 31a-c, first-text-gate real statuses, bill-at-settle, D-142), D10 5.0→6/6.5 (edge-flip 28 vs buried column 20, clean nav under v8), D11 5.0→6/6.5 (top-center 422 toast 30 vs occluded 27).
- The grade is pinned by **D4 alone — a carry never probed in seven rounds**. All three name the same cheap-evidence remedy: BYOK/settings first-run on camera, first-pause banner, meter before/after a walled call, non-seeded manuscript run. Evidenced writer-felt experience is ~6.0–6.5 today; probing D4 is the whole gap.
- Honesty audits: bundle "unusually and verifiably honest"; soft-pedals called out = the 4.4s tail's true severity, the chip under-reporting felt latency, streaming shots captured over probe-dirty prose (flagship cleanliness rests on 28), staged-422 unreachability.

## New defects registered (consensus of ≥2 judges unless noted)

| ID | Sev | Finding |
|---|---|---|
| **D-143** | **S3** | finalMessage settle-tail dead-zone (~4.4s in run 3): suggestion fully rendered, pill absent, tap/Tab silently inert until the done frame — reads as a hang on the flagship moment. All 3 judges demand re-rating from "Stage-2 wart". Fix direction: settle/arm from the accumulated stream + message_delta stop_reason instead of awaiting full finalMessage, or write the done frame before the billing DB writes. |
| **D-144** | S4 | Ghost PREVIEW renders flush against the preceding word ("andthe black beyond") — D-130 space-join applies at accept, not in the preview, so the overlay misrepresents the joined result (J1+J3). |
| **D-145** | S4 | Timing chip under-reports felt latency: shows server elapsedMs (~6.7s) while pause-to-acceptable was ~9–11s (debounce + tail + render outside the number) — honesty nuance inside the honesty affordance (all 3). |
| **D-146** | S4 | Chip is slow-only (>2.5s gate): writer sees a number only when it's bad, never a reassuring fast one — asymmetric disclosure, design-memo candidate (J1+J2). |
| **D-147** | S4 | Vertical clamp gap formalized (J2, on camera in 29): D-138 clamp/flip is horizontal-only; post-rotation a ghost near the viewport bottom renders below the fold. Was logged as refuted-residual in the D-138 lane; now has camera evidence. |
| — | — | Mid-word truncation at done (J3) = existing **D-140**. Next free: **D-148**. |

## Lift path (unanimous, ordered)
1. **D4 probe wave** — the only floor: BYOK first-run + model-picker comprehension on camera, first-pause banner, meter before/after wall, non-seeded manuscript run. No code required; pure capture. Expected outcome per J1: grade jumps to the evidenced ~6.0–6.5 cluster.
2. **D-143 fix** (S3) — kill the accept-arming dead-zone; biggest remaining D5/D10 feel-wart.
3. D-144/D-145 quick client fixes (preview join-space; chip measures felt latency end-to-end).
4. Inline-edit on touch + streaming (Stage 2) — recurring D1/D3b cap.
5. Above ~6.5: judges signal the next ceiling is substance, not defects — non-seeded creation flow, retention surfaces (D9 can't carry forever), prod-measured latency (D-128).
