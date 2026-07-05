# BATCH-SPEC — Overnight / Batch Editorial Processing

_Review-ready technical spec for proposal move #4 (`docs/mission/improvement-proposal.md` §3). Grounded in the actual codebase as of commit `32bfc05`. Date: 2026-07-06._

> **One-line thesis:** This is _composition_ over an already-mature async core, not new engine work. The worker, the queue, the dual-path enqueue, per-session budget degradation, and every per-session digest artifact all ship today. The genuinely new surface is small and named: a `BatchRun` table, a FlowProducer fan-out/fan-in wrapper, **one new money-path invariant** (an aggregate budget ledger + pre-child cancel guard + batch circuit breaker), and a walk-away approval policy that — for the v1 scope — is a validation rule, not a resolver rewrite.

---

## 1. Goal & scope

### 1.1 The Priya use case

Priya is a high-volume author. Her standout line in the persona eval: _"until it can batch-edit twelve chapters overnight without me babysitting a worker process."_ She wants to queue a set of editorial passes — "**dev-edit + line-edit chapters 1–12, show me findings in the morning**" — schedule them for 2am, close her laptop, and read a delta report over coffee. No SSE tab held open, no worker babysat, no runaway spend while she sleeps.

### 1.2 What ships in v1

A first-class **"Batch editorial"** action that:

1. Expands `(workflows × chapters)` into N background agent jobs — each an **unchanged** `processAgentJob` run.
2. Runs them unattended via BullMQ Flows (fan-out), optionally delayed until a chosen time (e.g. 2am).
3. Enforces an **aggregate dollar cap across all children** (the one new money-path invariant), halting remaining children if the batch cap is hit.
4. On completion, runs a **fan-in digest job** that rolls up findings / status advances / cost into one `BatchRun.digest` and fires a `BookNotification`.

### 1.3 v1 scope — NON-prose-mutating passes only

v1 is scoped to the four **findings/report-only** editorial workflows, all of which already take the background-queue path and are non-conversational:

| Workflow id | primaryAgent | `conversational` | `estimatedMaxMinutes` | Mutates prose? |
|---|---|---|---|---|
| `dev-edit` | dev-editor | false | 10 | **No** — emits `CreateFinding` |
| `line-edit` | line-editor | false | 8 | **No** |
| `beta-read` | beta-reader | false | 8 | **No** |
| `analyze` | manuscript-analyst | false | — | **No** |

_(Workflow definitions: `src/lib/agents/workflows.ts:221` dev-edit, `:240` line-edit, `:259` beta-read, `:330` analyze.)_

**Why this scope is clean and load-bearing:** prose (manuscript chapter content) mutation happens **only** via the `WriteChapter` tool, which is carried **only** by the ghostwriter agent (`src/lib/agents/definitions.ts:55`). Ghostwriter is `primaryAgent` for `write-chapter` / `freewrite` / `revise` (`workflows.ts:170/193/277`). The four v1 editors do **not** carry `WriteChapter` — their manuscript feedback goes through the non-mutating `CreateFinding` tool. So "walk away" can **never** mean "silently rewrote my book."

Equally important: the v1 editors **do not carry the `RequestApproval` tool** either (only writing-coach / ghostwriter / story-architect do — `definitions.ts:19/57/121`). That means **a v1 batch never reaches the approval gate at all** — it already runs to completion unattended today; findings just accumulate with nothing aggregating them. This reframes the v1 requirement: the walk-away approval policy (§5) is **not needed to make v1 work** — the load-bearing v1 guardrails are the aggregate ledger (§4) and the batch-eligibility rejection (§7). The approval policy is specified here as forward design for when scope later includes gated agents.

### 1.4 Explicit non-goals for v1

