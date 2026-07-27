# Fix lane — D-125 (batch cap input) + D-186 a/b/c (cancel + LIST staleness family)

Branch `qa/bulletproof-2026-07-17`. Source register:
`judging/P4-REJUDGE-V4-AGGREGATE.md` (P4 re-judge v4, 6.0 unanimous) — the
panel's 3/3 next-action consensus was "ONE instrumented live batch drill on a
fixed build, **land the D-125 rider first** so the halt path is drivable on
camera". Prior lane: `fix-reviews/D-120-D-122-batch-list-digest-counts.md`.

Scope: **D-125** and **D-186 (a+b+c)** ONLY. D-121 (Apply/anchor probe), D-123
(halted-digest zero), D-124 (mixed halt signals), D-126 (near-zero rerun) and
D-187 (no batch-history UI) remain OPEN and untouched — they are capture/probe
items, not code items, and the drill this lane unblocks is what closes them.

Method: TDD, RED first (14 failing assertions against pre-fix source), then
GREEN. Full suite re-run at the end.

---

## D-125 · The budget cap the UI forbade but the code allowed

### Mechanism found

`batch-editorial-dialog.tsx` rendered the cap field as `min={1} step={1}` while
its submit gate was `cap <= 0 || cap > MAX_CAP_USD` and the API's own rule is
`Number.isFinite(cap) && 0 < cap <= 25`. Three different contracts on one
value. Consequences, both filed by the panel:

1. **The halt path was UI-unreachable.** A budget halt is only observable if the
   cap is small enough that the FIRST child trips it (a real dev-edit child runs
   ~$0.04). Every such cap is sub-dollar — and the field said sub-dollar was
   forbidden, so the halt could only ever be driven by a hand-rolled API call.
   That is precisely why D-123 (halted-digest 0 findings) and D-126 (near-zero
   rerun) have gone four re-judges without a probe: the writer-facing route into
   the halt state did not exist.
2. **The block was invisible-ish and mis-worded.** Nonsense input produced a
   `toast.error` naming a range ("between $0 and $25") that matched neither the
   rendered constraint nor the enforced one, with no `aria-invalid`, no
   field-level message and no focus move.

Secondary mechanism found while writing the RED test: the cap was held in
NUMBER state (`setCap(Number(e.target.value))`), so an empty field silently
became `0` and every intermediate decimal keystroke round-tripped through
`Number`. (React's loose `!=` comparison for `type="number"` inputs happens to
preserve `"0."`, which is why a typed `0.25` *did* survive — the code-only half
of the defect the panel called out.) Relying on that quirk for a money field is
not a contract; the field now holds the raw string.

### Shape chosen

One source of truth for the bounds, exported and unit-tested:

- `MIN_CAP_USD = 0.01`, `CAP_STEP_USD = 0.01`, `MAX_CAP_USD = 25` (unchanged).
- `parseBatchCapUsd(raw)` — pure, returns `{ok:true, value}` or
  `{ok:false, error}`; trims, rejects empty/non-finite/out-of-range. The
  rendered `min` / `step` / `max` are the SAME constants, so what the field
  advertises is what the gate enforces.
- Field state is the raw typed string (`capInput`), parsed once at submit; the
  POST body carries `parsedCap.value`.
- Refusal is now the D-154 shape: inline `role="alert"` message naming both
  bounds, `aria-invalid="true"` on the input, `aria-describedby` swapped from
  hint to error, and focus moved to the field (which also scrolls it into view
  on a phone). The block clears on the next keystroke.
- Helper copy now names the floor as well as the ceiling: `$0.01–$25`.

### Residual / deliberate non-changes

- **Sub-CENT caps (e.g. $0.005) stay API-only.** The server contract is
  unchanged (`> 0`), the UI floor is one cent, and the two disagree only in the
  direction of "the field offers cent granularity". $0.01 is sufficient to trip
  the halt on the first child (~$0.04 >> $0.01), which is what the drill needs.
  Moving the UI floor to $0.001 is a one-constant change if the panel wants
  literal sub-cent in pixels.
