# D-96 / D-97 / D-98 — batch live-surface honesty (P4 panel-surfaced, 2026-07-20)

Surfaced by the P4 "Priya" rejudge blind panel (all 3 lenses). P4's baseline D-17 (digest $0.00 spend-lie) is CLOSED, but the panel found the LIVE mid-run surface has its own honesty problems — the floor that keeps P4 at 4.0.

## D-96 (S3, potential S2) — the live batch poll lies while terminal is honest
**Where:** `src/app/api/books/[id]/batch/[batchId]/route.ts` (poll) + `src/lib/queue/agent-worker.ts` (child status) + `batch-flow.ts` (batch status).
**What (verified across ~110 polls in 2 batches):**
- `counts.running` is ALWAYS 0 — children transition `queued → completed/failed/skipped` with no "running" state ever written. The poll route computes `running` from `AgentSession.status === "running"`, but the worker never sets that status.
- Batch-level `status` stays `"queued"` and `halted:false` while children are already terminal; `startedAt` null. The poll returns the raw `BatchRun` row, whose status/halted/spentUsd are only written by the fan-in digest job at the very end.
- Top-level `spentUsd` reads **$0.00 for the entire run** even after a child completed and billed, jumping to the true value only at terminal.
**Impact:** an actively-spending overnight run polls as "queued, 0 running, $0 spent" for minutes. Money is exact at rest (not a ledger bug), but the live surface Priya would watch is materially dishonest. If any dashboard renders mid-run `spentUsd` as spent-so-far, it becomes S2.
**Fix direction (prefer read-time, lower risk):**
1. Worker: set `AgentSession.status = "running"` when a child begins executing (before the first LLM turn), so `counts.running` reflects reality.
2. Poll route: derive the LIVE view from child rows + ledger at read time instead of trusting stale `BatchRun` fields — compute live `spentUsd` = sum(child.actualCostUsd), live `status` (running if any child running/queued and batch not terminal; halted if the ledger/halt flag is set), and set/return `startedAt` when the first child starts. Keep terminal reconciliation from the digest as the source of final truth.
TDD RED-first (assert a mid-run poll with 1 completed child shows non-zero spentUsd + running>0 + status!="queued"); Fable-verify; STOP-and-report if it perturbs the terminal reconciliation.

## D-97 (S3, SUSPECTED — confirm against source before fixing) — digest findings over-claim
**Where:** `aggregateBatchDigest` (in `src/lib/queue/batch-digest.ts`) findings aggregation.
**What:** cap-batch digest credited 2 findings to a chapter whose child was SKIPPED (never executed this run); per-chapter counts strictly superset the earlier run (ch1 10→29, ch2 1→12, ch3 0→2); total 43 vs 11 on identical 151-word input.
**Hypothesis:** the digest counts ALL persisted findings in the chapter range (cumulative book findings) rather than only THIS run's child outputs — so "43 findings" in Priya's morning message re-sells prior nights' findings as tonight's work. If confirmed, this is a digest-headline honesty defect (fabricated/inflated output the writer can't distinguish).
**Action:** read the findings source in `aggregateBatchDigest` — does it query findings by book/chapter range, or by this batch's `AgentSession` ids? If range-based, scope it to this run's sessions. Confirm with a RED test before fixing. Do NOT fix blind — it may be intended "current continuity findings for edited chapters."

## D-98 (S3) — halted batch mislabeled "complete" + "$0.00 cap" render
**Where:** `src/lib/queue/batch-digest.ts` notification construction (~line 180-203).
**What:** a budget-halted batch's notification title reads "Overnight batch complete" with no halt/haltReason in the human-readable `message` (only `priority` differs). Plus NEW-2: a sub-cent `budgetCapUsd` renders as `$0.00` via `toFixed(2)` in that same string.
**Fix:** title/message reflect halt when `halted` (e.g. "Overnight batch halted — budget cap reached"); show the cap with enough precision for sub-cent values (or omit the "/ $cap" when it would render $0.00). Small, well-scoped; TDD RED-first.

## Also noted (product decisions, not straight fixes)
- **NEW-B:** cap-overshoot bound documentation understates worst case (≈ concurrency × per-session-max, not "one per-child cost"). Correct the doc/comment; consider mid-flight cancellation on halt (behavior change → founder call).
- **J-4:** transient child failure has no retry — overnight run wakes to an unedited chapter. Retry policy = founder decision.
