# P5 re-judge v9 — aggregate verdict

**Date:** 2026-07-26 · **Build:** `9514c6f` (code head `1de4ef0`) · **Panel:** wf_17a70dc2-c37, 3 blind opus judges · **Bundle:** `p5-v9-judge-bundle.md`

## Verdict: **P5 = 6.0 UNCHANGED — floor cluster shrank 4 dims → 2. UNANIMOUS on every score that moved.**

| Dim | J1 | J2 | J3 | Consensus |
|---|---|---|---|---|
| **D1 onboarding-to-first-word** | **6** | **6** | **6** | **6.0 FLOOR — cold sign-up→first-word funnel never captured (pure evidence gap)** |
| D2 draft-safety | 6.5 | 6.5 | 6.5 | 6.5 |
| D3a keyboard | 6.5 | 6.5 | 6.5 | 6.5 |
| D3b touch | 6.5 | 6.5 | 6.5 | 6.5 |
| D4 model-comprehension | 6.5 | 6.5 | 6.5 | **6.5 — v8 dings remedied in-pixel, held below 7 only by D-148** |
| D5 responsiveness | 7 | 7 | 7 | **7.0 UNANIMOUS — dead-zone kill (4.4s→261ms) + felt chip + streaming** |
| D6 flagship quality | 6.5 | 6.5 | 6.5 | 6.5 (free-tier small-model = inherent ceiling) |
| D8 voice-fit | 6.5 | 6.5 | 6.5 | 6.5 |
| D9 retention | 6.5 | 6.5 | 6.5 | **6.5 — first-ever probe cleared the carry (real unstaged streak/plan data)** |
| D10 flagship presentation | 7 | 6.5 | 7 | **~7.0 — D-144 preview parity removed the last visible artifact** |
| **D11 failure-state honesty** | **6** | **6** | **6** | **6.0 FLOOR — D-137 immersive silent-wall (documented in-code) + inline-touch error surfacing uncaptured** |

Honesty audits: all three verified in-pixel/in-code rather than on assertion; accepted caveat = the 261ms figure is author-instrumented (mechanism code-proven, sub-second interval unscreenshotable).

## New registers (Fable-assigned from judge findings)
| ID | Sev | Finding |
|---|---|---|
| **D-149** | S3 | Retention loop is pull-only: comeback prompt/streak/dashboard all require the writer to re-open the app — no push/email/notification re-engagement channel exists. Judge-named D9 6.5→7 lever (feature gap, design-memo class). |
| **D-150** | S4 | Daily/Weekly Goal slots render inert "Set Goal" with no onboarding nudge — the goal→progress→streak loop never engages by default (J1+J2 same finding, different framing). |
| **D-151** | S4 | D-145 family: the server-ms figure lives in an HTML title tooltip — unreachable on coarse pointer (the persona's device class). |
| **D-152** | S4 | Writing Dashboard renders "Today's Words 458" directly above "Total Words 136" — activity metric vs manuscript total on one screen reads as a contradiction with no explanation. |
| — | — | Next free: **D-153**. |

## Lift path (judge-named, ordered)
1. **D1**: capture the cold first-run funnel — fresh user through write-first onboarding to first typed word (dev-bypass fresh identity; Clerk hosted screens out of dev harness scope, disclose).
2. **D11**: FIX **D-137** (cap-wall banner invisible under the z-[100] immersive overlay — documented silent-failure path, now floor-pinning) + inline-edit-on-touch error surfacing on camera.
3. D9→7: D-149 re-engagement channel (product decision — founder-call class); D-150 goal nudge (small).
4. D4→7: D-148 point-of-use model naming.
5. Ceilings above 7: prod latency measurement (D-128), inline-edit Stage-2 streaming, D6 model-quality ceiling is inherent to free tier.
