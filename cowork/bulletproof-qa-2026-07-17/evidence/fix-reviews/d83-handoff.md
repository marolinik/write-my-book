# D-83 handoff — interactive-gate the authoritative `UpdateGraphEntity` write

**Branch** `qa/bulletproof-2026-07-17` · **status** work left in tree, NO-COMMIT (team-lead gates + commits by pathspec).
**Gates** `npx tsc --noEmit` exit **0** · `npx vitest run` **938 passed / 124 files** (baseline 935/124 → +3 D-83 tests, no new file).
**Severity** HIGH residual of D-80, closed. Next free defect ID after this: **D-84**.

---

## 1. The residual (what D-80 opened)

D-80 made the agent tool `UpdateGraphEntity` an **authoritative** graph write — it passed
`authoritative=true` to `upsertEntities`, deliberately bypassing sub-fix 7(b)'s sticky-dead
and preserve-first-role/description guards so a genuine correction lands instead of being
silently swallowed (the "1 updated" lie).

The tool is **always** authoritative and is reachable **UNATTENDED**. An autonomous
specialist in an overnight batch run can hallucinate an authoritative edit (e.g. flip a
genuinely-dead character `dead -> alive` and erase its `deathChapter`) with no user watching
and no approval gate. Not a regression (at HEAD the same path blanket-overwrote anyway), but
a real overnight graph-corruption window.

## 2. Verified reachability chain (re-derived, post-edit line numbers)

- `executeUpdateGraphEntity` — `src/lib/agents/tools.ts:1508`; the authoritative decision is now
  `src/lib/agents/tools.ts:1566` (`const authoritative = ctx.interactive === true;`) feeding
  `upsertEntities(extractionResult, authoritative)` at `:1567`.
- Tool `UpdateGraphEntity` is in the Ghostwriter / Story Architect / World Researcher toolsets
  (`src/lib/agents/definitions.ts` ~:59 / :125 / :366) — all fully autonomous specialists.
- Executed with **no approval gate** in the orchestrator tool loop
  (`src/lib/agents/orchestrator.ts:853`, `executeTool(toolUse.name, toolCtx, …)`).
- Unattended entry: BullMQ batch worker builds the coach orchestrator at
  `src/lib/queue/agent-worker.ts:485` → coach calls `DelegateToSpecialist`
  (`executeDelegateToSpecialist`, `src/lib/agents/tools.ts:1905`) → spawns a specialist
  orchestrator (`tools.ts:1948`) with the **full specialist toolset** → that specialist can call
  `UpdateGraphEntity`.

## 3. How interactive vs. unattended was determined (no guessing)

The `books/[id]/agent` route has an explicit two-way branch (`src/app/api/books/[id]/agent/route.ts`):

- **Background branch (`:425`)** — `enqueueAgentJob(jobData)`, stores `jobId`, returns
  `{ queued: true }`. This job is processed by the **BullMQ worker** (`agent-worker.ts:485`),
  which uses a **Redis** `approvalResolver` (polls Redis for approvals because no live
  connection exists). This is the unattended/batch path.
- **Inline SSE branch (`:439`, "Existing Inline SSE Path (unchanged)")** — constructs the
  orchestrator at `:472` and streams to the user's browser; approvals use the **in-memory
  Promise** resolver (requires the request to stay alive with the user watching). This is
  interactive.

So the boundary is crisp and defensible: **the synchronous, user-facing HTTP routes are
interactive; the BullMQ worker is not.** The Redis-vs-in-memory approval resolver is the
structural tell that corroborates it.

Interactive entry points (set `interactive: true`):
- `src/app/api/books/[id]/agent/route.ts:472` — inline SSE branch only (background branch enqueues, untouched).
- `src/app/api/books/[id]/agent/[sessionId]/message/route.ts:171` — user conversational turn.
- `src/app/api/series/[id]/agent/route.ts:200` — user-facing series agent request.

Unattended (left at safe default `false`):
- `src/lib/queue/agent-worker.ts:485` — BullMQ batch worker (no `interactive` passed).
- Delegated specialists **inherit** the conductor's value (see below), so a batch-coach
  specialist is non-interactive and an interactive-coach specialist is interactive.

## 4. The flag threaded + safe default

`interactive` is a boolean threaded end-to-end. **Default is the SAFE value `false`** at every
hop, so any caller that does not explicitly opt in is non-authoritative.