- "Pick at least one editorial pass" keeps its toast — it is not a field-level
  error, and the toaster placement was fixed under D-139.
- The dialog stays hard-coded English like the rest of this component; no
  `ui-strings` entries were added (another lane owns that file this session).
- `spentUsd.toFixed(2)` in the progress panel still collapses a sub-cent spend
  to `$0.00`; the CAP figure is what D-98 fixed. Left as-is, out of lane.

---

## D-186a · The "$0.00 cancel" money lie

### Mechanism found

`POST .../batch/:batchId/cancel` set the Redis halt flag and wrote
`{ status: "cancelled", halted: true, haltReason: "cancelled" }` — and nothing
else. But `cancelled` is TERMINAL, and the shared live view's rule 1 (D-96,
D-120) is *terminal rows are served VERBATIM, never re-derived*. So the cancel
click flipped the batch into the one state where the honest-derivation machinery
refuses to help, while the money columns still held their pre-run values:

    spentUsd 0 · startedAt null · completedCount 0 · failedCount 0

Both read routes then reported "$0.00 spent / 0 done / never started" for a run
that had really spent — until the fan-in digest reconciled it. That window is
NOT short: in v1 an in-flight child cannot be interrupted, so the digest only
lands after the last running child finishes on its own (minutes to hours). This
is the D-96 lie class re-opened on a path that had never been drilled (judge A).

### Shape chosen

The cancel is the LAST read-time derivation the batch will ever get, so it must
**persist what the live view would have derived**, using the same shared helper
both read routes use (no fourth copy of the rule):

- `select` widened to the money/progress columns + `completedAt` (the cheap
  terminal marker; the heavy `digest` JSON is deliberately NOT selected).
- Children are read AFTER the halt flag is set — nothing new can begin spending
  from that instant, so the figure is as complete as it can be.
- `deriveLiveBatchFields(batch, children, /* liveHalted */ true)` — `true` is a
  fact here, not a guess: we just wrote that flag.
- The same `batchRun.update` that flips the status also writes `spentUsd`,
  `startedAt`, `completedCount`, `failedCount`.
- **Invariant kept: under-claim only, never regress.** Every derived field is
  `max(child-derived, stored)` inside the shared helper, so a cancel can only
  ever RAISE a figure. In-flight children (not yet billed) are simply not
  counted — the persisted number is honest-but-partial, and the digest still has
  the final word.
- The child read is **best-effort**: stopping the spend and flipping the status
  are the load-bearing halves of a cancel, so a DB hiccup on the child query
  logs and degrades to the stored values (i.e. pre-fix behaviour for that one
  request) instead of aborting the cancel with a 500.
- Response is now `{ ok: true, spentUsd }` so a capture/network log shows the
  real figure at the moment of cancel rather than a bare `ok`.

### Consequence handled in the digest

Because `BatchRun.spentUsd` can now be non-zero BEFORE the digest runs, the
digest's `effectiveSpent` is floored by the stored value:

    Math.max(ledgerAvailable ? ledger.spentUsd : dbSpent, batch.spentUsd ?? 0)

Previously an available ledger won outright. A ledger that reads lower (partial
increment, key TTL, a child billed to the DB but not the ledger) must never
SHRINK a money figure the writer was already shown. Z11's DB-fallback behaviour
is untouched.

### Residual / deliberate non-changes

- `completedAt` is still written only by the digest. At cancel time in-flight
  children are genuinely still running, so the batch is terminal-by-decision,
  not complete; `status: "cancelled"` already marks it terminal for every reader.
- The Redis ledger is NOT consulted by the cancel route. Child `actualCostUsd`
  rows are the DB truth the read routes already use, the write is a floor rather
  than a final figure, and adding a ledger read would put another failure mode
  in front of a money-stopping request for no honesty gain.
