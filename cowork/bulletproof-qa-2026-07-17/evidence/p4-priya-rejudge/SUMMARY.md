# P4 "Priya" — RE-JUDGE evidence bundle (LIVE)

**Persona:** P4 Priya — professional-tier, high-volume commercial author. Value prop = overnight/batch: kick a big edit run, wake to an HONEST digest of what ran + what it cost.
**Target:** live dev server http://localhost:3002, one worker (src/worker.ts, PID 58460), real Redis + Postgres, real qwen3.6 spend via Priya's own validated OpenRouter BYOK key.
**Date:** 2026-07-20 (UTC).
**Method:** idempotent tsx scripts (scripts/*.ts) over real HTTP with x-e2e-test-secret + x-e2e-clerk-id: user_qa_p4; raw JSON dumped to api-traces/NN_*.json. Notification text (no HTTP route exists) read straight from the persisted BookNotification row via the app Prisma client — the exact row the dashboard renders.
**Constraints honored:** no src/ edits; secret read from process.env (via --env-file=.env) and sent only in a header — never printed/dumped; one-worker proof captured (worker-proof.txt); every miss preserved raw.

---

## Headline — did the two baseline drivers close on LIVE evidence?

| Baseline driver | Closed? | Proving evidence |
|---|---|---|
| D-17 — batch digest notification reports fabricated $0.00 spend on a Redis-ledger read failure | YES — CLOSED | Unit lock RED->GREEN (unit-lock-output.txt); source batch-digest.ts:199 now uses effectiveSpent; LIVE healthy batch four-way spend agreement (api-traces/13_threeway_spend_agreement.json) |
| D-18 / D-20 — POST /api/books/{id}/chapters chapter-number collision returns a raw 500 (not a clean 4xx) | NO — STILL OPEN | LIVE repro: raw 500 {"error":"Failed to create chapter"} (api-traces/02_d18_chapter1_collision.json); source chapters/route.ts has no P2002 handling; no fix commit exists |

> Registry note: the task calls the collision defect "D-18", but in the campaign registry D-18 = a DIFFERENT defect (OS-command-injection in export, d2d33f0, fixed). The chapter-collision defect is registry D-20 (52ce465, filed by p3-selena) and remains unfixed. See defects.md.

### Unit-lock result (verbatim, one line)
`+ tests/unit/batch-digest-notification-spend.test.ts (1 test)` -> Test Files 1 passed / Tests 1 passed (baseline was RED: expected '...$0.00...' to contain '$6.00'). Full output in unit-lock-output.txt.

---

## Money-path (Gate-4) — LIVE budget-cap halt: PASS (honest)

Drove a real batch with a deliberately tiny aggregate cap (budgetCapUsd = $0.002) over 3 chapters. Terminal digest (api-traces/23_batch_cap_terminal_final.json):

- status: "halted", halted: true, haltReason: "budget_cap" — the batch halted honestly.
- Over-cap child ch3 marked skipped, $0 spent — the skip-guard refused it, never billed (api-traces/22_*, 24_*).
- Spend three-way agreement holds again: BatchRun.spentUsd = digest.spentUsd = DB actualCostUsd sum = 0.15510135.
- Bounded overshoot, not runaway: 2 children ($0.109 + $0.046) completed before the halt landed -> $0.155 on a $0.002 cap. This is the DOCUMENTED bound cap + (concurrency-1)*maxPerSessionCap (worker concurrency = 2; see src/lib/agents/batch-budget.ts header). Money did NOT run away to the unbounded sum of all children — the 3rd was skipped.
- Gate-4 regression lock tests/unit/agent-worker-one-worker-overrun.test.ts: 5/5 passed (unit-lock-output.txt).

Proration (D-45, Stripe-webhook path): NOT-TESTABLE read-only without triggering real Stripe charges — not attempted, per constraints.

---

## Dimension evidence captured

- D1 batch journey completes — healthy batch reached done (2/3, 1 transient provider fail); cap batch reached halted. api-traces/11_*, 23_*.
- D2 reliability & data-safety (the big one) — digest HONEST on every axis: partial run reported as 2/3 passes (not silent-green), failed child charged $0, spend figure non-zero and identical across BatchRun/digest/DB/notification, statusAutoAdvanceSuppressed:true. No fabricated spend, no lost spend record. api-traces/13_*, 11_batch_healthy_terminal.json.
- D5 performance feel / queue honesty — all latencies are dev-server + shared-worker-contention (many concurrent campaign agents on the single worker); do NOT read as isolated throughput. Two honest queue-honesty observations recorded. defects.md NEW-1.
- D7 trust — tier gate respected (plan:"professional", status:"active"); spend accounting truthful end-to-end; strict BYOK (Priya's own validated OpenRouter key). api-traces/00_subscription.json, 00_apikeys_masked.json.

## NEW findings (raw, low severity — see defects.md)
- NEW-1 (S3, queue-honesty): batch children never transition to status:"running" — an actively-executing, spending child shows as queued in the poll API until it completes. Money accounting stays exact; only live progress under-reports.
- NEW-2 (S4, cosmetic): a sub-cent budgetCapUsd renders as $0.00 in the digest notification message ("$0.16 / $0.00 cap") via toFixed(2). Only reachable with an unrealistic <$0.005 cap; digest DATA shows the true 0.002.

## Observation (NOT a defect)
Healthy-batch child ch3 failed fast with 0 turns / $0 cost — a transient provider failure at spawn, honestly resolved to failed (D-36 behavior), zero charge, digest truthfully 2/3. Positive honesty evidence. Likely amplified by concurrent-agent load on the shared worker.

## Evidence index
- worker-proof.txt — one leaf worker (PID 58460), captured before each batch measurement.
- unit-lock-output.txt — D-17 lock GREEN + Gate-4 lock 5/5, verbatim.
- api-traces/00_* setup/tier/BYOK; 01_* book; 02_* D-18 repro; 03_* seed; 10-13_* healthy batch (D-17 live); 15_* failed-child probe; 20-24_* Gate-4 cap halt.
- scripts/*.ts — the drivers. journey-log.md — step log. defects.md — raw findings.