- **No prose-mutating batches** (`write-chapter`, `freewrite`, `revise`) and no structural-doc batches (`build-architecture`, `create-series-*`). Batch creation **rejects** these (§7). Deferred until the walk-away approval policy (§5) is actually built and reachable.
- **No recurring/cron schedules.** v1 does one-shot delayed batches (`delay: msUntil2am`). Recurring nightly schedules via `upsertJobScheduler` are Phase-2 (proposal item #10).
- **No email/push digest delivery.** v1 writes an in-app `BookNotification('pipeline_complete')` + a batch-status view. SMTP/push is Phase-2.
- **No worker concurrency increase.** Stays at 2 (`src/worker.ts:37`); the UI states expected wall-clock honestly (§9).
- **No per-finding triage/apply UI in the batch flow.** The digest surfaces findings; acting on them uses the existing per-chapter findings surfaces.

---

## 2. Data model

### 2.1 New table — `BatchRun`

The only genuinely new entity. A grep for `BatchRun` / `batchId` returns nothing in `src` or `schema.prisma` today — this is net-new.

```prisma
// prisma/schema.prisma — new model
model BatchRun {
  id             String   @id @default(cuid())
  userId         String
  bookId         String

  // What to run — the expansion inputs (kept as arrays; expanded at enqueue)
  workflowIds    String[] // e.g. ["dev-edit", "line-edit"]  (v1: must be batch-eligible)
  chapterStart   Int
  chapterEnd     Int

  // Lifecycle
  status         BatchStatus @default(queued)

  // Money-path (the new invariant lives here + in Redis)
  budgetCapUsd   Float       // MUST be finite (Infinity->null BullMQ trap — validate)
  spentUsd       Float    @default(0) // reconciled from Redis ledger by the digest job
  halted         Boolean  @default(false) // circuit-breaker tripped (also a Redis flag)
  haltReason     String?  // "budget_cap" | "provider_failures" | "cancelled"

  // Scheduling (native BullMQ delay; no cron in v1)
  scheduledFor   DateTime?   // null => run now; else parent job added with computed delay
  parentJobId    String?     // BullMQ FlowProducer parent job id (for cancel/inspect)

  // Fan-in result
  digest         Json?       // structured roll-up written by the digest job
  childCount     Int      @default(0)
  completedCount Int      @default(0)
  failedCount    Int      @default(0)

  createdAt      DateTime @default(now())
  startedAt      DateTime?
  completedAt    DateTime?

  // Relations
  book           Book          @relation(fields: [bookId], references: [id], onDelete: Cascade)
  sessions       AgentSession[] // children link back via AgentSession.batchId

  @@index([userId, status])
  @@index([bookId])
}

enum BatchStatus {
  queued            // created, waiting (scheduled or pending dispatch)
  running           // at least one child dispatched
  needs_approval    // Phase-2 only: a DEFERred approval is waiting (never set in v1)
  halted            // circuit breaker / budget cap tripped; remaining children skipped
  done              // all children terminal + digest written
  failed            // batch-level failure (e.g. all children failed)
  cancelled         // user-cancelled
}
```

**Lifecycle:**

```
queued ──(parent job released / dispatch)──> running
running ──(budget cap hit OR provider-failure breaker trips)──> halted
running ──(user cancels)──> cancelled
running ──(all children terminal, digest written)──> done
running ──(Phase-2: a mutating tool DEFERred)──> needs_approval ──(resolved)──> running
(any non-terminal) ──(unrecoverable)──> failed
```

`halted`, `cancelled`, `failed`, and `done` all still run the **digest job** so the writer always gets a morning report (even a partial one). `needs_approval` is defined for forward-compat but **never set in v1** (v1 workflows can't reach the gate — §1.3).

### 2.2 Change to `AgentSession` — link children to the batch

`AgentSession` (`prisma/schema.prisma:272-298`) already models everything a child needs: `jobId String?` (`:282`, the BullMQ job link), a `parentSessionId`/`children` self-relation (`SessionHierarchy`, `:278,292-293`), and `status` (running/completed/failed/paused). Add one nullable FK so a session knows its batch:

```prisma
model AgentSession {
  // ... existing fields ...
  batchId  String?
  batch    BatchRun? @relation(fields: [batchId], references: [id], onDelete: SetNull)
  // @@index([batchId])
}
```

A `null` `batchId` is a normal standalone session (all sessions today). This is additive and backward-compatible.

### 2.3 Change to `AgentJobData` — two new finite fields

`AgentJobData` (`src/lib/queue/agent-queue.ts:18-51`) is the serializable child payload. Add exactly two optional fields so a child can find its ledger and cap:

```ts
export interface AgentJobData {
  // ... all existing fields unchanged ...
  /** Parent batch id, if this child belongs to a BatchRun. */
  batchId?: string;
  /** Aggregate batch budget ceiling in USD. MUST be finite (Infinity->null BullMQ trap). */
  batchBudgetCapUsd?: number;
}
```

> **Serialization footgun (documented, reused):** BullMQ JSON-serializes job data, coercing `Infinity` → `null` (already handled for `sessionCostLimit` via `normalizeSessionCostLimit`, `budget.ts:24`, imported at `agent-worker.ts:32`; and guarded at `route.ts:373-378`). `batchBudgetCapUsd` **must** pass the same finite validation, or the batch runs effectively uncapped.

### 2.4 Tables reused as-is (no schema change)

The digest is **aggregation, not new capture** — all per-child artifacts already persist:

| Table | Where written today | Digest use |
|---|---|---|
| `EditFinding` (`schema.prisma:363-398`) | `processPostSession` → `verifySessionFindings` (`post-session.ts:336-373`) | Findings per chapter (severity/category/description/suggestion) |
| `AgentSession` (`schema.prisma:272-298`) | `onComplete` (`agent-worker.ts:504-519`) | Per-child status, tokens, `actualCostUsd`, `completedAt`, `chapterNumber` |
| `UsageRecord` (`schema.prisma:314-330`) | `onComplete` (`agent-worker.ts:522-533`) | Cost aggregation source, written for **every** session |
| `Chapter.status` / `betaGate` / `betaScore` | `post-session.ts` status advance (`:65-72`, `:407-413`) | "Ch 1–12 advanced to line_edited" |
| `BookNotification('pipeline_complete')` (`schema.prisma:582-601`) | — | Digest writes one of these when done |

---

## 3. Execution — BullMQ Flows

### 3.1 Version & availability (no upgrade, no new infra)

BullMQ is **5.70.1** (`package.json:53`). `node_modules/bullmq/dist/cjs/classes/` contains `flow-producer.js`, `job-scheduler.js`, and `repeat.js` — **FlowProducer** (fan-out/fan-in), the native **Job Scheduler** (cron/repeatable, Phase-2), and **delayed jobs** are all installed. The Redis connection factory (`src/lib/queue/connection.ts`) already exposes `createRedisConnection()` / `getAppConnection()` with the BullMQ-required `maxRetriesPerRequest:null` + `enableReadyCheck:false` (`connection.ts:21-24`). A `FlowProducer` reuses `getAppConnection()` — **zero new infrastructure**.

### 3.2 The flow

```
                         POST /api/books/[id]/batch
                                    │
                                    ▼
                 ┌──────────────────────────────────────┐
                 │  Expand (workflows × chapters) → N     │
                 │  AgentJobData payloads (reusing the    │
                 │  exact construction in route.ts:388-424│
                 │  per chapter/pass) + batchId +         │
                 │  batchBudgetCapUsd (finite)            │
                 └──────────────────────────────────────┘
                                    │
                                    ▼
                        FlowProducer.add({
                          queueName: "batch-digest",   // NEW queue
                          name: "digest",
                          data: { batchId },
                          opts: { delay: msUntilScheduledFor ?? 0 },
                          children: [                    // N children
                            { queueName: "agent-sessions",   // EXISTING queue
                              name: "agent-session",
                              data: AgentJobData_i,
                              opts: { jobId: sessionId_i } }, // dedup, as today
                            ...
                          ],
                        })
                                    │
             ┌──────────────────────┼──────────────────────┐
             ▼                      ▼                      ▼
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │ child: ch1 dev  │   │ child: ch1 line │   │  ... ch12 ...    │   ← EXISTING Worker
    │ processAgentJob │   │ processAgentJob │   │                 │     (src/worker.ts,
    │  (UNCHANGED)    │   │  (UNCHANGED)    │   │                 │      concurrency 2)
    └─────────────────┘   └─────────────────┘   └─────────────────┘
             │                      │                      │
             └──────────────────────┼──────────────────────┘
                                    ▼  (BullMQ resolves parent once ALL children finish)
                        ┌──────────────────────────┐
                        │ digest job (fan-in)       │   ← NEW Worker on "batch-digest"
                        │ reads EditFinding +        │     (getChildrenValues / children
                        │ AgentSession + UsageRecord │      already terminal)
                        │ + Chapter → BatchRun.digest│
                        │ + BookNotification         │
                        └──────────────────────────┘
```

**Key facts that make this cheap:**

- **Children reuse the existing queue and Worker verbatim.** Each child is added on the **same `agent-sessions` queue** with name `agent-session` and an `AgentJobData` payload, picked up by the **single existing Worker** (`src/worker.ts:35-40`) and run through the **unchanged `processAgentJob`** (`agent-worker.ts:100`). Children inherit `defaultJobOptions` for free: `attempts:3` + exponential backoff 30s→60s→120s, `removeOnComplete:{count:100}`, `removeOnFail:{count:50}` (`agent-queue.ts:59-70`). Per-child dedup stays `jobId = sessionId` (`agent-queue.ts:80-84`).
- **Fan-in is native.** BullMQ resolves a parent job only after all its children finish (`waitChildren` / `getChildrenValues`). The digest job is that parent, on a **new queue** `batch-digest`.

### 3.3 The one distinct enqueue path (a real, small difference from today)

> **Risk called out honestly:** today's `enqueueAgentJob` (`agent-queue.ts:80`) calls `queue.add` directly with **no parent linkage**. Batch children must be added through `FlowProducer.add` (or `queue.add` with `{ parent: { id, queue } }` opts) so the parent resolves on fan-in. **The batch endpoint therefore cannot literally call `enqueueAgentJob` as-is** — it builds the same `AgentJobData` payloads but hands them to a new `enqueueBatchFlow(...)` helper wrapping `FlowProducer`. The _payload construction_ is reused; the _add mechanism_ is the new bit. Add a `src/lib/queue/batch-flow.ts` with `enqueueBatchFlow(children, digestData, opts)`.

### 3.4 Scheduling ("run at 2am") — native delay, no cron daemon in v1

- **One-shot "tonight at 2am":** compute `delay = scheduledFor.getTime() - Date.now()` (ms) and pass it as the **parent** job's `delay`. Children carry **no delay** — they run when the parent releases them. The `delay` option is already used in the codebase for backoff (`agent-queue.ts:64`); this is the first _scheduled_ use.
- **Timezone:** `scheduledFor` is computed **client-side or from the user's stored tz** into an absolute instant before enqueue, so the server only ever sees a UTC `Date`. (Note the existing locale/`2.026`-words leak flagged in the proposal — batch tz handling must not repeat it; store an absolute instant, not a wall-clock string.)
- **Rejected alternatives** (per proposal §3.1): a hand-rolled `node-cron` daemon (BullMQ already does cron+tz and the codebase already fights worker-liveness), and external/Vercel/Claude-Code-cron (self-hosted stack, no serverless cron; `CronCreate` schedules dev-harness agents, not product actions).
- **Recurring** ("every night") is Phase-2 via `queue.upsertJobScheduler(...)` — out of v1 scope (§1.4).

### 3.5 The new digest Worker (the one genuinely-new processor)

`src/worker.ts` registers only the `agent-sessions` Worker today. The digest/fan-in needs its **own** Worker registration on `batch-digest`:

```ts
// src/worker.ts — add alongside the existing Worker
const digestWorker = new Worker("batch-digest", processBatchDigestJob, {
  connection: createRedisConnection(),
  concurrency: 2,
});
```

> **Risk (crash blast-radius):** both Workers run in the **one** `src/worker.ts` process. Its `uncaughtException` handler calls `process.exit(1)` (`worker.ts:80-88`) — a crash **inside the digest processor** would take down the `agent-sessions` Worker too. Mitigation: the digest processor must be defensively wrapped (all DB/Redis reads in try/catch, never throw to the process level — write a `failed`-status digest instead). Do **not** let a bad digest kill the whole worker.

### 3.6 Retry / stalled recovery — reused per child, no new code

Per-child resilience is already present and inherited: `attempts:3` + backoff (`agent-queue.ts:60-66`); stalled recovery via `stalledInterval:60_000` + `lockDuration:300_000` (`worker.ts:38-39`); `worker.on('stalled')` logs + BullMQ auto-retries (`worker.ts:67-69`). User-cancel is a non-retryable `SessionCancelledError extends UnrecoverableError` (`agent-worker.ts:80-85`) so cancels aren't retried — the batch pre-child cancel guard (§4.3) reuses this pattern.

> **Risk (lock vs. long pass):** `lockDuration` is 5 min (`worker.ts:39`) but editorial passes can run up to `estimatedMaxMinutes: 10` (dev-edit). BullMQ auto-renews the lock while the processor is alive, so this is normally fine — but if a pass stalls the event loop past a renewal, the job is marked stalled and **retried, double-spending budget**. The aggregate ledger (§4) bounds the blast radius; still, validate lock renewal under a real 24-child overnight run (§8 riskiest step).

---

## 4. Money-path invariant (the critical part)

This is the **single new money-path invariant** the proposal calls out, and the highest-risk piece. Everything else is composition; this is new correctness.

### 4.1 The gap today

Per-child budget is fully enforced **inside each orchestrator**: `sessionCostLimit` arrives in `AgentJobData` (`agent-queue.ts:46`), set in the enqueue route as `max(preEstimate.max * BUDGET_SAFETY_FACTOR, MIN_SESSION_BUDGET_USD)` (`route.ts:375-378`); checked per-turn via pure helpers in `src/lib/agents/budget.ts` (`isOverBudget` `:32`, `isBudgetWarning` `:40`) at `orchestrator.ts:595` (80% warn) and `:632` (100% → one graceful wrap-up turn, `endReason 'budget'`, never an SSE error). Cost accrues in `SharedCostTracker` (`types.ts:145-154`), accumulated per-turn at each orchestrator's **own** registry rate (`orchestrator.ts:530-538`), so mixed-model sessions price correctly.

**But there is NO cross-child aggregate ceiling.** A 12-chapter × 2-pass batch = **24 independent per-session caps with no batch total**. Unattended overnight, a runaway batch can spend `N × per-session budget`. Closing this is v1's load-bearing guardrail.

### 4.2 The aggregate Redis ledger

Three Redis keys per batch (no such cross-session counters exist today):

| Key | Op | Written by | Meaning |
|---|---|---|---|
| `batch:{id}:spent` | `INCRBYFLOAT cost` | child `onComplete` | Total $ spent by terminal children |
| `batch:{id}:halted` | `SET "1"` | ledger check / breaker | Circuit-breaker tripped; skip remaining children |
| `batch:{id}:failures` | `INCR` | child `onFailure` on 429/auth/quota | Provider-failure counter for the breaker |

**Increment point (exact):** the child's final `cost = sharedCostTracker.totalCostUsd` is already computed at `agent-worker.ts:502` and written to `AgentSession.actualCostUsd` (`:517`) and `UsageRecord.costEstimate` (`:530`). The ledger increment belongs **right here**, in `onComplete`, guarded by `if (batchId)`:

```ts
// agent-worker.ts onComplete, after cost is computed (~L502), if batchId present:
const spent = await publisher.incrbyfloat(`batch:${batchId}:spent`, cost);
if (batchBudgetCapUsd != null && spent >= batchBudgetCapUsd) {
  await publisher.set(`batch:${batchId}:halted`, "1");
}
```

The ledger increment uses the **same** per-turn-priced value as the per-session cap, so batch spend is consistent with per-session spend. It is an **estimate** (token-count × registry price via `estimateCost`, `cost.ts:8-19`), not provider-billed actuals — the UI cap copy must state this honestly.

### 4.3 The pre-child cancel guard (new early-return path)

Clean insertion point: the **very top of `processAgentJob`** (`agent-worker.ts:100-127`), **before** keys are fetched and the orchestrator is built. If the batch is over cap or halted, short-circuit without running the orchestrator:

```ts
// agent-worker.ts, top of processAgentJob, before re-fetching keys:
if (batchId) {
  const [spentRaw, halted] = await Promise.all([
    publisher.get(`batch:${batchId}:spent`),
    publisher.get(`batch:${batchId}:halted`),
  ]);
  const spent = spentRaw ? parseFloat(spentRaw) : 0;
  if (!shouldRunBatchChild(spent, batchBudgetCapUsd ?? Infinity, halted === "1")) {
    await db.agentSession.update({
      where: { id: sessionId },
      data: { status: "failed", completedAt: new Date() }, // "skipped"-semantics
    });
    return; // never runs the orchestrator, never spends
  }
}
```

Skipped children are marked terminal and surfaced in the digest as "skipped (batch cap reached)". This reuses the `UnrecoverableError`/non-retry instinct: a skipped child must **not** be retried into spending.

### 4.4 The batch circuit breaker

Distinct from and complementary to BullMQ's per-job `attempts:3`. Without it, a mid-batch provider quota/auth exhaustion lets **each** of N children burn 3 retries. On a child failure classified as `429`/auth/quota, increment `batch:{id}:failures`; when it crosses a threshold (owner decision, §9), `SET batch:{id}:halted "1"`. The pre-child guard (§4.3) then skips all remaining children. Trip is recorded on `BatchRun.halted` + `haltReason` by the digest job.

### 4.5 THE invariant to unit-test

A pure decision helper mirroring `budget.ts` — **the one new money-path invariant**, unit-tested with **no infra** alongside the existing suites:

```ts
// src/lib/agents/batch-budget.ts
/** True iff a NEW batch child may start. Finite cap only; non-finite => unlimited. */
export function shouldRunBatchChild(
  spentUsd: number,
  capUsd: number,
  halted: boolean,
): boolean {
  if (halted) return false;
  if (!Number.isFinite(capUsd)) return true; // unlimited (mirror normalizeSessionCostLimit)
  return spentUsd < capUsd;
}
```

**The exact invariant the test asserts** — state it precisely because concurrency makes the naive version false:

> **No NEW batch child starts once `spent >= cap` (or `halted`).** Total spend is therefore bounded by `cap + (concurrency − 1) × maxPerSessionCap` in the worst case — NOT "spend never exceeds cap."

**Why the weaker bound is the honest one:** `batch:{id}:spent` increments on child **completion**, and worker concurrency is 2 (`worker.ts:37`). Up to 2 in-flight children can each finish and overshoot before the guard next trips. Worst-case overshoot is bounded (~`concurrency × per-session cap`) but **non-zero**. The test asserts the _gate_ ("no new child dispatched after cap"), and the spec/UI states the bounded overshoot honestly. Add this to `tests/unit/batch-budget.test.ts` next to `budget.test.ts`, `orchestrator-budget.test.ts`, `wrap-up-tools.test.ts`.

### 4.6 Composition with the existing per-session cap

The two caps are **layered, not competing**: each child still enforces its own `sessionCostLimit` per-turn inside its orchestrator (unchanged). The batch ledger is a **second, outer** gate checked _between_ children at dispatch. A child never sees the aggregate cap mid-run (it can't be interrupted per-turn by it in v1); the aggregate cap only decides **whether the next child starts**. This keeps the change surgical: no edits to the orchestrator's per-turn budget loop.

---

## 5. Walk-away approval policy

> **Scope reminder (§1.3):** for v1's four safe workflows this section is **unreachable** — they don't carry `RequestApproval`, so the 10-min auto-reject is moot and no batch ever DEFERs. This is specified as **forward design** for when batch scope later includes gated agents (Phase-2), and to document the exact mechanism a future change must touch. **Do not build the resolver rewrite for v1** — it's effort spent before it's reachable. The v1 deliverable in this area is the **batch-eligibility rejection** (§7), not a new resolver.

### 5.1 The mechanism being replaced

Approval today is **agent-initiated**, not tool-classification based: the agent calls the `RequestApproval` tool (`src/lib/agents/tools.ts:406-424`, returns `APPROVAL_SENTINEL` at `tools.ts:1980-1981`), which the orchestrator gates through `options.approvalResolver` (`orchestrator.ts:91-93,129`, consumed at `:801-875`). Background jobs supply a **Redis-polling resolver** (`agent-worker.ts:352-393`): it writes `approval:{id}` = `{status:"pending"}` with a TTL, polls every 2s (`APPROVAL_POLL_INTERVAL_MS`, `:60`) until `deadline`, and on timeout returns:

```ts
// agent-worker.ts:387-392 — THE branch the walk-away policy replaces
return { decision: "reject" as const, message: "Approval timed out after 10 minutes" };
```

`APPROVAL_TIMEOUT_MS = 10 * 60 * 1000` is **duplicated** in two places: `orchestrator.ts:33` (inline path) **and** `agent-worker.ts:57` (background path). The approve HTTP route that resolves the loop is `src/app/api/books/[id]/agent/[sessionId]/approve/route.ts:41-74` (writes `{status:"resolved", decision, message}`).

### 5.2 The policy (Phase-2, when reachable)

Replace **blocking-then-rejecting** with **auto-approve-safe-or-DEFER**:

- **Auto-approve** read/analyze/finding-filing (safe, non-mutating).
- **DEFER** anything mutating: persist a pending approval (reuse the same `approval:{id}` Redis key discipline), **skip that unit**, set `BatchRun.status = needs_approval`, and **surface it in the morning digest** — instead of blocking then silently rejecting the writer's intent.

### 5.3 The real design friction (called out honestly)

`approvalResolver` is typed `(approvalId: string, deadline: number) => Promise<ApprovalResponse>` (`orchestrator.ts:91-94,129`). **It does NOT receive the tool payload** — the request's `title`/`description`/which tool is being gated are only in scope at the **call site** (`orchestrator.ts:802-808`, `approvalInput`). So "auto-approve **safe** / DEFER **mutating**" that keys on _what_ is gated **cannot be a drop-in resolver swap**. It requires either:

1. **Extend the resolver signature** to pass the request payload, or
2. **Decide at the call site** (`orchestrator.ts:801`) before invoking the resolver.

Under-scoping this is the main design trap. Also: because `APPROVAL_TIMEOUT_MS` is duplicated (`orchestrator.ts:33` + `agent-worker.ts:57`), any change must touch both or they silently diverge.

### 5.4 Precedent already in the codebase

The `WRAP_UP_TOOLS` allowlist (`orchestrator.ts:46-50`) deliberately **excludes** `RequestApproval` because it "would block up to 10 min on the approval gate" (comment `:44-45`, `:648-649`). The batch policy generalizes this exact instinct. **Do not** build on the dead `waitForApproval` export (`agent-worker.ts:714-772`, doc-comment says "for future use") — the live path is the `approvalResolver` closure; building on `waitForApproval` would create a second, diverging approval implementation.

---

## 6. Morning digest

A fan-in job (`processBatchDigestJob` on the `batch-digest` queue) that runs once all children are terminal. **Aggregation, not new capture** — every source already persists.

### 6.1 Sources (read directly — do NOT rely on ephemeral state)

```ts
// Per child (childIds = sessions where batchId = this batch):
const findings = await db.editFinding.findMany({ where: { sessionId: { in: childIds } } });
const sessions = await db.agentSession.findMany({ where: { batchId } }); // status, cost, chapter
const usage    = await db.usageRecord.findMany({ where: { /* batch window */ } });
const chapters = await db.chapter.findMany({ where: { bookId /* range */ } }); // status/betaGate
const spent    = parseFloat(await redis.get(`batch:${batchId}:spent`) ?? "0");
```

### 6.2 Digest gaps to be honest about

- **`SessionBrief` is written ONLY on early-end** (`endReason` `budget`/`timeout`, `agent-worker.ts:538-560`, confirmed). Naturally-completed children get **no brief**. The digest must **not** depend on `SessionBrief` or it drops every clean child. Read `EditFinding` + `AgentSession` + `UsageRecord` + `Chapter` directly. (`SessionBrief`, when present, is a bonus "what remains" note.)
- **`PostSessionResult`** (findingsCreated/statusAdvanced/newStatus/betaGateResult/suggestedNext) is currently **only** published to the ephemeral Redis `complete` SSE message (`agent-worker.ts:571-587`), **not persisted** as a structured per-child object. The digest reconstructs the roll-up from the tables above.
- **Skipped/failed/cancelled children have gaps.** `Finding`s come from `processPostSession`, skipped on cancel (`agent-worker.ts:473`). The digest must read `AgentSession.status` and mark those children "skipped (cap)" / "failed" / "cancelled" rather than showing empty findings as success.

### 6.3 What the writer sees

A `BatchRun.digest` JSON + a `BookNotification('pipeline_complete')` (`schema.prisma:582-601`), rendering roughly:

> **Overnight batch — "The Salt Letters", 12 chapters, dev-edit + line-edit**
> Completed 22/24 passes · 2 skipped (batch cap reached) · **$8.40 spent / $10.00 cap**
> **147 findings** — 12 high, 61 medium, 74 low
> Chapters 1–12 advanced: dev_edited → line_edited (ch 3, 7 still at dev_edited — passes skipped)
> _[View findings by chapter]_

> **Honesty requirement (proposal risk):** dev-edit/line-edit/beta-read **advance chapter STATUS** (`dev_edited`/`line_edited`/`beta_read`, `post-session.ts:65-72`) even in a safe batch — content is untouched, but a 12-chapter overnight run **silently moves statuses**. The digest **must** surface these status advances so "walk away" isn't a surprise.

---

## 7. API + minimal UI

### 7.1 Endpoints (new)

| Method / path | Purpose |
|---|---|
| `POST /api/books/[id]/batch` | Create/schedule a batch. Body: `{ workflowIds[], chapterStart, chapterEnd, budgetCapUsd, scheduledFor? }`. Validates ownership + quota + **batch-eligibility** (§7.2) + **finite `budgetCapUsd`**. Creates `BatchRun`, expands `(workflows × chapters)` into N `AgentJobData` (reusing `route.ts:388-424` construction per pass), calls `enqueueBatchFlow`. Returns `{ batchId, childCount, scheduledFor }`. |
| `GET /api/books/[id]/batch/[batchId]` | Poll status + digest (`BatchRun` + child counts). |
| `POST /api/books/[id]/batch/[batchId]/cancel` | Set `batch:{id}:halted`, mark `BatchRun.cancelled`; in-flight children finish, undispatched children hit the pre-child guard and skip. Remove the parent job if still delayed/pending. |

Today `src/app/api/books/[id]/agent/route.ts` starts **one** session per POST. The batch route that expands passes × chapters into N children is new — but it **reuses the same model-resolution + budget `AgentJobData` construction** already in `route.ts:388-424`.

### 7.2 Batch-eligibility validation (the load-bearing v1 guardrail)

`POST /batch` **rejects** with 400 if any `workflowId` is prose-mutating or gated:

```ts
const BATCH_ELIGIBLE = new Set(["dev-edit", "line-edit", "beta-read", "analyze"]);
// Rejected: write-chapter, freewrite, revise (prose), build-architecture, create-series-* (structural)
```

Derived directly from the tool-allowlist facts (§1.3): eligible = carries neither `WriteChapter` nor `RequestApproval`. This enforces "walk away can never mean silently rewrote my book" — the real v1 approval-safety mechanism (not the resolver).

### 7.3 Minimal UI

- **"Batch editorial" action** on the book page: pick passes (checkboxes: dev-edit / line-edit / beta-read / analyze), chapter range (1–N), a **$ cap** (default + editable, §9), and an optional **"run at" time** (default: now; preset "Tonight 2am"). One "Queue batch" button. States expected wall-clock honestly (concurrency 2 → 24 passes serialize ~2-at-a-time).
- **Batch-status / digest view:** progress (X/N passes, $spent/$cap, halted?), and once done the digest roll-up (findings by chapter, status advances) with links into existing per-chapter findings surfaces.

---

## 8. Build plan

Ordered. **ADD** = new file; **CHANGE** = edit existing. Effort S/M/L per step.

| # | Step | Files | Effort |
|---|---|---|---|
| 1 | **`BatchRun` model + `AgentSession.batchId` + migration** | CHANGE `prisma/schema.prisma`; `prisma migrate` | **S** |
| 2 | **Two finite fields on `AgentJobData`** (`batchId?`, `batchBudgetCapUsd?`) | CHANGE `src/lib/queue/agent-queue.ts:18-51` | **S** |
| 3 | **Pure invariant helper + unit test** (`shouldRunBatchChild`) — do this early, TDD | ADD `src/lib/agents/batch-budget.ts`, `tests/unit/batch-budget.test.ts` | **S** |
| 4 | **Aggregate ledger increment** in `onComplete` (`INCRBYFLOAT` + trip `halted`) | CHANGE `agent-worker.ts:~502` | **S** |
| 5 | **Pre-child cancel guard** at top of `processAgentJob` (early return) + **failure breaker** counter in `onFailure` | CHANGE `agent-worker.ts:100-127` + failure path | **M** |
| 6 | **FlowProducer wrapper** (`enqueueBatchFlow`) — fan-out on `agent-sessions`, parent on `batch-digest` | ADD `src/lib/queue/batch-flow.ts` | **M** |
| 7 | **Digest processor** (read EditFinding/AgentSession/UsageRecord/Chapter → `BatchRun.digest` + `BookNotification`) — defensively wrapped | ADD `src/lib/queue/batch-digest.ts` | **M** |
| 8 | **Register digest Worker** on `batch-digest` | CHANGE `src/worker.ts:35` (add 2nd Worker) | **S** |
| 9 | **Batch API** (POST create/schedule, GET status, POST cancel) + **eligibility validation** + finite-cap validation + scheduling delay | ADD `src/app/api/books/[id]/batch/route.ts` (+ `[batchId]/route.ts`, `[batchId]/cancel/route.ts`) | **M** |
| 10 | **Minimal UI** (Batch editorial action + status/digest view) | ADD components under book page | **M** |
| 11 | **Batch-lifecycle integration test** (queue → 2 children → cap trip → skip → digest) against live Redis/worker, mirroring existing e2e infra | ADD `tests/...batch-lifecycle` | **M** |

**Tests (mandatory):**
- **Budget-invariant unit test (step 3)** — pure, no infra: asserts `shouldRunBatchChild` gates correctly (halted, over-cap, non-finite=unlimited) and documents the `cap + (concurrency−1)×perSession` overshoot bound. Sits next to `budget.test.ts` / `orchestrator-budget.test.ts` / `wrap-up-tools.test.ts`.
- **Batch-lifecycle test (step 11)** — queue a 2-pass × small batch with a low cap; assert (a) children run through unchanged `processAgentJob`, (b) once `spent >= cap` **no new child dispatches** (pre-child guard), (c) digest aggregates findings + surfaces skipped children + status advances.

**Riskiest step: #5 (pre-child guard + circuit breaker) and #4 (ledger increment) together — the money-path.** This is the only net-new correctness surface; everything else is composition. The concurrency-2 overshoot window (§4.5), the `Infinity→null` finite-cap trap (§2.3), and the lock-vs-long-pass double-spend risk (§3.6) all converge here. Validate under a **real overnight-scale run** (24 children) before shipping, not just unit tests. Second-riskiest: **#7/#8** — a crash in the digest Worker shares a process with the agent Worker (§3.5) and can take it down; the defensive wrap is not optional.

**Effort roll-up:** ~11 steps, mostly S/M, **no L**. Matches the proposal's **Effort M, risk Low** — _except_ the money-path (#4/#5), which is the concentrated risk. Net: **M**, ~11 steps.

---

## 9. Open questions / decisions for the owner

1. **Default batch $ cap.** What's the default `budgetCapUsd` (and the max)? qwen-class economics are ~$0.16–0.42/chapter, so a 24-pass batch is ~$4–10 of estimated spend. Suggest default **$10**, editable, hard-max **$25** — but this is your call and it's the number the UI shows as a guardrail. (Reminder: it's an **estimate**, not billed actuals — §4.2.)
2. **Circuit-breaker threshold.** How many provider `429`/auth/quota failures across children trip `halted`? Suggest **3 consecutive** or **5 total**. Too low = a transient blip kills a good overnight run; too high = defeats the guardrail.
3. **Schedule UX.** v1 ships one-shot delay only ("now" / "Tonight 2am"). Do you want an arbitrary datetime picker in v1, or just the two presets? (Recurring nightly = Phase-2 `upsertJobScheduler`.)
4. **Worker concurrency.** Stays at 2 (24 passes serialize ~2-at-a-time; a 10-min pass → overnight batch is hours). Make concurrency **configurable via env** and/or **cap batch size**? The UI must state expected completion time honestly either way.
5. **Does v1 ever include ghostwriter/mutating passes?** Recommendation: **no.** v1 = safe editors only (§1.3), which sidesteps the entire walk-away approval build (§5) — the editors never reach the gate. Including mutating passes pulls in the resolver-signature rework (§5.3) and the "silently rewrote my book" trust risk. Keep mutating batches for Phase-2, gated behind the DEFER policy.
6. **"Skipped" session status.** Children skipped by the pre-child guard are marked `failed` (no `skipped` enum on `AgentSession` today). Add a proper `skipped` status, or overload `failed` + a reason and let the digest relabel? (Cheapest: digest relabels; cleanest: new enum value.)
7. **Chapter status auto-advance in batch.** dev-edit/line-edit/beta-read advance chapter STATUS unattended (§6.3). Acceptable (content untouched, digest surfaces it), or should batch runs be **status-advance-suppressed** so the writer advances manually after reading findings? This is a product-trust call.

---

## Appendix — grounding citations (verified against code)

| Claim | File:line |
|---|---|
| Single `agent-sessions` queue, `defaultJobOptions` (attempts:3, backoff, removeOn*) | `src/lib/queue/agent-queue.ts:55-71` |
| `AgentJobData` shape (serializable, no keys) | `src/lib/queue/agent-queue.ts:18-51` |
| `enqueueAgentJob` (jobId = sessionId dedup) | `src/lib/queue/agent-queue.ts:80-84` |
| Single Worker (concurrency 2, stalled 60s, lock 5min) + `uncaughtException` → exit | `src/worker.ts:35-40, 80-88` |
| `processAgentJob` (unchanged per-child processor) | `src/lib/queue/agent-worker.ts:100` |
| `SessionCancelledError extends UnrecoverableError` | `src/lib/queue/agent-worker.ts:80-85` |
| Redis approvalResolver + 10-min auto-reject branch | `src/lib/queue/agent-worker.ts:352-393` |
| `APPROVAL_TIMEOUT_MS` duplicated | `orchestrator.ts:33`, `agent-worker.ts:57` |
| Cost finalized (`sharedCostTracker.totalCostUsd`) in onComplete | `src/lib/queue/agent-worker.ts:500-533` |
| `SessionBrief` only on budget/timeout early-end | `src/lib/queue/agent-worker.ts:538-560` |
| Dual-path decision (long-running → queue) | `src/app/api/books/[id]/agent/route.ts:385-424` |
| `sessionCostLimit` construction (finite, safety factor) | `src/app/api/books/[id]/agent/route.ts:373-378` |
| Budget helpers (`isOverBudget`, `normalizeSessionCostLimit`) | `src/lib/agents/budget.ts:24,32,40` |
| `estimateCost` (tokens × registry price) | `src/lib/cost.ts:8-19` |
| `SharedCostTracker` + per-turn accrual | `types.ts:145-154`, `orchestrator.ts:530-538` |
| v1 workflows (dev-edit/line-edit/beta-read/analyze, non-conversational, background) | `src/lib/agents/workflows.ts:221,240,259,330` |
| `WriteChapter` only on ghostwriter; `RequestApproval` on coach/ghostwriter/architect | `src/lib/agents/definitions.ts:55,19,57,121` |
| Chapter status advance (dev_edited/line_edited/beta_read) | `src/lib/agents/post-session.ts:65-72,407-413` |
| Findings capture / verify | `src/lib/agents/post-session.ts:336-373` |
| `AgentSession` (jobId, parent/child self-relation, status) | `prisma/schema.prisma:272-298` |
| `EditFinding`, `UsageRecord`, `BookNotification('pipeline_complete')` | `prisma/schema.prisma:363-398, 314-330, 582-601` |
| BullMQ 5.70.1 (FlowProducer/JobScheduler installed) | `package.json:53`; `node_modules/bullmq/dist/cjs/classes/` |
| Redis connection factory (BullMQ opts) | `src/lib/queue/connection.ts:21-24` |
| Dead `waitForApproval` — do not build on | `src/lib/queue/agent-worker.ts:714-772` |
| `WRAP_UP_TOOLS` excludes RequestApproval (precedent) | `src/lib/agents/orchestrator.ts:46-50,648-649` |