- Cancelling a batch whose children never started still writes `$0.00` — no
  spend is invented (regression-locked).

## D-186b · LIST/poll progress counts lagged the fan-in

`completedCount` / `failedCount` are written by the digest ONLY, so a mid-run
row reported `0 done` next to the (already-fixed) live status and spend — the
same stale-column lie, one field pair further along. They now belong to the
shared derivation:

- `LiveBatchFields` gains `completedCount` / `failedCount`; non-terminal rows
  count the SAME child statuses `aggregateBatchDigest` counts (`completed`,
  `failed` — `skipped` is progress but neither, exactly as the digest has it),
  floored by the stored values. Terminal rows keep their reconciled counts
  verbatim.
- Both consumers get it for free: the LIST route already selects both columns,
  the poll route selects the whole row. No new query on either path (the LIST
  already loads child rows for non-terminal ids; a fully-terminal list still
  issues zero child queries and zero Redis reads).
- The poll route's separate live `counts` block is unchanged — it now agrees
  with the `batch` row instead of contradicting it.

## D-186c · Three terminal sets, two of them wrong

`TERMINAL_BATCH_STATUSES` (shared view) held `done|failed|halted|cancelled`;
the cancel route's private `TERMINAL_STATUSES` and the dialog's private
`TERMINAL` both omitted **`halted`**. Since `halted` is written by the digest —
i.e. already reconciled and final — that omission meant:

- the cancel route would re-flip a halted run to `cancelled`, overwriting the
  digest's truthful `haltReason: "budget_cap"` with `"cancelled"` (a money lie
  about WHY the batch stopped), and
- the dialog polled a halted batch every 3s forever and kept offering "Cancel
  batch" for a batch nothing could still cancel — exactly the state the D-125
  halt drill ends in.

Fix: ONE set in a new dependency-free module `src/lib/batch/batch-status.ts`
(`TERMINAL_BATCH_STATUSES` + `isTerminalBatchStatus`), re-exported by
`live-batch-view.ts` for existing importers. The module deliberately imports
NOTHING so a client component can share it without dragging `db`/ioredis into
the browser bundle. Cancel-of-halted is now the same idempotent
`{ ok: true, alreadyDone: true }` no-op every other terminal state gets: no
spend rewrite, no halt-flag churn, no parent-job surgery.

---

## Files changed

| File | Change |
|---|---|
| `src/lib/batch/batch-status.ts` | NEW — the ONE terminal-status set, zero imports (D-186c) |
| `src/lib/batch/live-batch-view.ts` | re-exports the shared set; derives `completedCount`/`failedCount` (D-186b) |
| `src/app/api/books/[id]/batch/[batchId]/cancel/route.ts` | shared terminal set + persists derived money/progress state (D-186a/c) |
| `src/lib/queue/batch-digest.ts` | `effectiveSpent` floored by the stored value (D-186a consequence) |
| `src/components/editorial/batch-editorial-dialog.tsx` | cent-granular cap + `parseBatchCapUsd` gate + inline alert/aria-invalid/focus (D-125); shared terminal set (D-186c) |
| `tests/unit/batch-cap-input.test.tsx` | NEW — 11 D-125 tests (gate unit + rendered constraints + refusal a11y) |
| `tests/unit/batch-route.test.ts` | +10 D-186 tests (cancel a/c, LIST + poll counts), list fixture carries the count columns |
| `tests/unit/batch-lifecycle.test.ts` | +1 D-186 digest no-regression test |

Note: the LIST and poll routes themselves needed NO edit — they spread the
shared derivation, so D-186b landed in one place. That is the D-120 shared-module
shape paying off.

## Tests

