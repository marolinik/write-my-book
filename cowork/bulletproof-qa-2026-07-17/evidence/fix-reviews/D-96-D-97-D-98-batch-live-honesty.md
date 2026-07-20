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

---

## RESOLUTION (2026-07-20, appended post-landing)

**D-96 FIXED + D-98/NEW-2 FIXED — commit `adfa592` (2026-07-20 09:36), on branch, ancestor of HEAD.**
- Worker: `agent-worker.ts` flips batch child to `status='running'` immediately after the
  budget/breaker skip-guard admits it (batch-only; non-batch sessions are created running).
- Poll route: non-terminal batches get a read-time derived live view (spentUsd = Σ child
  `actualCostUsd` floored by stored spend; status queued→running once a child is active;
  halted = DB column OR live Redis `batch:{id}:halted` via `readLiveHaltFlag`; startedAt from
  earliest non-queued child). Terminal batches return the digest-reconciled row verbatim
  (`TERMINAL_BATCH_STATUSES` + `digest != null` guard) — four-way spend agreement untouched.
- D-98: `batchNotificationTitle` says "Overnight batch halted — budget cap reached" /
  "— repeated provider errors" with haltReason in the message; NEW-2: `formatCapUsd` renders
  sub-cent caps at up to 4 decimals (trailing zeros trimmed), never "$0.00 cap".
- Suites at HEAD `8143694`: batch-route 25, batch-lifecycle 12, batch-budget 4,
  batch-digest-aggregate 8, agent-worker-batch-guard 7, worker-liveness 8 — **64/64 green**.

**D-97 = NOT-A-BUG in source (confirmed twice, independently).**
`aggregateBatchDigest` findings query is scoped to THIS batch's sessions —
`editFinding.findMany({ where: { sessionId: { in: childIds } } })` (batch-digest.ts:108 at HEAD);
child session ids are minted fresh (`randomUUID`) per enqueue in `batch-flow.ts`, findings are
tagged `sessionId: ctx.sessionId` at creation (tools.ts, post-session.ts). Identical-input
re-runs therefore CANNOT superset, and a skipped child contributes 0 (covered by an existing
lifecycle test). **Open contradiction:** the panel's live observation (43 vs 11 superset, skipped
child credited 2) is NOT explained by the source — it would require session reuse, which the
fan-out doesn't do. The P4 re-capture MUST re-probe this live (two identical-input batches on
fixed HEAD, compare digests) before D-97 is closed on the board.

**Process note — redundant Wave A workflow (`wf_2d1ff39d-7eb`, 2026-07-20 17:32-17:55).**
A later compaction-amnesic plan re-dispatched D-96/D-97/D-98 as open. Both opus lanes ran in
worktrees that the harness based on stale `main` (`478359c`, pre-batch-fix-waves — NOT the QA
branch) and re-implemented the fixes from scratch; both earned Fable-verifier APPROVE inside
their worktrees. Nothing was landed from them (HEAD already had `adfa592`); their sole banked
value is the D-97 not-a-bug source audit (re-confirmed against HEAD above) and an accidental
N=2 confirmation of the fix design. Patches archived in `wave-a-redundant-patches/`; journal:
old-session `workflows/wf_2d1ff39d-7eb` (both verdict objects embedded). Worktrees removed.
Lesson recorded: worktree-isolated executors MUST verify their base commit first.
