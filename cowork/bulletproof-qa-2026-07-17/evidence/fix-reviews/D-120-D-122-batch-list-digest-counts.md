# Fix lane — D-120 (stale batch LIST route) + D-122 (digest counts auto-rejected dupes)

Branch `qa/bulletproof-2026-07-17`. Source register:
`fix-reviews/D-120-D-126-p4-rejudge-v3.md` (P4 re-judge v3, workflow `wf_64037713-2be`).
Scope: D-120 and D-122 ONLY. D-121 (Apply/anchor probe), D-123 (halted-digest
zero investigation), D-124/D-125/D-126 remain OPEN and untouched.

Method: TDD (RED first, both defects reproduced by failing tests against the
pre-fix source), then GREEN. Suite fully green after.

---

## D-120 · Batch LIST route served the raw stale `BatchRun` row

### Mechanism found

`GET /api/books/:id/batch` returned `db.batchRun.findMany(...)` rows verbatim.
The stored `BatchRun` columns (`status`, `spentUsd`, `halted`, `startedAt`) are
only reconciled by the fan-in digest (`batch-digest.ts` → `batchRun.update`), so
mid-run they read `queued / $0.00 / halted:false / startedAt:null` no matter how
much the batch has actually spent.

D-96 (`adfa592`, 07-20) fixed exactly this lie — but only in the SINGLE-batch
poll route (`batch/[batchId]/route.ts`), which derives the four values at read
time from the child `AgentSession` rows plus the live Redis halt flag. The list
route was never touched, so the capture caught the two routes disagreeing about
the same batch in the same instant (`poll-timelines/run1-summary.json`:
list row `status:"queued", spentUsd:0` vs detail `running / $0.0446`).

### Shape chosen

The register's own fix direction: **extract the D-96 derivation into a shared
helper and apply it per row in the list route**, terminal rows verbatim.

New module `src/lib/batch/live-batch-view.ts`:

- `TERMINAL_BATCH_STATUSES` — done | failed | halted | cancelled.
- `isBatchTerminal(row)` — terminal status **or** a stored `digest` **or** a
  stored `completedAt`. Both markers are optional on the input type so each
  caller can use whichever it selected: the digest job writes `status`,
  `digest` and `completedAt` in the SAME `batchRun.update`, so they are
  equivalent terminal signals. This is what lets the list keep the heavy
  `digest` JSON out of its payload (it selects `completedAt` instead).
- `deriveLiveBatchFields(row, children, liveHalted)` — pure, no I/O, no
  mutation. Terminal → stored values verbatim. Non-terminal → `status`
  `running` iff any child is running/completed else `queued`;
  `spentUsd = max(sum(child.actualCostUsd), stored)` (never regresses);
  `halted = stored || liveHalted`; `startedAt = stored ?? earliest non-queued
  child start`. Byte-for-byte the D-96 logic, now in one place.
- `readLiveHaltFlags(ids)` / `readLiveHaltFlag(id)` — best-effort
  `batch:{id}:halted` read over the shared app connection. Per-id try/catch
  with an explicit `console.error`; a failure degrades to "not halted" for that
  id only. Under-claims on a Redis hiccup, never fabricates a halt. Terminal
  batches never consult Redis.

`batch/[batchId]/route.ts` now imports the helper (≈70 lines of inline
derivation deleted, behaviour identical — its D-96 regression locks still pass
unchanged). `batch/route.ts` adds `startedAt` to its select, computes the
non-terminal id set, and loads child rows + halt flags for those ids only via a
local `loadLiveBatchInputs()`; when every listed row is terminal, **no** child
query and **no** Redis call happen at all.

### Residual / deliberate non-changes

- `haltReason` is still whatever the DB holds while a live-only halt is in
  flight — that is **D-124** (mixed halt signals), explicitly out of scope here.
  The list now inherits the same D-124 shape the detail route already had.
- Child rows are fetched with one `IN` query for all non-terminal ids (the list
  is capped at 20 rows, and non-terminal batches are typically 0–2). Halt flags
  use `Promise.all` of `get` (ioredis auto-pipelines them into one round trip)
  rather than `mget`, to keep the call identical to the D-96 path.
- No UI currently consumes the list route; the added `startedAt` field is purely
  additive.

---

## D-122 · Digest counted auto-rejected findings (7 claimed vs 5 real)

### Mechanism found

`CreateFinding`'s validation gate **persists** rejected findings as rejection
analytics — `src/lib/agents/tools.ts` → `executeCreateFinding`, on
`!validation.valid` it writes an `EditFinding` with `status:"rejected"` +
`rejectedAt` + `rejectionReason` and returns the reason to the model.

Every writer-facing surface already hides those rows:
`post-session.ts:176/356` (`status: { not: "rejected" }`), and the Findings
tab / badges / daily plan / dashboard all query `status: "pending"`.