RED first: 14 failures against pre-fix source — cap `min="1"`, no
`#batch-cap-hint`, no `role="alert"` / `aria-invalid` / focus on
empty-0-negative-over-max, digest regressing 3.25 to 1.00, LIST + poll counts 0
instead of 2/1, cancel writing no `spentUsd` / `completedCount` / `startedAt`,
cancel response without `spentUsd`, cancel-of-halted not idempotent.

New tests (22):

- D-125 gate unit: whole advertised range accepted (`0.01`, `0.05`, `0.99`,
  ` 7 `, `24.99`, `25`); `""`, `"   "`, `0`, `0.009`, `-1`, `25.01`, `1e9`,
  `abc`, `NaN` refused with both bounds named.
- D-125 rendered: `min="0.01"`, `step="0.01"`, `max="25"`; hint names `$0.01` and
  `$25`; typed `0.25` and `0.01` survive the controlled round trip and POST
  verbatim; empty/0/negative/30 blocked with alert + `aria-invalid` + focus and
  NO fetch; block clears on edit and then submits.
- D-186a: cancel mid-run persists `$0.0546` / 1 completed / 1 failed / earliest
  `startedAt`, echoes `spentUsd`, and reads children AFTER the halt flag
  (invocation order asserted); never regresses a stored `$2.50` or a stored
  count; invents no spend when nothing ran; still cancels (200, stored values)
  when the child read throws.
- D-186b: non-terminal LIST row derives 2 completed / 1 failed from 5 children
  (skipped counted as neither); terminal row keeps 3/1 verbatim with zero child
  queries; poll route's `batch` row carries 1/1 while `counts` still agrees.
- D-186c: cancel of a `halted` batch → `{ok:true, alreadyDone:true}`, no update,
  no `redis.set`, no `getJob`.

D-96/D-120 regression locks (terminal-verbatim, spend floor, no-Redis-on-terminal,
list-vs-detail agreement) and the batch money-path locks all pass unchanged.

```
tsc --noEmit          0 errors in this lane's files
                      (24 pre-existing errors remain, ALL from two concurrent
                       lanes' in-flight RED tests + cowork capture scripts:
                       discuss-turn-*/discuss-wait-*/elapsed-seconds, shot45c/e)
eslint (8 touched files) 0 errors (1 pre-existing `_flow` warning)
vitest tests/unit/batch*.test.* tests/unit/agent-worker-batch-*
                      8 files / 92 passed
vitest run (full)     203 files / 1667 passed — ALL GREEN (was 174/1440 at the
                      D-120/D-122 lane; the delta includes two concurrent lanes'
                      work landing in the same checkout during this session)
```

## In-lane findings

1. **`BatchRun.startedAt` is written by NOBODY.** The digest never sets it
   (`batch-digest.ts` updates status/spend/counts/haltReason/completedAt only),
   and the worker doesn't either — so every terminal batch reports
   `startedAt: null` forever, and the live derivation was the only thing filling
   it in for non-terminal rows. The cancel path now persists it; a batch that
   ends via the DIGEST still ends up with `startedAt: null`. Cheap follow-up:
   have the digest persist `min(child.startedAt)` the same way. **Filed as a
   note, not fixed — that digest write is outside this lane's two defects.**
2. **`needs_approval` is non-terminal by construction** (Phase-2 only, never set
   in v1). Recorded in `batch-status.ts` so nobody "helpfully" adds it to the
   terminal set later.
3. Judge S5 note "all-failed pre-digest children derive queued spend" is
   partially addressed as a side effect: a cancelled batch now carries its real
   failed-child count instead of 0.
4. `docs/mission/BATCH-SPEC.md` still documents the cancel route as
   status-flip-only. Spec edit left out of lane (same call the D-122 lane made
   about §397) but it will mislead the next implementer.
5. The D-125 drill is now drivable end-to-end from the UI: cap `$0.01` →
   first child settles ~$0.04 → guard skips the rest → digest writes `halted` →
   the dialog now RECOGNISES that terminal state (D-186c) instead of polling
   forever. That is the exact path D-123/D-126 need.
