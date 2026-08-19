# P4 "Priya" — Rejudge Aggregate Verdict (2026-07-20)

Blind panel, 3 independent Fable judges (func+reliability / UX+experience / trust+safety-money-path), scoring `evidence/p4-priya-rejudge/`. Rubric + bundle only. Aggregation per GRADING-PROTOCOL: MIN-on-floors (D1/D2/D7/D8), median elsewhere.

## Headline

**P4 = 4.0** — floored by D5 (queue/live-progress honesty). **FLAT vs the 4.0 baseline.**

| Judge (lens) | Headline | Floor-driver |
|---|---|---|
| func + reliability | 3.5 | D5 3.5 |
| UX + experience | 4.0 | D5 4.0 |
| trust + safety (money) | 5.0 | D5 5.0 |

**Why FLAT despite closing D-17:** the baseline 4.0 was driven by D-17 (digest reported $0.00 spend on a Redis ledger read failure). That is **verifiably CLOSED** — all 3 judges byte-level re-derived the four-way spend agreement (BatchRun.spentUsd = digest.spentUsd = DB actualCostUsd sum = notification string) through a real failure AND a real halt, and the unit-lock is RED→GREEN. **But the fresh capture exposed a second honesty defect at the same severity the fix-wave never targeted: the LIVE mid-run surface lies** (D-96). Fix one lie, the floor relocates to the next unprobed one.

## Per-dimension consensus

| Dim | func / exp / trust | Consensus | Note |
|---|---|---|---|
| D1 Functionality | 6.0 / 7.0 / 7.0 | **6.0** (MIN, floor-dim) | batch loop completes twice; raw 500 on chapter collision (D-20) |
| D2 Reliability/data-safety | 7.0 / 7.5 / 7.5 | **7.0** (MIN, floor-dim) | terminal spend byte-exact through failure + halt; failed child $0; D-17 closed |
| D3 Usability | 5.0 / 4.5 / 6.0 | 5.0 (median) | raw-500 error contract; info-poor mid-run poll |
| D3b Ergonomy | 5.0 / 5.5 / NO-EV | 5.25 | one-POST kick good; "$0.00 cap" render |
| D4 Onboarding | NO-EVIDENCE | — | established professional user |
| D5 Perf / QUEUE HONESTY | 3.5 / 4.0 / 5.0 | **4.0** (median) — THE FLOOR | children never "running", batch stuck "queued", live spentUsd $0, halted:false until terminal |
| D6 Look & feel | NO-EVIDENCE | — | zero UI evidence in bundle |
| D7 Trust & safety | 7.0 / 7.5 / 7.5 | **7.0** (MIN, floor-dim) | tier gate, strict BYOK, cap halt honest, skip-guard proven at dispatch, secrets clean |
| D8 Manuscript intel | NO-EV / 5.0 / NO-EV | 5.0 | only finding counts, no content; provenance anomaly (D-97) |
| D9 Retention | NO-EV / 5.5 / 6.0 | 5.75 | core habit loop demonstrated twice, single-loop |
| D10 Delight | NO-EV / 5.0 / NO-EV | 5.0 | honest digest line, terse not delightful |
| D11 Competitive edge | 5.5 / 6.5 / 6.5 | 6.5 | honest per-batch money accounting + BYOK + cap is a real edge; live surface lags a CI dashboard |

**P4 grade = 4.0** (floored by D5).

## Confirmed CLOSED / STRONG (all 3 judges byte-level)
- **D-17 digest spend-lie — CLOSED.** Four-way spend agreement re-derived independently (0.04786332 healthy; 0.15510135 cap-halt); notification honest non-zero; unit-lock RED→GREEN with the Redis-down path exercised in-test.
- **Gate-4 budget-cap halt — PASS (honest, not S1).** Over-cap child skipped with `actualCostUsd:null`, never billed; skip-guard fires at dispatch; `haltReason:"budget_cap"` persisted. Trust judge confirmed the S1 test passes.
- **Failed child honesty:** 0 turns, $0 charged, digest truthfully 2/3 — a positive honesty signal, not a masked failure.
- **Secrets: PASS** (all 3 judges grepped; BYOK dumped provider+validated only).
- **Worker-proof VALID** (one leaf PID 58460, re-confirmed before each batch) → measurements not void.

