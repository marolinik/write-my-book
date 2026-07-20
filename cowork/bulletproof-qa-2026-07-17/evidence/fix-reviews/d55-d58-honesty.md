# D-55 + D-58 — honesty-sweep (#50): dismiss/reject separation + completion documentIds

**Executor:** opus-honesty-1 · **Branch:** qa/bulletproof-2026-07-17 · **NO-COMMIT** (team-lead lands by pathspec)
**Gates:** `npx tsc --noEmit` exit 0 · full `npx vitest run` **131 files / 1034 passed / 0 failed** (0 regressions).
**Discipline:** check-first → TDD RED-first (RED confirmed for every new test) → minimal diff → immutable.
**Disjointness:** touched nothing under `src/lib/import-export/**` or `src/app/api/books/[id]/batch/**` (fix-7c lane). My `agent-worker.ts` edit is in `src/lib/queue/**`, not the batch route.

---

## D-55 [S4] — `rejectedAt` stamped on writer dismissals (dismiss/reject conflation)

**Check-first:** no prior D-55 commit (`git log --grep=D-55` empty). Genuinely open.

**Root cause.** Two distinct intents both stamped the reject timestamp:
- Agent auto-REJECT (`src/lib/agents/tools.ts:1354`) — a malformed CreateFinding is stored `status:"rejected"`, `rejectedAt`, `rejectionReason`. Correct.
- Writer DISMISS (`src/app/api/books/[id]/editorial/findings/[findingId]/route.ts:226`, pre-fix) — `status:"dismissed"`, `dismissReason`, **and** `rejectedAt:new Date()`. The `rejectedAt` stamp is the bug: a dismissal is not a reject, so any consumer keyed on the reject timestamp can't tell them apart → corrupts dismiss-vs-reject analytics (P6 #2/#7).

**Why the stamp was there / why NO schema column is needed.** The only reader of `rejectedAt`-for-dismiss was the `<finding_history>` renderer (`prompt-assembler.ts:1417`, `f.rejectedAt ? "dismissed" : "pending"`) — a purely presentational coupling. The `status` column *already* distinguishes `"dismissed"` from `"rejected"`, and `dismissReason`/`rejectionReason` already separate the reasons. So the clean split needs no `dismissedAt` migration: stop writing the reject timestamp on dismiss, and make the renderer read `status`. (No STOP-and-report — the schema already supports the separation.)

**Fix (3 files, minimal):**
1. `route.ts` dismiss branch — drop `rejectedAt: new Date()`; keep `status:"dismissed"` + `dismissReason`. Comment updated.
2. `src/lib/agents/finding-history-status.ts` (NEW) — pure exported `findingHistoryStatus(f)`: `applied` if `appliedAt || status==="applied"`; `dismissed` if `status` is `"dismissed"`/`"rejected"` **or** legacy `rejectedAt` present; else `pending`. Back-compat: pre-D-55 dismissals that still carry `rejectedAt` still render `[dismissed]`.
3. `prompt-assembler.ts` — `loadFindingHistory` now calls `findingHistoryStatus(f)` (query has no `select`, so `status`/`appliedAt`/`rejectedAt` are all present).

**Tests (RED→GREEN):**
- `tests/unit/finding-history-status.test.ts` (NEW, 5) — dismissed-no-timestamp → `dismissed` (the D-55 case); applied; pending; system-rejected → `dismissed`; legacy `rejectedAt` dismissal → `dismissed`. RED first: module-not-found.
- `tests/unit/finding-apply-guard.test.ts` (+1) — a dismissal's `db.editFinding.update` data has `status:"dismissed"` + `dismissReason` and `rejectedAt` **undefined**. RED first: `rejectedAt` was a `Date`.
- Regression: `finding-redismiss-suppression.test.ts` (D-13 suppression, keys on `status:"dismissed"`) still green — unaffected.

Not touched (out of scope, correct as-is): `tools.ts:1354` genuine reject path; `undo/route.ts` (clears `rejectedAt:null`+`dismissReason:null`+`status:"pending"` — still correct, `rejectedAt:null` is now a harmless no-op for dismissals).

---

## D-58 [S4] — setup/onboarding completion returns `documentIds:[]` despite creating docs

**Check-first:** F7 (`54ba546`) fixed the book-agent route's inline `onComplete`/`onError` documentIds. The orchestrator threads `documentIds` correctly, and the **inline** SSE path spreads the whole result (`stream/route.ts:330 metadata:{...result}`). The gap F7 missed: the **background-worker** completion.