1. `ToolContext.interactive?: boolean` — `src/lib/agents/tools.ts:254` (interface field).
2. `executeUpdateGraphEntity` computes `authoritative = ctx.interactive === true` and passes it
   to `upsertEntities` — `tools.ts:1566-1567`. (Strict `=== true`: `undefined`/`false` → non-authoritative.)
3. `OrchestratorOptions.interactive?: boolean` — `src/lib/agents/orchestrator.ts` (options doc);
   class field `private interactive: boolean`; constructor `this.interactive = options.interactive ?? false`.
4. Both `toolCtx` builders (`runAgent`, `continueConversation`) set `interactive: this.interactive`.
5. `executeDelegateToSpecialist` passes `interactive: ctx.interactive === true` into the specialist
   orchestrator options (`tools.ts:1948` block) — a specialist inherits the conductor's interactivity.
6. Routes set `interactive: true`; the worker sets nothing.

`graph-builder.ts` was **not** touched — `upsertEntities(result, authoritative = false)`
(`src/lib/graph/graph-builder.ts:37`) already had the correct param. Extraction/rebuild callers
`graph-maintenance.ts:295` and `:452` still call `upsertEntities(result)` with **no second arg**
→ default `false`, unchanged.

## 5. Tool-description hardening (cheap defense-in-depth)

`updateGraphEntityDef.description` (`src/lib/agents/tools.ts:566`) now states the tool is an
**AUTHORITATIVE correction** that OVERRIDES continuity protections, to be used **only when the
writer explicitly asks to correct the graph**, and **never** to record story events (extraction
captures those automatically). This reduces the odds a specialist reaches for it in the first
place, independent of the gate.

## 6. Proof tests (TDD, RED → GREEN)

`tests/unit/updategraphentity-authoritative.test.ts` (extended in place; same mock harness as the
D-80 test — `upsertEntities` hoisted mock, all heavy seams stubbed):

- **D-80 test** — its shared ctx now sets `interactive: true` (the D-80 guarantee is the
  interactive case); still asserts an interactive correction reaches `upsertEntities(_, true)`.
  Proves the D-80 behavior is NOT weakened.
- **D-83 / interactive** — `interactive: true` ctx → `upsertEntities(_, true)`.
- **D-83 / batch (interactive absent)** — proves the default is safe → `upsertEntities(_, false)`.
- **D-83 / interactive explicitly false** → `upsertEntities(_, false)` (no truthy-coercion escape).

RED run before implementation: the two non-interactive assertions failed with
`expected true to be false` (current code always passed `true`); the two interactive assertions
passed. After implementation: 4/4 green.

The behavioural proof that `authoritative=false` actually preserves sticky-dead / preserve-first
lives in `graph-entity-property-monotonic.test.ts` (d80-1..d80-3, untouched) — this file pins the
WIRING/decision only, matching the D-80 test's split of concerns.

## 7. Files touched (all in tree, uncommitted)

- `src/lib/agents/tools.ts` — ToolContext field, authoritative decision, hardened description, specialist inheritance.
- `src/lib/agents/orchestrator.ts` — options + field + constructor default + both toolCtx builders.
- `src/app/api/books/[id]/agent/route.ts` — inline SSE branch `interactive: true`.
- `src/app/api/books/[id]/agent/[sessionId]/message/route.ts` — `interactive: true`.
- `src/app/api/series/[id]/agent/route.ts` — `interactive: true`.
- `tests/unit/updategraphentity-authoritative.test.ts` — D-80 ctx made interactive + D-83 block (+3 tests).

Not touched (per contract): `src/lib/graph/**`, `src/lib/continuity/**`, `src/lib/vector/**`.

## 8. Residual / notes for team-lead

- **Safe-fail default confirmed:** any orchestrator or ToolContext that forgets to set
  `interactive` is non-authoritative. Adding a new interactive entry point later requires
  remembering `interactive: true` there — the failure mode of forgetting is safe (a real
  correction no-ops and the user re-issues), never graph corruption.
- **In-scope only:** this gates the *authoritative* bypass. A non-interactive specialist can still
  make ordinary (sticky/preserve-first-guarded) graph writes via `UpdateGraphEntity` — that is
  the intended, safe behavior (identical to per-scan extraction), not a residual.
- No changes to graph-builder semantics; sub-fix 7(a) (event-name canonicalization) remains the
  next owner of `src/lib/graph/**`.
