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

### P5 "Sam" — DONE (v1, pre-fix) 2026-07-20 → **3.5** (was 4.0, DOWN 0.5)
Fresh bundle `evidence/p5-sam-rejudge/`, blind 3-judge panel → 5.0 / 4.5 / **3.5** (adversarial trust). MIN-on-floors D2/D7 = 3.5. Aggregate: `P5-REJUDGE-AGGREGATE.md`; raw: `p5-raw-verdicts-rejudge.md`.
- Confirmed CLOSED: D-08 card-free on-ramp (201 create was 403), D-09/D-10 a11y, D-11/D-12 i18n.
- DOWN because the fresh adversarial capture caught the NEW on-ramp shipping 2 S2s the baseline never probed: **D-92** (deploy drift + 401-masks-500) + **D-95** (false privacy claim "never stores your content"). Both **NOW FIXED in-tree** (D-92b honesty sweep 9+3 handlers; D-92a dev `db:push` applied — `free_tier_usage` now synced; D-95 copy corrected) — pending Fable verify + commit.
- Evidence-integrity: Free-cap negative enforcement (2nd-book 403, export) was ASSERTED not driven (all 3 judges). v2 re-capture must drive the negatives + editor UI + working AI-assist.
- **3.5 is a PRE-FIX snapshot.** Rule 7 → P5 needs a v2 re-capture after the fixes land. Projected v2 band ~5–6. Current platform-MIN candidate.

### P4 "Priya" — DONE 2026-07-20 → **4.0** (was 4.0, FLAT)
Fresh bundle `evidence/p4-priya-rejudge/`, blind 3-judge panel → 3.5 / 4.0 / 5.0. MIN-on-floors: D5 (non-hard-floor) median = **4.0**. Aggregate: `P4-REJUDGE-AGGREGATE.md`; raw: `p4-raw-verdicts-rejudge.md`.
- **D-17 digest spend-lie CLOSED** (all 3 byte-level: 4-way spend agreement 0.048/0.155 + unit-lock RED→GREEN); **Gate-4 cap-halt PASS** (honest, skip-guard at dispatch, over-cap child $0); secrets PASS; worker-proof valid. D2/D7 lifted to 7.0–7.5.
- **FLAT because a 2nd honesty defect at the same severity surfaced:** **D-96** live-surface lies (`running` always 0, batch `status:queued`/`halted:false`/`spentUsd:$0` until terminal) = the D5 floor. Plus **D-97** (suspected) digest findings over-claim (43 vs 11; findings on a skipped chapter), **D-98** halted batch mislabeled "complete". → `fix-reviews/D-96-D-97-D-98-batch-live-honesty.md`.
- **D-20 chapter-create raw 500** confirmed open by all 3 → **FIXED + committed** this session (P2002→409). P4 bundle predates it → v2 spot-check on the 4xx.
- P4 v2 re-capture needed after D-96 lands (D5 → ~7 lifts P4's floor to D3/D11 ~5–6.5). Current platform-MIN candidate alongside P5.

### CODE LANDED 2026-07-20 (committed, RED-repro verified, tsc 0): honesty sweep (D-92b, 12 handlers) + D-20 (P2002→409) + D-95 (privacy copy). Fable verify hit its usage limit mid-review (cleared handlers structurally); team-lead completed the adversarial RED-repro (stash → 7 bug-cases fail → restore → 26/26 green).

### Env: dev `db:push` applied 2026-07-20 (D-92a) — DB now in sync with committed schema (additive, no data loss).

### v2 CONFIRM-THE-LIFT (founder ruled "prove the lift, then pause") — DONE 2026-07-20
Server + worker restarted on current code + Prisma client (`free_tier_usage` synced).
- **P4-v2** (`evidence/p4-priya-rejudge-v2/`): D-96 (live poll honest — running>0/status="running"/spentUsd>0/startedAt mid-run), D-98 (halted notification honest), D-20 (chapter→409) ALL **CONFIRMED-LIVE**; terminal 4-way spend NOT regressed ($0.148133655); no new defects. → P4 ≈ **5.5** (D5 floor 4.0→~7; new floor D3b/D8).
- **P5-v2** (`evidence/p5-sam-rejudge-v2/`): D-95 privacy copy + Free-cap 403 (driven) + export-ungated + billing→**200** (post-restart, re-verified) **CONFIRMED-LIVE**; trust floor D2/D7 3.5→~6.5. NEW floor **D-100 (S2)**: reasoning-model default (qwen3.6-27b) returns only thinking blocks at ghost-text budgets → 502, AI first-taste broken. → P5 ≈ **4.5–5.0** (floor now D11 via D-100).
- v2 numbers = team-lead rule-7 DELTA re-aggregation (lift confirmed dims over v1 panel, carry rest); fresh v2 3-panels can certify if wanted.
- New IDs: D-99 (stale server, RESOLVED), D-100 (AI-taste, OPEN — binding floor), D-101 (DEV_AUTH_BYPASS, dev-only). Register: `fix-reviews/D-99-D-100-D-101-p5v2.md`. Next free **D-102**.

**PAUSE-FOR-REVIEW: `evidence/judging/PAUSE-REVIEW-2026-07-20.md`** — new MIN ~4.5–5.0 (3.0 floor gone); systemic "truth-at-rest / lie-in-the-live-moment" pattern; open decisions (D-100 fix approach, re-judge P6/P8/P1/P7, certify v2, D-90/91, multi-cycle strategy).

### P6 Owen / P8 Rita / P1 Maya / P7 Bao — DONE 2026-07-20 (founder "ok continue")
Fresh captures (opus executors, committed `b64644a`) → TWO blind 3-panels each on the
identical cached bundles: opus panel (rate-limit fallback, cross-check) + **Fable panel
(verdicts of record)**. Cross-panel agreement within ±0.5 on every headline.
- **P6 Owen 5.0 → 6.0** (floor D4). 7 baseline defects CLOSED live; voice moat clean
  (0 misquotes, 6/6 devices). Binding residue: D-43 silent editor-model misroute,
  D-49 (narrowed), D-42.
- **P8 Rita 5.5 → 6.5** (floor D5). All 5 code defects re-proven closed; 34/34 fence
  probes hold. Caveat (all 3 judges): fences proven via E2E shim only — prod auth
  boundary untested (D-101 family).
- **P1 Maya 5.5 → 6.0** (floor D3b). D-04 + D-13 CLOSED live (suppression gate
  live-fired, first time in campaign). Judge corrections: turns 2/3 empty
  assistantMessage (D-104 S3), fresh-loop "honored" = absence-of-re-attempt only.
- **P7 Bao 5.0 → 7.0** (floors D3/D10). **D2 = 9.0 — first hard-floor dim at 9+**
  (judges re-derived from raw binaries: 80/80 sentinels ×3 exports, PDF 2-way).
Aggregates: `HELD-REJUDGE-AGGREGATE.md` (+ full 8-persona board); raw:
`held-rejudge-fable-raw.md`. New defects **D-102..D-114** assigned →
`fix-reviews/D-102-D-114-held-rejudge.md`. Next free **D-115**.

**PLATFORM (post-re-judge): MIN ≈ 4.5–5.0 (P5 via D-100)**; next P2 5.0 (stale
baseline carry — P2 is the remaining rule-7 re-judge debt). Baseline 3.0 floor GONE;
all 7 re-judged personas moved +0.5..+3.5.