**Root cause.** `src/lib/queue/agent-worker.ts` (the BullMQ path heavy/setup runs take) hand-picks the `"complete"` SSE metadata — `...resultMeta`, `suggestedNext`, tokens, cost, `endReason`, `wrapUpSummary` — and **omitted `documentIds`**. So a background setup/onboarding completion published `documentIds` undefined/`[]` to the client even though `result.documentIds` held the real created IDs. The API lied about what it produced.

**Fix (1 file, 1 line + comment):** add `documentIds: result.documentIds ?? []` to the worker's completion metadata, matching the inline path's contract.

**Test (RED→GREEN):**
- `tests/unit/agent-worker-failed-session.test.ts` (+1) — with `completedResult({ documentIds:["doc-a","doc-b"] })`, the published `"complete"` message's `metadata.documentIds` equals `["doc-a","doc-b"]`. RED first: it was `undefined`.

### D-58 route-parity follow-up (team-lead lane-fence) — two more inline `onError` sites

**Trigger.** team-lead identified three raw `documentIds: []` literals in the inline SSE agent routes. Read-audit result:
- `src/app/api/books/[id]/agent/route.ts:629` — **already F7-fixed** (`onError(error, partial?)` → `partial?.documentIds ?? []`). No-op.
- `src/app/api/books/[id]/agent/[sessionId]/message/route.ts:266` — **unfixed:** `onError(error)` dropped the arg, passed `documentIds:[]` to `completeSession`.
- `src/app/api/series/[id]/agent/route.ts:288` — **unfixed:** same shape.

**Root cause.** The orchestrator already computes the real partial ids and passes them as the 2nd `onError` arg on both failure paths — `orchestrator.ts:261` (`runAgent`, used by the series route) and `:362` (`continueConversation`, used by the /message route): `await options.onError(err, { documentIds })`. The `documentIds` array is passed by reference into `runToolLoop` and mutated as each doc is written, so at failure time it holds exactly the docs that survived. Both routes discarded it by hardcoding `[]` — a completion that under-reports what was produced.

**Fix (2 files, mirror of the approved F7 pattern; fully immutable — read `partial`, never mutate):**
- `message/route.ts` — `onError: async (error, partial?: { documentIds: string[] })` → `documentIds: partial?.documentIds ?? []`.
- `series/[id]/agent/route.ts` — same one-line signature + fallback change.

**Tests (RED→GREEN, real orchestrator contract driven):**
- `tests/unit/agent-message-route.test.ts` (+1) — drive `continueConversation`'s `onError(new Error, { documentIds:["doc-a","doc-b"] })`; assert `completeSession`'s result `documentIds` equals that and `success:false`. RED: `expected [] to deeply equal [ 'doc-a', 'doc-b' ]`.
- `tests/unit/series-agent-error-documentids.test.ts` (NEW, 1) — new focused harness reaching `runAgent`; drive `onError(…, { documentIds:["s-doc-1"] })`; same assertion. RED: `expected [] to deeply equal [ 's-doc-1' ]`. (Series route previously had zero `runAgent`-path coverage.)
- `tests/unit/agent-route-empty-billing.test.ts` (+1) — books-route **parity/regression lock** for the already-fixed F7 path (GREEN; F7 had landed without an `onError`-documentIds test). Drives `onError(…, { documentIds:["b-doc-1"] })`.

All three inline routes now report real partial documentIds on failure, at parity with each other and with the background worker fix above.

---

## Pathspecs to land (mine only)

```
src/app/api/books/[id]/editorial/findings/[findingId]/route.ts
src/app/api/books/[id]/agent/[sessionId]/message/route.ts
src/app/api/series/[id]/agent/route.ts
src/lib/agents/prompt-assembler.ts
src/lib/agents/finding-history-status.ts
src/lib/queue/agent-worker.ts
tests/unit/finding-history-status.test.ts
tests/unit/finding-apply-guard.test.ts
tests/unit/agent-worker-failed-session.test.ts
tests/unit/agent-message-route.test.ts
tests/unit/agent-route-empty-billing.test.ts
tests/unit/series-agent-error-documentids.test.ts
```

**Do NOT land** (concurrent agent, onboarding/UX #53 — present in tree, NOT mine):
`src/app/(app)/settings/billing/page.tsx`, `src/components/agent/ai-companion-bubble.tsx`, `src/components/landing/pricing-section.tsx`.
