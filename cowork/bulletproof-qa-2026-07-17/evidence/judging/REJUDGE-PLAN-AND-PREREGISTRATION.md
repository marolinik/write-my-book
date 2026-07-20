# #47 Re-judge — plan + pre-registered projection (2026-07-20)

Pre-registered BEFORE re-capture (integrity: state the expected result first, then
measure). Founder ruled "run re-judge now" (corpus-gates = documented ceiling).

## Baseline being replaced (2026-07-19, 24/24 blind verdicts)
Platform MIN = **3.0** (P3 Selena). Personas: P1 5.5 · P2 5.0 · P3 3.0 · P4 4.0 ·
P5 4.0 · P6 5.0 · P7 5.0 · P8 5.5. Writer-trust gates 0/6.

## Rule-7 re-judge worklist (which verdicts are STALE → must re-capture + re-judge)
Protocol rule 7: any fix to shared paths (prompt-assembler / autosave / orchestrator /
queue / graph) forces re-judge of D1+D2+D8 + golden-path; never fold a stale verdict.
Fixes landed since baseline, mapped to the verdicts they invalidate:

| Fix cluster (this session + since 07-19) | Dims touched | Personas whose verdict is now stale |
|---|---|---|
| Graph/continuity moat: fix-7 a–d, D-79/80/81, D-83, D-89, D-30 tenant scoping + edge-purge migration | D8, D7, D2, D1 | **P3** (crater), P1, P6 |
| Honesty sweep: D-15/D-36/D-44/D-48/D-49/D-50/D-55/D-58 | D2, D7 | P1, P4, P6, P8 |
| Money-path: D-06, Z8/D-62, D-45 proration, Gate-4 overrun lock | D7 | P4, P8 |
| Data-integrity: D-46/D-47/D-57/D-59/D-61/D-56 | D2, D7 | P7, P8 |
| Onboarding: card-free on-ramp a7402c1 + D-51/52/53/54 | D4, D6, D3b | P4, P5, P6, P2 |
| a11y/i18n: D-09/D-10/D-11 + residuals | D6 | P1, P5 |
| Gate-1 offline autosave zero-loss harness | D2 (gate 1) | all |

Carry-forward (evidence genuinely unchanged): P7 D2=8.0 (data-safety-at-scale,
already the ceiling), P5/P8 D7 fencing 7–8, P6 D8=8.0 voice moat — all already-strong,
not degraded by any fix.

## Pre-registered projection (what the honest re-judge is EXPECTED to show)
- **P3 lifts out of the 3.0 floor.** D-19 (checks now fire), D-30 (tenant isolation),
  D-32a/c (self-disarm, event-name forking), D-27 (alias union), fix-7d/D-89 all
  landed + Fable-verified. Expected P3 band: **5–7** (moat now functions; residual =
  the LLM-nondeterminism gaps that remain design-bounded, and D-28/D-31 economics if
  unfixed). NOT 9.0+ (the moat works but is not yet best-in-class).
- **Honesty/money/data-safety dims rise** for P1/P4/P6/P7/P8 (the specific lies were
  closed): expect D2/D7 up ~1–2 points where those defects were the drag.
- **New platform MIN ≈ 5–7**, set by whichever persona now has the lowest residual
  floor (candidates: P4 batch/D5 perf, P5 D11 competitive-edge=4.0 [moats invisible
  pre-paywall — a positioning gap, not a defect], P3 residual). **NOT 9.5.**
- **Writer-trust gates:** likely 1–3/6 (Gate-1 zero-loss harness green; Gate-4 money
  overrun locked; Gate-6 CI W12). Gates 2/3 (voice/continuity statistical probes) stay
  documented-ceiling (corpora deferred). Gate-5 switch-test still ~sub-6/8.

## Why MIN 9.5 is out of reach this campaign (honest, not defeatist)
The metric is MIN-over-8 after floor caps: EVERY dimension of EVERY persona must clear
8.5 (D1/D2/D7/D8 clear 9.0). The fix-wave closed DEFECTS; it did not lift every
persona's every dimension to best-in-class. Remaining floor-cappers are structural /
product-positioning (D11 competitive edge, D5 perf feel, D3b ergonomy) + non-code
founder calls (switch-test, money-path certification, prod deploy gates). 9.5 is a
next-campaign target; this re-judge's honest job = prove the crater (P3) and the
honesty/money themes moved, and name the new binding floor.

## Execution order (fresh INDEPENDENT capture — rule 4; no self-authored deltas)
1. **P3 first** (it sets the MIN): fresh live re-capture of the continuity moat against
   the fixed product on :3002 as user_qa_p3 — seed contradictions across all 4 classes,
   confirm flags fire, tenant isolation holds, alias union durable, series sidebar. →
   blind Fable panel (func/exp/trust lenses) scores the fresh bundle.
2. Then P4/P6/P8/P1/P7 for the honesty/money/data-integrity/onboarding deltas.
3. Re-aggregate: replace stale verdicts, carry forward the unchanged strong dims,
   recompute MIN. Never fold a stale verdict (rule 7).

Status: pre-registration committed; P3 re-capture dispatched.

---

## RESULTS (appended as they land — do NOT edit the pre-registration above)

### P3 "Selena" — DONE 2026-07-20 → **6.5** (was 3.0)
Fresh bundle `evidence/p3-selena-rejudge/`, blind 3-judge panel (func/exp/trust) → **UNANIMOUS 6.5** (MIN-over-floors). Off the 3.0 floor exactly as pre-registered (band 5–7). Aggregate: `evidence/judging/P3-REJUDGE-AGGREGATE.md`; raw verdicts `p3-{functionality,experience,trust}-rejudge.md`.
- Confirmed CLOSED: D-19 (checks fire on real qwen3.6), D-30 tenant isolation (D7=8.0, raw before/after), D-28 fail-honesty; ZERO fired false positives (D8 8.5-cap does not bind).
- Panel-surfaced NEW defects (executor missed): **D-90** hallucinated-death over-inference (MEDIUM, latent-FP), **D-91** relationship_contradiction ch0/null-anchor (LOW-MED). → `fix-reviews/D-90-D-91-panel-surfaced.md`, follow-up track (non-binding on 6.5).
- P3 floor drivers = capture-gaps (D3/D6 NO-EVIDENCE — no UI captured), D5 dev-perf 6–7s cold reads, D9/D10 no flag-resolution lifecycle, D8 stochastic recall + max-signal-prose-only. Lifting P3→9.5 needs product work, not more closed-defect work.

### P4 Priya / P5 Sam — re-captures dispatched 2026-07-20 (in flight).
### P6 Owen / P8 Rita / P1 Maya / P7 Bao — held until MIN-candidates (P3/P4/P5) judged.