The batch digest was the one reader that did not:
`batch-digest.ts` `db.editFinding.findMany({ where: { sessionId: { in: childIds } } })`
selected severity/category/chapterNumber with **no status filter**, so
`aggregateBatchDigest` counted gate-rejected rows into `findings.total`,
`bySeverity` and `byChapter` — and the morning `BookNotification` message is
built from `digest.findings.total`. Hence "7 findings" in the notification and
digest JSON beside "5" in the Findings tab in the same screenshot
(`screenshots/00, 02-04`), on exactly the trust axis an unattended overnight run
is judged on. All 3 judges filed it independently.

### Shape chosen

Count what the writer will actually SEE, and **name** the discarded rows rather
than silently dropping them (project rule: never silently swallow):

- `BatchDigestFindingInput` gains a required `status` field; the digest query
  selects `status: true`. Filtering in the pure aggregate (rather than in the
  Prisma `where`) keeps it to one query and keeps the split unit-testable.
- `aggregateBatchDigest` splits `visibleFindings` (status !== `"rejected"`) from
  the rest. `total` / `bySeverity` / `byChapter` are computed from the visible
  set only — so a rejected row can no longer invent a phantom chapter bucket
  either. New `digest.findings.suppressed` carries the gate-rejected count.
- Notification text: `· 5 findings (2 discarded as invalid)`; the parenthetical
  appears only when `suppressed > 0`, and a run with 0 visible + N suppressed
  now reads `0 findings (N discarded as invalid)` instead of an unexplained
  zero (relevant to the still-open D-123/D-126 silent-zero family).

Only `applied`/`dismissed`/`pending` count as visible — a finding the writer
triaged before the digest ran is still a finding they saw. This matches
`post-session.ts`'s existing `not: "rejected"` rule exactly.

### Residual / deliberate non-changes

- The gate keeps persisting rejected rows (they are useful rejection analytics
  and D-33/D-34 hardened that write). Only the COUNT was over-claiming.
- D-107-style dedupe suppressions are never persisted (early return before
  `create`), so they never inflated any count — the 7-vs-5 gap is exactly the
  two gate-rejected rows.
- `digest.findings.suppressed` is new on the `BatchDigest` type. Digests
  persisted before this change lack the key; nothing reads a stored digest as a
  typed `BatchDigest` (the poll route returns it as opaque JSON, no UI reads it),
  so there is no back-compat hazard.

---

## Files changed

| File | Change |
|---|---|
| `src/lib/batch/live-batch-view.ts` | NEW — shared read-time live derivation (D-120) |
| `src/app/api/books/[id]/batch/route.ts` | LIST route derives live values per non-terminal row (D-120) |
| `src/app/api/books/[id]/batch/[batchId]/route.ts` | uses the shared helper (D-96 behaviour unchanged) |
| `src/lib/agents/batch-digest-aggregate.ts` | visible-vs-suppressed split, `findings.suppressed` (D-122) |
| `src/lib/queue/batch-digest.ts` | selects `status`, passes it through, honest notification text (D-122) |
| `tests/unit/batch-route.test.ts` | +3 D-120 tests, 1 existing list assertion widened |
| `tests/unit/batch-digest-aggregate.test.ts` | +2 D-122 tests, fixtures carry `status` |
| `tests/unit/batch-lifecycle.test.ts` | +1 end-to-end D-122 digest+notification test |

## Tests

RED first: 7 failures against pre-fix source (list route returned `queued` /
stale spend / no halt; `findings.suppressed` undefined; digest total 7 not 5;
`select.status` absent).

New tests (6):

- D-120 list derives honest status/spend/halted/startedAt from child rows +
  live Redis flag, and scopes the child query to non-terminal ids.
- D-120 terminal rows verbatim — no child query, no Redis consult.
- D-120 a stored `completedAt` marks a row terminal even if `status` still says
  `running`.
- D-122 aggregate excludes gate-rejected rows from total/bySeverity/byChapter
  (no phantom chapter) and reports `suppressed`.
- D-122 all-rejected run → `total 0`, `suppressed N`, empty breakdowns.
- D-122 digest job end-to-end: selects `status`, digest total 5 / suppressed 2
  (pre-fix 7), notification says "5 findings … 2 discarded", never "7 findings".

Existing D-96 locks (terminal-verbatim, live derivation, no-Redis-on-terminal)
and the money-path locks all pass unchanged.

```
tsc --noEmit                     exit 0
eslint (8 touched files)         0 errors (1 pre-existing `_flow` warning)
vitest run                       174 files / 1440 passed  (was 174 / 1434)
```

## In-lane findings

1. **The list route had no `startedAt` in its select at all** — even after the
   D-96 detail-route fix, the list could not have told the truth about start
   time. Added.
2. **`completedAt` is a safe terminal marker** for `BatchRun`: it is written
   only by the digest job (`batch-digest.ts:188` and the failure path `:256`),
   never by the worker or the cancel route. This is what keeps the heavy
   `digest` JSON out of the list payload.
3. **`post-session.ts` already had the correct D-122 rule** (`status: { not:
   "rejected" }`, plus an info log naming the rejected count). The digest was a
   single missed reader of an existing convention — worth a grep sweep if any
   new EditFinding consumer is added.
4. `docs/mission/BATCH-SPEC.md:397` still shows the un-filtered digest query in
   its illustrative snippet. Left as-is (spec edit out of lane) but it is a trap
   for the next implementer.
