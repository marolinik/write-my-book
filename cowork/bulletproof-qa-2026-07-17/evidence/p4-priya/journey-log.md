# P4 "Priya" — Bulletproof QA Journey Log

**Target:** `http://localhost:3002`
**Persona:** user_qa_p4 (Priya, high-volume commercial author, Professional plan, active subscription, BYOK OpenRouter key validated)
**Book:** "Crown of Embers" — `e90b3494-ead4-472f-a34d-502c4b5b775c`
**Date:** 2026-07-18 (server clock, UTC)
**Method:** Raw HTTP via Python `urllib` (`p4_common.py` helper), headers `x-e2e-test-secret` + `x-e2e-clerk-id: user_qa_p4`. Every response read exactly once.

**Assignment:** p5-sam, task #7 — money-path + overnight/batch (BullMQ Flows) from a live persona's perspective: kick a batch job, watch digest/spend reporting, quota behavior, cost ledger. Distinct from P2 Gerald's W6 (Stripe checkout/dunning lifecycle, already covered). Cross-check (not re-litigate) `evidence/money-path-Z8-Z12.md` — Z8 (worker-crash re-spend, founder-decision) and Z12 (LiteLLM undeclared in compose, ops-backlog) against Priya's live journey.

Mission steps per TEST-PLAN.md P4 spec: Day-0 setup, Core (batch line-edit), Power (money gates: cap/circuit-breaker/cancel/tonight-schedule/24-child overnight), Edge (mutating-agent rejection, worker-death recovery, TTL, duplicate submission), Return (morning digest accuracy), Tier probe, cross-cutting X2 (batch + concurrent manual edit).

---

## ONE-WORKER RULE confirmation (GRADING-PROTOCOL §8)

Re-confirmed immediately before the Core batch's timing/behavior measurement (had been confirmed once already earlier in setup):

```
PowerShell: Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where CommandLine -match 'worker\.ts'
```
Exactly **one** leaf process: PID 37060, full chain `node.exe --require tsx/preflight.cjs --import tsx/loader.mjs src/worker.ts`. Same leaf PID previously confirmed during P1 Maya's D8 dev-edit-3 measurement earlier in the campaign — confirms no second worker spun up in the interim. **PASS.**

## Day-0 — Persona/environment setup

| id | method | path | status | expected | verdict | notes |
|---|---|---|---|---|---|---|
| d0-books | GET | `/api/books` | 200 | `[]` (clean slate) | PASS | Zero pre-existing books. `api-traces/00-books-inventory.json` |
| d0-subscription | GET | `/api/billing/subscription` | 200 | professional/active | PASS | `plan:"professional"`, `status:"active"`, `stripeConfigured:true`, `cancelAtPeriodEnd:false`. `api-traces/00-subscription.json` |
| d0-apikeys | GET | `/api/settings/api-keys` | 200 | ≥1 validated key | PASS | 1 validated OpenRouter key (`validatedAt` set). `api-traces/00-apikeys.json` |
| d0-book-create | POST | `/api/books` | 201 | 201 | PASS | "Crown of Embers", id `e90b3494-...`. `api-traces/01-book-create.json` |
| d0-seed-chapters | POST/PUT ×12 | `/api/books/{id}/chapters` + `.../content` | 201/200 | 12 chapters with real content | PASS (with one worked-around 500, see below) | `api-traces/01-seed-summary.json`, `01b-chapters-after-seed.json` |

**Note (folded into D-18 cross-ref, not a new finding):** the explicit `POST .../chapters {"chapterNumber":1,...}` call raw-500'd (`{"error":"Failed to create chapter"}`) because book-creation auto-creates a placeholder chapter 1 and the route doesn't map the resulting unique-constraint collision to a clean 4xx. This is the exact defect p3-selena already filed as **D-18** (chapter-number-collision raw-500 + the `POST /api/books` vs `POST /api/series/:id/books` auto-create inconsistency). Worked around by PUTting content onto the existing placeholder (`f62e5120-...`) instead of re-creating it. `api-traces/01c-ch1-content-fix.json`.

