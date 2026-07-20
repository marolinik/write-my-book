# P4 "Priya" — Overnight/Batch — REJUDGE v2 SUMMARY (fix confirmation)

> Written by team-lead from the executor's returned report (harness guard blocked
> the executor from writing .md). Raw JSON traces are the load-bearing evidence.

**Run:** 2026-07-20 · LIVE http://localhost:3002 as P4 (`professional/active`, real
OpenRouter BYOK). One worker (`worker-proof.txt`, leaf PID 61892, restarted with the
D-96/D-98 code). No `src/` edits. No secret printed.

## Headline: ALL THREE FIXES CONFIRMED LIVE — no new defects. P4's D5 floor is lifted.

| Fix | Verdict | Proof |
|---|---|---|
| **D-96(a)** counts.running>0 mid-run | **CONFIRMED-LIVE** | `11_midrun_running_gt0.json`, `12_midrun_spent_gt0.json` |
| **D-96(b)** batch.status "running" mid-run | **CONFIRMED-LIVE** | `11_midrun_status_running.json`, `12_*` |
| **D-96(c)** batch.spentUsd>0 after a child billed, mid-run | **CONFIRMED-LIVE** | `12_midrun_spent_gt0.json` |
| **D-96(d)** batch.startedAt set | **CONFIRMED-LIVE** | `12_midrun_startedAt_set.json` |
| **D-20** chapter#1 collision → 409 | **CONFIRMED-LIVE** (was raw 500) | `02_d20_chapter1_collision.json` |
| **D-98** halted notification honest + precise cap | **CONFIRMED-LIVE** | `23_batch_cap_analysis.json`, `22_batch_cap_terminal.json`, `21_midrun_halted_true.json` |

### The single mid-run poll proving D-96 a/b/c/d at once
`12_midrun_spent_gt0.json` @ `2026-07-20T09:17:18.877Z` (`digest=null` ⇒ non-terminal):
```
batch.status    = "running"                 (was stuck "queued")
batch.spentUsd  = 0.03306792                (was $0 until terminal)
batch.startedAt = 2026-07-20T09:13:56.184Z  (was null)
counts.running  = 2   completed = 1         (was always 0)
```

### Terminal four-way spend agreement — NOT regressed. **$0.148133655**
`19_fourway_spend_agreement_final.json` (status=done): BatchRun.spentUsd = digest.spentUsd
= DB actualCostUsd sum (0.033+0.065+0.050) = 0.148133655; notification "$0.15 / $10.00 cap".
All 5 agreement checks true. Healthy title stays "Overnight batch complete" (correct —
D-98 only rewrites halted/failed/cancelled).

### D-98 honest halted notification ($0.002 cap batch)
`23_batch_cap_analysis.json`: title "Overnight batch **halted — budget cap reached**",
message "…halted at budget cap · $0.07 / **$0.002** cap" (v1 rendered "$0.00"), priority
high. Skip-guard honest: ch3 skipped, actualCostUsd null, never spent. Mid-run halted=true
surfaced live from the Redis flag before the digest persisted it (`21_midrun_halted_true.json`).

## New defects: NONE.
One non-defect note: under heavy shared-worker load the healthy batch took ~9.5 min
wall-clock (test-window artifact; terminal state + agreement correct — captured via a
finalize re-poll, `17`–`19`).

## Hygiene
Worker = exactly 1 (leaf PID 61892). No src edits. No secret printed (BYOK masked to
provider+validated).
