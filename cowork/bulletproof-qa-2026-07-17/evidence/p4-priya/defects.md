# P4 "Priya" — Defects

Evidence-only. Severity uses the campaign S-scale (S1 data-loss/overcharge/leak/bypass/crash > S2 journey-blocking/fabricated-output/false-positive > S3 friction > S4 cosmetic). Raw traces in `api-traces/` and `transcripts/`.

Registry check before filing: `git log --oneline -10` on `cowork/bulletproof-qa-2026-07-17/` + live grep of all `evidence/*/defects.md` and `evidence/*/_results.json`. First pass (stale) showed highest as D-15. Re-checked immediately before filing and found it had already moved twice: **D-16** claimed by p2-gerald (S1 racing-first-saves duplicate-`Document`-rows), **D-17** and **D-18** claimed by p3-selena in-file (continuity-flag extraction gap, chapter-collision raw-500) — but per team-lead 2026-07-18, **D-17 was actually already orchestrator-filed** for the exact `batch-digest.ts:199` `ledger.spentUsd` vs `effectiveSpent` defect below, before either p3-selena's or my in-file numbering caught up. **CORRECTION (team-lead, 2026-07-18): the finding below is NOT a new defect — it duplicates orchestrator-filed D-17.** Relabeled accordingly; my RED regression test is being kept as D-17's regression lock. Do not use D-16/D-17/D-18/D-19 for anything new — D-19 is p3-selena's moat-critical finding. Next free ID is provisionally D-21, to be confirmed with team-lead before filing (numbering is colliding across concurrent agents).

**Cross-reference, not a new filing:** while seeding Priya's book, `POST /api/books/{id}/chapters` for `chapterNumber:1` (book auto-creates a placeholder chapter 1) raw-500'd on the unique-constraint collision instead of a clean 4xx — this is the exact defect p3-selena already filed as **D-18**. Worked around by PUTting content onto the existing placeholder chapter instead of re-creating it. Not re-filed here; see D-18 for the canonical writeup.

---

## CONFIRMS D-17 (not a new filing) — Overnight batch "complete" notification reports $0.00 spent on a Redis ledger read failure, even though the real spend is correctly persisted elsewhere in the same code path

**Status: duplicate of orchestrator-filed D-17 (team-lead, 2026-07-18) — same exact line, `batch-digest.ts:199`.** Independently discovered here via code reading before I knew D-17 existed; keeping this writeup as corroborating detail and my RED test (`tests/unit/batch-digest-notification-spend.test.ts`) as **D-17's regression lock**. Do not count as a second defect.

**Class:** S2 — fabricated-output / journey-blocking for the "Return" step. Not a money-safety bug (no overcharge, no undercharge, no lost spend record) — the actual `BatchRun.spentUsd` DB field is correct. The defect is that the **user-facing notification text lies about it**, directly undermining exactly the promise P4's TEST-PLAN Return step grades: "the morning digest is the payoff — accurate, readable, actionable."

### Context: this is a residual gap in the already-fixed Z11

Z11 (commit `c9e97e7` per campaign log — batch digest falls back to DB spend when Redis ledger unavailable) fixed `src/lib/queue/batch-digest.ts`'s `processBatchDigestJob()` so that when the best-effort Redis ledger read (`readBatchLedger`, reading `batch:{id}:spent` / `:halted` / `:failures`) fails, an `effectiveSpent` value is computed as `Math.max(dbSpend, batch.spentUsd ?? 0)` (a DB-side sum of `actualCostUsd` across child `AgentSession` rows) instead of trusting the raw `ledger.spentUsd`, which `readBatchLedger` defaults to `0` on any Redis error (`{spentUsd:0, halted:false, failureCount:0, ledgerAvailable:false}`).

That fix is correct and complete for the **persisted** fields — `db.batchRun.update({ data: { spentUsd: effectiveSpent, ... } })` and the digest JSON both use `effectiveSpent`.

### The gap

The separate `db.bookNotification.create({ data: { message: ... } })` call in the same function — the one that produces the "Overnight batch complete" morning notification the writer actually reads — builds its spend string from the **raw `ledger.spentUsd`** directly, not from the already-computed `effectiveSpent` variable used two lines below for the persisted `BatchRun` row. `src/lib/queue/batch-digest.ts`, ~line 199 (notification message construction, in the same function as the `effectiveSpent` computation and the `db.batchRun.update` call that correctly uses it).

Net effect: on a Redis hiccup during the fan-in digest job, `BatchRun.spentUsd` (correct, DB-fallback value) and the digest JSON (correct) both show the real spend — but the notification bell/toast/inbox message the writer sees on login shows **`$0.00`**, even though real money was spent and is correctly recorded one query away.

### Proof (RED test, isolated regression, mirrors the existing Z11 test scenario)

New file `tests/unit/batch-digest-notification-spend.test.ts` (evidence-gathering only, not a fix — mirrors this repo's existing mock harness conventions: `vi.hoisted`, `vi.mock("@/lib/db")`, `vi.mock("@/lib/queue/connection")`, same shape as `tests/unit/batch-lifecycle.test.ts`'s Z11 test). Scenario: 2/2 child sessions complete successfully with `actualCostUsd` summing to a real $6.00, Redis ledger read forced to fail (`readBatchLedger` → `ledgerAvailable:false`, `spentUsd:0`).

Run: `npx vitest run tests/unit/batch-digest-notification-spend.test.ts`

Result: **FAILS (RED)** against current code —
```
AssertionError: expected '2/2 passes · $0.00 / $10.00 cap' to contain '$6.00'
```
The `BatchRun.spentUsd` assertion in the same test (mirroring Z11's existing coverage) **passes** — `effectiveSpent` correctly resolves to $6.00 for the persisted field. Only the notification message string is wrong. This isolates the defect precisely: it is not a recurrence of Z11, it is a second, narrower read of the same `ledger` object that Z11's fix did not touch.

### Why this bites Priya specifically

P4 Priya is a professional-tier, high-volume commercial author whose entire batch/overnight value proposition is: kick off a large edit run before bed, wake up, trust the digest to tell her honestly what ran and what it cost. A notification that silently reports `$0.00` on a transient Redis blip (not even a hard failure — Redis being briefly unavailable during exactly the fan-in window) means Priya could build a false mental model of her actual spend rate across multiple nights before ever noticing the discrepancy in the (correct) in-book digest or billing page. This is exactly the "fabricated output the user has no way to distinguish from truth" class of defect the campaign's S2 tier exists for — the notification says something specific and confident ($0.00) that is simply false, with no indication anything went wrong.

### Suggested fix (evidence-gathering only — not applied, per task constraints)

Use the already-computed `effectiveSpent` variable (not `ledger.spentUsd`) when building the notification message string, exactly as the `db.batchRun.update` call two lines below already does. One-line fix, same root fix shape as Z11.

### Live-journey relevance note

Not yet reproduced live against a real Redis outage during Priya's own batch run (would require intentionally killing Redis mid-digest, which is destructive to the shared QA environment and out of scope without explicit sign-off) — filed on the strength of the code trace + isolated RED regression test, per the same evidentiary standard the campaign has used for other Redis-failure-path defects. If Priya's own live Core-step batch run completes with Redis healthy throughout, its notification will show the correct amount and that will be recorded honestly in `journey-log.md` as a "did not manifest live, requires a Redis-failure condition" note — not claimed as a live repro.

---