**Day-0 verdict: PASS.** Professional/active subscription confirmed, validated BYOK key present, clean 12-chapter draft seeded (~673 words total, intentionally short/rough — needs editorial passes, matching TEST-PLAN's Day-0 requirement).

---

## Core — Batch line-edit over 6 chapters (Now preset)

**HALT NOTE (2026-07-18, updated per team-lead correction):** team-lead ruled persona-journey dispatch/sequencing/worker ownership is orchestrator-only; p5-sam's task #7 assignment is retracted (task deleted). **Correction to my earlier "no contention occurred" note:** team-lead confirmed this batch *did* run concurrently with P3 Selena's moat journey on the same single worker — a real violation of the one-LLM-journey-at-a-time discipline (GRADING-PROTOCOL §8). My earlier claim was based only on the batch already showing terminal status by the time I checked; it does not mean the run was worker-isolated throughout its ~9m42s execution — Selena's extraction jobs were sharing the same worker during that window. Per team-lead: structural findings from this run that don't depend on worker isolation (fan-out topology, per-child status honesty, digest truthfulness, ledger-vs-actual) are kept as valid; all timing/throughput numbers are marked **CONTAMINATED-CONCURRENT** below. **P4 is HALTED** — no further batch steps (Power/Edge/Return/Tier-probe/X2, and specifically no 24-child overnight run) until team-lead re-assigns the journey directly in an isolated worker window. D-13 re-verify preempts P4 resumption entirely.

| id | method | path | status | expected | verdict | notes |
|---|---|---|---|---|---|---|
| core-batch-create | POST | `/api/books/{id}/batch` | 201 | 201, 6 children | PASS | `{"batchId":"cmrppydvq0000tk0f2yt0xw4b","childCount":6,"scheduledFor":null}`. `api-traces/02-batch-core-create.json` |
| core-batch-terminal | GET | `/api/books/{id}/batch/{batchId}` | 200 | terminal, 6/6 completed | PASS (structural only) | `status:"done"`, `completedCount:6`, `failedCount:0`. Runtime `createdAt` 01:59:42.278Z → `completedAt` 02:09:24.427Z (~9m42s wall clock) — **CONTAMINATED-CONCURRENT, do not interpret as isolated single-worker throughput**: P3 Selena's extraction jobs shared the same worker during this window. `api-traces/04-batch-precancel-status.json` |

**Fan-out visibility caveat:** the intended continuous poll loop (meant to record queued→running→completed transitions per child over time) had a bug — it read `body.status` instead of the correctly-nested `body.batch.status`, so it never detected the terminal state itself and looped uselessly until manually stopped (`TaskStop`) once the stand-down instruction arrived. Only the initial-create and final-terminal snapshots were captured; live fan-out transition visibility was **not** verified this run. Flagging honestly rather than claiming PASS on a dimension not actually observed.

**Digest accuracy (from the terminal snapshot, `batch.digest`):** `passes: {total:6, failed:0, skipped:0, completed:6}` — matches `completedCount`/`failedCount` exactly, no discrepancy. `spentUsd: 0.104841675` (real OpenRouter cost, matches `budgetCapUsd:10` cap headroom sanity — well under cap). `findings: {total:7, bySeverity:{suggestion:7}}` — all findings non-critical, none critical/blocking. **`statusAutoAdvanceSuppressed: true`** — confirms spec decision 7 (batch line-edit passes do not silently auto-advance chapter status) held: all 6 chapters' `status` remained `"undiscussed"` post-batch rather than being force-advanced to e.g. `"line_edited"`.

**Redis ledger vs. provider-actual cross-check:** not independently verified at the raw-ledger-key level (would require a second read of the raw Redis ledger keys alongside the DB `actualCostUsd` sum — not captured before halt). The `batch.spentUsd` and `digest.spentUsd` fields agree with each other (both `0.104841675`) and are both DB-derived sums scoped to Priya's own sessions — this figure is **not** contaminated by Selena's concurrent traffic (money ledger is user-scoped), only the *timing* of when the work happened is contaminated.

**Skip-guard / circuit-breaker:** not triggered this run (spend nowhere near the $10 cap, zero failures) — these require dedicated Power-step drills (at-cap batch, forced consecutive failures), which have not been run. Not evaluated either way, not claimed.

**Core verdict (partial, honest): structural dimensions PASS on what was actually observed (fan-out topology, per-child status honesty, digest truthfulness, auto-advance suppression, user-scoped ledger-vs-digest agreement) — but fan-out live-visibility over time is UNVERIFIED (poll-script bug), timing/throughput figures are CONTAMINATED-CONCURRENT (shared worker with P3 Selena), and skip-guard/circuit-breaker are untested.** Not counted as a completed journey step. **P4 HALTED per team-lead** — Power/Edge/Return/Tier-probe/X2 and the 24-child overnight run will not be attempted until team-lead re-assigns in an isolated worker window. D-13 re-verify has priority over P4 resumption.

