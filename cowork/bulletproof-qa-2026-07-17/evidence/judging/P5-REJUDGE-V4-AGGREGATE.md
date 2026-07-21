# P5 Sam — re-judge v4 aggregate (post-D-116..D-119 fix)

2026-07-21 · Blind panel, 3 independent Fable judges (func+reliability /
UX+experience / trust+MI), scoring the neutral bundle
`evidence/judging/p5-v4-judge-bundle.md` (live API/DB re-capture on fixed HEAD
`a129918`, dev-server labeled). Aggregation per GRADING-PROTOCOL: MIN on
D1/D2/D7/D8, median elsewhere; **dims with no NEW v4 evidence carry forward v3**
(a quick-assist routing fix does not touch save/onboarding/manuscript-intel/
design paths). One judge scored D8=3.0 from output-existence — DISCARDED as a
bundle artifact (no MI corpus supplied); D8 carries v3 6.5.

## Verdict

**P5 = 4.5 — UNCHANGED from v3.** Floored again by **D5 = D10 = D11 = 4.5**.

The code fix (D-116/D-117/D-118/D-119) is verified CLOSED as defects (live
re-capture + Fable APPROVE + 55/55 unit). It does **not lift the persona grade**:
the 4.5 floor is a phone-first **experience** cluster, and this capture is
API/DB-only. All 3 judges independently cap D5/D10/D11 on the same absent
evidence — no phone render of ghost-text-as-you-type, no streaming/first-token
cadence, cap-exhaustion wall untested for the 4th audit round.

| Dim | FUNC | UX | TRUST | v4 agg | rule | v3 | Δ |
|---|---|---|---|---|---|---|---|
| D1 Functionality | 6.5 | 6.5 | 6.0 | **6.0** | MIN | 6.0 | = |
| D2 Reliability | NE | NE | NE | 7.0 | carry v3 | 7.0 | = |
| D3 Usability | 5.5 | 5.5 | 5.0 | 5.5 | med | 6.0 | −0.5 (422 copy-fix unverified on screen) |
| D3b Ergonomy | NE | NE | NE | — | excl | — | |
| D4 Onboarding | NE | NE | NE | 5.0 | carry v3 | 5.0 | = |
| D5 Perf feel | 5.0 | 4.5 | 4.5 | **4.5 FLOOR** | med | 4.5 | = |
| D6 Look & feel | NE | NE | NE | — | excl | — | |
| D7 Trust & safety | 6.0 | 6.5 | 5.5 | 6.0 | MIN* | 6.5 | billing-honesty proven; cap/cross-tenant caveat unchanged |
| D8 Manuscript intel | NE | NE† | NE | 6.5 | carry v3 | 6.5 | = (out of fix scope) |
| D9 Retention | NE | NE | NE | 6.0 | carry v3 | 6.0 | = |
| D10 Delight | 5.0 | 3.5 | 4.5 | **4.5 FLOOR** | med | 4.5 | = |
| D11 Competitive edge | NE | 3.5 | 4.0 | **4.5 FLOOR** | carry v3 | 4.5 | = (no new competitive evidence; judges' 3.5/4.0 inferential) |

Judge headlines: **5.0 (D5) / 3.0 (D8-artifact→void) / 4.0 (D11)**. Grade = lowest
aggregated dim = **4.5**. `*`D7 MIN of engaged judges; not the floor. `†`UX D8=3.0
discarded.

## What the v4 capture PROVED (defects genuinely closed)
- **D-116 CLOSED**: ghost-text on the seeded reasoning default now returns real
  prose 200 (was 6/6 honest 422). Warm 1.99 s.
- **D-117 CLOSED**: inline-edit 200 with **98 output tokens** vs pre-fix
  **1655–3464** reasoning tokens on Sam's own key — the ~50–90× BYOK cost bleed
  is gone. Same table shows the qwen36→DeepSeek flip live.
- **D-118 (backstop) / D-119 (storage)**: 422 bills nothing; usage attributed to
  the resolved model id (D-44 contract intact); meter +on-success only.

## Why the grade did NOT move (the honest gap — all 3 judges concur)
The floor was never the *code*; it is **phone-first experience evidence**:
1. **D5 4.5**: cold ghost-text 12.6 s, non-streaming, no first-token cadence, no
   loading-state render. Warm 1.99 s is good but single-sample; absolute feel on
   a phone unwitnessed.
2. **D10 4.5**: the "magic" surface finally materializes, but *nobody saw it on a
   phone* — delight inferred from a 200 + token count.
3. **D11 4.5**: parity repair (removed two disqualifiers), not a demonstrated
   moat; incumbents stream sub-second; no would-switch-&-pay signal.

## New defects (register)
| ID | Sev | Finding |
|---|---|---|
| **D-127** | S3 | **Silent quick-assist model substitution — no point-of-use disclosure.** Sam's selected default (qwen3.6) is silently served by DeepSeek for ghost/inline and his BYOK key spent on it; the swap is discoverable only in billing records, and the one screen that would surface it (billing panel friendly-name) was not captured. All 3 judges flagged independently. NOTE: both models route through OpenRouter (same key/vendor) — the judges' "different vendor" framing is off; the real issue is undisclosed model choice override. This is the *intended* fix behaviour — fix = a small "quick suggestions use a faster model" disclosure, not a routing change. |
| **D-128** | S4/measure | Cold-start ghost-text 12.6 s vs warm 1.99 s (~6×). LIKELY a dev-server first-route-compile + OpenRouter cold-start artifact (not measured in prod). Not a confirmed prod defect — flagged for prod latency measurement + a warm-path check, not a code fix. |

Judge-noted, folded: over-scoped 422 copy (D-118) closure asserted only by the
card no-longer-firing on this model — the fixed copy string is unit-tested but
not re-rendered live (add to Wave C browser capture).

## Lift path (unchanged from v3 — this proves it)
The code fix was necessary but **insufficient for grade-lift**. P5 lifts only via
**Wave C browser/mobile capture** on this fixed build:
1. Phone render of ghost-text appearing as-you-type (D10) + loading state during
   the wait (D5) + the live 422 backstop copy (D-118 verify).
2. Free-tier **cap-exhaustion wall** — honest 402/copy vs silent 500 (D5/D7;
   Sam's core fear, 4 rounds unprobed).
3. Cross-tenant 403/404 under valid persona auth (D7).
4. D-127 disclosure affordance, then re-shoot billing panel (D-119 display verify).
5. Prod latency sample to resolve D-128 (cold vs warm).

Platform MIN stays **P5 = 4.5** until Wave C supplies the experience evidence.