## Floor-driving + new defects (panel-surfaced)
- **D-96 (S3, potential S2) — live-state observability lies.** All 3 judges confirmed + elevated the executor's NEW-1: across ~110 polls in two batches, `counts.running` is ALWAYS 0 (children go queued→completed, never "running"), batch `status` stays "queued" and `halted:false` while children are terminal, `startedAt` null, and top-level `spentUsd` reads **$0.00 the entire run** after real committed spend. Terminal truth is exact — so this is stale/digest-time-only aggregation, not fabrication — BUT an actively-spending overnight run polls as "queued, 0 running, $0 spent" for minutes. Trust judge: "if the dashboard renders mid-run spentUsd as spent-so-far, this becomes S2." Root: the poll route (`batch/[batchId]/route.ts`) returns raw `BatchRun` fields (only written at digest fan-in) + counts `running` from a status the worker never writes. → **FIX (P4 floor).**
- **D-97 (S3, suspected) — digest findings provenance / over-claim.** Cap-batch digest credits 2 findings to a chapter whose child was SKIPPED (never executed), and per-chapter counts strictly superset the earlier run (ch1 10→29, ch2 1→12) — total 43 vs 11 on identical 151-word input. Suggests the digest counts cumulative persisted findings in range as THIS run's output, over-claiming the batch's work in Priya's morning message. → investigate `aggregateBatchDigest` findings source; fix if confirmed (honesty of the digest headline number).
- **D-98 (S4→S3) — halted batch mislabeled "complete".** The halted-at-cap notification title reads "Overnight batch complete" with no halt/haltReason in the human-readable string (only `priority:"high"` differs). On the trust-critical money surface. → fix the title/message to reflect halt.
- **NEW-B (S3, trust judge) — cap-overshoot bound misdocumented.** Observed overshoot = both concurrently-admitted children ($0.153 over a $0.002 cap), i.e. ≈ concurrency × per-session-max, NOT the "at most one per-child cost" the script header claims. The halt is honest; the documented bound understates worst case. → correct the documented bound (+ consider mid-flight cancellation on halt). Doc/accuracy, not a live money bug.
- **D-20 (S2/S3) — chapter-create raw 500** confirmed open by all 3 → **FIXED** this session (P2002→409, committed with the honesty sweep). P4 bundle predates the fix → P4 v2 spot-check on the 4xx.
- **NEW-2 (S4) — sub-cent cap renders "$0.00 cap"** via toFixed(2) on the notification. → fold into D-98's message fix.
- **J-4 (S3) — transient child failure, no retry** → waking to an unedited chapter; honestly reported but a real overnight-product gap. Retry policy = product decision.

## "Suspiciously clean?" — consensus
**Not suspiciously clean.** The bundle preserves a live raw 500, a genuinely failed child, a 77× cap overshoot, ~9-minute queue stalls, float noise, and self-filed defects; agreement figures are script-computed from independent HTTP+Prisma sources; worker-proof double-captured. Missing: any UI render proof (every "what Priya sees" ends at a DB row — so D-96's user-facing severity can't be pinned), live Redis-outage digest (unit-lock only, disclosed), cancel-mid-run, worker-crash-mid-child recovery, concurrent-batch collision, scale test (both runs were 3 tiny 151-word chapters vs the persona's real 30-chapter shape), and finding CONTENT (only counts).

## Bottom line
Terminal money truth is now genuinely bulletproof — four surfaces byte-identical through failure and halt, skipped work provably unbilled, secrets clean (D2/D7 7.0–7.5). But P4 stays at its 4.0 baseline because the **live** overnight surface still lies by omission (D-96: $0 spent / nothing running / not-halted while money burns), and D-20 raw-500 was open at capture. **D-20 is already fixed; D-96 is the P4 floor and the fix target.** Once D-96 (+D-97/D-98) land and a P4 v2 re-capture runs, D5 should lift to ~7 and P4's floor moves to D3/D11 (~5–6.5). P4 is a current platform-MIN candidate alongside P5.
