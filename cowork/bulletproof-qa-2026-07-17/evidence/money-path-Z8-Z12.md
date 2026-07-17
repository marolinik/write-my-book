# Money-Path Correctness Audit — Z8–Z12

**Scope:** BullMQ agent worker + FlowProducer batch fan-out + Redis spend ledger (BYOK).
**Method:** Read actual source; tried to DISPROVE each suspect (find the guard that already prevents it) before confirming. No source modified.
**Date:** 2026-07-17 · **Branch:** main@478359c

## Verdict table

| ID | Verdict | One-line why | Test-provable | Severity |
|----|---------|--------------|---------------|----------|
| **Z8** | **REAL** (crash/stall re-spend) / PARTIAL on "double-record" | A crash or stalled-lock mid-orchestrator re-runs the WHOLE session on BullMQ retry with a fresh `sharedCostTracker` → real provider re-spend, no partial credit. `usageRecord.create` + ledger `incrbyfloat` have **no idempotency key**, so a stall-concurrency race double-records. Ordinary throw→retry does NOT double-charge (all throw points are pre-spend / unrecoverable-cancel). | Partial (missing-idempotency provable w/ heavy mocks; true retry/stall re-entry is integration/live only) | **Medium** |
| **Z9** | **NOT-REAL** (intended, gated, documented) — but documented bound is understated | Overshoot is by-design: the gate bounds DISPATCH, not total spend. BUT the code comment's worst case `cap + (concurrency-1)·perChild` is optimistic — the true bound is `cap + concurrency·perChild` (~$20 on a $10 cap w/ 2×$5 children), because 2 children clear the non-atomic guard at the same sub-cap reading. | Not as a bug (gate is correct + tested); the true bound is analytically demonstrable | Low-Med |
| **Z10** | **NOT-REAL** | Durable `BatchRun.halted` (set by cancel route, read by the pre-child guard IN PARALLEL with Redis) covers the 24h TTL expiry for a >24h-scheduled cancel. Breaker/cap halts only fire DURING the run (all children share one delay → run within 24h). Already covered by the M3 fail-safe test. | Yes — already covered (`agent-worker-batch-guard` M3 test) | N/A |
| **Z11** | **PARTIAL** (real under-report, not a money loss) | `readBatchLedger` returns `{spentUsd:0, halted:false, failureCount:0}` on ANY Redis read error → digest writes `spentUsd: 0` and can mislabel a breaker-only-halted batch as `done`. But this is post-fan-in REPORTING on a value explicitly "estimate, not billed"; children already ran, so no overspend/double-charge. | Yes — mock `redis.get` to reject, assert `spentUsd:0` written | Low |
| **Z12** | **NOT-REAL as money bug** / REAL ops-config gap | No `litellm` service in either compose file; `LITELLM_BASE_URL` defaults to `http://localhost:30400`. Direct openai/gemini/grok keys with NO OpenRouter key route to a dead proxy → connection-refused hard fail. But a failed connection spends **$0** (never reaches a provider). Availability/ops gap, not a money-correctness defect. | N/A (no wrong-money outcome to assert) | Med (ops/availability) |

---

## Z8 — BullMQ retry × LLM spend re-charge

**Verdict: REAL** (core claim holds) — with a precise scope. The "double-record UsageRecord/ledger" sub-claim is PARTIAL (only via the stall race).

### Where spend is recorded vs. where a retry re-enters
Recording happens exclusively in the orchestrator `onComplete` callback:
- `src/lib/queue/agent-worker.ts:720` — `db.usageRecord.create(...)` — **no `sessionId` on the row, no unique constraint → pure append, non-idempotent.**
- `src/lib/queue/agent-worker.ts:702-717` — `db.agentSession.update({ actualCostUsd: cost })` — idempotent (same row, last-writer-wins).
- `src/lib/queue/agent-worker.ts:638` — `publisher.incrbyfloat(`batch:${batchId}:spent`, cost)` — **non-idempotent (accumulates).**

The cost source is `sharedCostTracker`, constructed FRESH per `processAgentJob` invocation (`agent-worker.ts:421-425`, initialized to zero). There is **no checkpoint / resumption** — a retry restarts the orchestrator with an empty `messages` array (`orchestrator.ts:202-207`) and a zeroed tracker.

### Adversarial disproof attempt (why ordinary retry does NOT double-charge)
BullMQ retries only when `processAgentJob` **throws** (`agent-queue.ts:63-68`, `attempts:3`, exponential backoff). I traced every throw point:
- Pre-orchestrator throws — no coach model (`:297`), no API key (`:314`), book not found (`:334`): all occur **before any LLM call → zero spend.** Retry re-runs, still zero spend. No double-charge.
- Provider errors mid-session are **caught inside the orchestrator** (`orchestrator.ts:474-511`) → `break`, loop returns normally → `onComplete` records once → `runAgent` returns without throwing → `processAgentJob` returns normally → **no retry.** (Note `result.success` is even set `true` here, `orchestrator.ts:227-228`.)
- Cancellation throws `SessionCancelledError` (extends `UnrecoverableError`, `agent-worker.ts:161-166,872`) → **not retried.**
- `onComplete` wraps its whole body in try/catch and swallows (`agent-worker.ts:575-796`) → it never throws out to cause a retry after recording.

So in the normal "job threw → BullMQ retries" flow there is **no path where spend is recorded and then the job retries and records again.** This half of the suspect is disproven.

### The REAL exposure (confirmed)
Two windows survive the disproof:

1. **Crash mid-orchestrator (most likely).** `worker.ts:113-121` — an `uncaughtException` calls `process.exit(1)`. If attempt-1 has already made billable LLM calls but the process dies before `onComplete`, the job's BullMQ lock expires (`worker.ts:50`, `lockDuration:300_000`), it's marked stalled, and a restarted worker runs attempt-2 **from scratch → spends AGAIN at the provider.** Net money effect: provider billed ~2× (real re-spend at the user's key); the ledger/UsageRecord reflect only the successful attempt → the batch ledger **UNDER-reports** vs. the true provider bill (it does not double-record here).

2. **Stalled-lock concurrency race.** If the 5-min lock lapses while attempt-1 is still alive (event-loop starvation / a long unrenewed pass), BullMQ starts attempt-2 concurrently. Both can reach `onComplete` → **two `usageRecord.create` rows + two `incrbyfloat` increments** for the same `sessionId` (no dedup key) → genuine double-record and inflated `batch:{id}:spent`.

This is a **known, unmitigated** risk: the team's own `tests/unit/batch-lifecycle.test.ts:30-33` NOTE states the "lock-renewal-under-long-pass double-spend risk (BATCH-SPEC §4.5, §3.6, §8) cannot be exercised by a mocked unit test" and requires a live run — i.e. no code guard closes it.

### Concrete failure scenario
Batch child, per-session cap $5, coach = Anthropic (BYOK). Child spends $3.80 in LLM calls; worker OOM-killed (memory limit `docker-compose.yml:172-175`, 2G) before `onComplete`. Lock expires → retry. Retry re-runs the identical dev-edit pass, spends another ~$4 at the user's Anthropic key. **Provider bill ≈ $7.80; `batch:{id}:spent` records ≈ $4.** Aggregate cap enforcement now trusts an under-counted ledger.

### Test-provable?
- **Missing-idempotency property:** YES but heavy — mock the orchestrator to invoke `onComplete` twice for one `sessionId`, assert `usageRecord.create`/`incrbyfloat` fire twice (proves no dedup). Requires mocking Anthropic + orchestrator.
- **True retry/stall re-entry & re-spend:** NO — integration/live only (matches the file's own NOTE).

### Minimal root-cause fix sketch
Make recording idempotent per `(sessionId, attempt)`:
- Add `sessionId` to `UsageRecord` with a unique index and `create`-guard (skip if exists), OR write the ledger increment through a Lua/`SET NX` keyed by `batch:{id}:charged:{sessionId}` so a re-run credits the prior partial instead of re-adding.
- For the re-spend itself, gate the pre-orchestrator guard on a per-session "already-charged" marker so a completed-but-crashed session isn't fully re-run (best-effort resumption is out of scope for a minimal fix).

---

## Z9 — Aggregate cap enforced only BETWEEN children (concurrency overshoot)

**Verdict: NOT-REAL as a bug** (the overshoot is intended, gated, and documented) — **but the documented worst-case bound is understated.**

### Adversarial confirmation the behavior is intended
- `src/lib/agents/batch-budget.ts:22-28` documents exactly this: "this bounds the GATE, not total spend … up to `(concurrency-1)` already-in-flight children can finish and overshoot … Worst-case total spend is bounded by `cap + (concurrency-1)·maxPerSessionCap`, NOT 'spend never exceeds cap'."
- `tests/unit/batch-budget.test.ts:9-16` deliberately asserts the gate (no new child after `spent>=cap`) and explicitly does **not** assert zero-overshoot.
- The gate itself is correct: `shouldRunBatchChild` (`batch-budget.ts:30-38`) returns `false` once `spentUsd >= capUsd`. The pre-child guard reads Redis `:spent` + `:halted` + DB `halted` before building anything (`agent-worker.ts:220-246`).

Because a passing test asserts the correct gate behavior and the overshoot is documented/accepted, this is not a defect.

### The one real inaccuracy (worth a fix)
The stated bound `cap + (concurrency-1)·maxPerSessionCap` **understates** the true worst case. The guard read (`agent-worker.ts:221`) and the completion increment (`:638`) are not atomic, and `concurrency` job bodies run simultaneously. **All `concurrency` children can clear the guard at the same sub-cap `spent` reading.**

Worst case (defaults: cap $10, `AGENT_WORKER_CONCURRENCY=2` per `worker.ts:44`, per-child session cap ≥ $5 per `route.ts:222-225` `max(preEstimate.max·2, $5)`):
- Prior cheap children bring `spent → $9.99`. Two slots free. Child A reads $9.99 < $10 → admitted. Child B reads $9.99 < $10 → admitted (before either increments). Each spends up to $5.
- Final `spent ≈ $9.99 + $5 + $5 = $19.99`. **Overshoot ≈ $10 = concurrency·perChild**, not the documented `(concurrency-1)·perChild = $5`.

So the suspect's phrasing ("overshoot up to per-child × concurrency") is actually the correct bound; the code comment is optimistic by one per-child cap. With `MAX_BATCH_CAP_USD=$25` (`route.ts:25`) and an operator-raised concurrency, the exposure scales linearly (`cap + N·perChild`).

### Severity / fix
Bounded, BYOK, capped input — Low-Med. Fixes: (a) correct the comment + BATCH-SPEC §4.5 to `cap + concurrency·maxPerSessionCap`; (b) optionally make guard+reservation atomic (reserve `perChildCap` via `incrbyfloat` at admit, refund the delta at completion) to restore a true `cap + (concurrency-1)·perChild` or tighter bound.

---

## Z10 — Redis 24h TTL vs. long-scheduled batch

**Verdict: NOT-REAL.** The durable `BatchRun.halted` covers the TTL-expiry-before-run case; the pre-child guard reads it in parallel with Redis.

### Disproof trace
- The suspect's worry is a >24h-scheduled batch losing its Redis halt/cancel flag before children run. All children share **one** delay computed once (`batch-flow.ts:144-146`, `scheduledFor - now`), so they fire together — there is no >24h spread among children.
- The only flag set *before* children run is a **cancel**: `cancel/route.ts:59` sets Redis `:halted` (EX 86400) **AND** `:61-64` durably sets `BatchRun.halted=true, status='cancelled'` in Postgres. The cancel route's own comment (`:23-27`) calls out the "cancel an evening-scheduled 2am batch" case and the TTL bound.
- The pre-child guard reads BOTH: `agent-worker.ts:221-236` — `halted = haltedRaw === "1" || batchRow?.halted === true`, with `db.batchRun.findUnique(... select:{halted}).catch(()=>null)`. So after the 24h Redis TTL expires, a child >24h later still sees `batchRow.halted === true` → `shouldRunBatchChild(..., true) → false` → marked `skipped`, never spends.
- Breaker halt (`recordBatchFailure`, `agent-worker.ts:118-147`) and cap halt (`onComplete`, `:649-661`) only fire **during** the run (a child must fail/complete first) — i.e. after 2am, within the 24h window. The `:spent` ledger key is (re)stamped `EX 86400` on every increment (`:647`), and the batch fans in within hours.

### Test-provable / coverage
The covering behavior is already tested: `agent-worker-batch-guard.test.ts:151-168` ("M3 fail-safe: skips when Redis is clean but `BatchRun.halted` is set in the DB"). That is precisely the "Redis flag gone, DB flag durable" path. Not a bug.

---

## Z11 — Digest ledger best-effort zeros on Redis hiccup

**Verdict: PARTIAL** — a real under-reporting/mislabel bug, but reporting-only (no overspend, no double-charge).

### Evidence
`src/lib/queue/batch-digest.ts:36-57` `readBatchLedger`: all three reads are in one `Promise.all`; on ANY rejection the catch returns `{ spentUsd: 0, halted: false, failureCount: 0 }`. The digest then writes those straight through:
- `batch-digest.ts:146-158` — `db.batchRun.update({ spentUsd: ledger.spentUsd, halted, ... })` → **`spentUsd` persisted as `$0.00`.**
- `batch-digest.ts:169-183` — morning notification message renders `$0.00 / $cap`.

Worst manifestation via the halt path: `halted = ledger.halted || batch.halted` (`:107`). A **breaker**-halted batch sets only Redis `:halted` (`recordBatchFailure` never writes DB). If Redis hiccups at digest time, `ledger.halted=false` AND `batch.halted(DB)=false` → digest computes `halted=false`, `haltReason=null`, and (if any child completed) status `done` — i.e. a provider-failure-halted batch is **mislabeled `done` with $0 spend.**

### Why it's not a money loss (adversarial classification)
This runs only at fan-in, after every child is already terminal (`batch-flow.ts:5-8`). The ledger is explicitly documented as "reconciled from the Redis ledger `batch:{id}:spent` (estimate, not billed)" (`batch-digest-aggregate.ts:48`). Actual spend already happened on the user's BYOK key. So the defect is a **misleading morning report / wrong `BatchRun.spentUsd` + status label**, not overspend or double-charge. No existing test exercises the Redis-read-failure branch (the aggregate test passes `spentUsd` directly; the lifecycle test's in-memory Redis never throws).

### Concrete scenario
24-child overnight batch spends $9.50, breaker trips at child 20 (Redis `:halted=1`). Digest's `Promise.all` GET rejects (transient Redis blip). Morning notification: "**$0.00 / $10.00 cap**", `BatchRun.status='done'` — writer believes nothing was spent and the run finished clean; it was actually halted at $9.50.

### Test-provable? YES (deterministic)
Mock `createRedisConnection().get` to reject; call `processBatchDigestJob`; assert the `db.batchRun.update` payload has `spentUsd: 0` and (breaker case, DB `halted:false`) `status:'done'`.

### Minimal fix
Read each key independently with per-key `.catch(()=>null)` so a single failed GET doesn't zero the others; and when the read fails, prefer the persisted DB values (`batch.spentUsd`, `batch.halted`) over hard zeros — i.e. don't overwrite a known non-zero `spentUsd`/`halted` with a fallback zero.

---

## Z12 — LiteLLM undeclared prod dependency

**Verdict: NOT-REAL as a money bug** — it is a **REAL ops/config gap** (correctly self-classified by the suspect).

### Evidence
- `src/lib/llm/client-factory.ts:27` — `LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || "http://localhost:30400"`.
- `resolveProviderRoute` (`client-factory.ts:196-266`) routes direct openai/gemini/grok keys to `route:"litellm-proxy"` at that base URL, with OpenRouter as the only fallback (`:208-216`, `:232-240`, `:256-264`). If the user has a direct provider key but **no** OpenRouter key, there is no fallback.
- Neither `docker-compose.yml` nor `docker-compose.prod.yml` defines a `litellm` service (confirmed by full read). A standalone `litellm-proxy.py` / `litellm-config.yaml` exist in the repo but are **not wired into either compose stack** and nothing sets `LITELLM_BASE_URL` in the `worker`/`app` service env blocks.

### Why it's not a money-correctness defect
A down proxy yields a connection error (no HTTP status). `extractStatus` returns null (`retry-handler.ts:37-49`), so `withProviderRetry` throws `ProviderError(500)` immediately (`:98-101`); the orchestrator catches it, emits an SSE error, and breaks (`orchestrator.ts:494-510`). **No provider call succeeds → $0 spent.** It is not breaker-eligible (500 ∉ {401,402,403,429}, `agent-worker.ts:85`), so it doesn't corrupt the batch breaker either. The outcome is an availability failure, not a wrong-money outcome.

Secondary (non-money) quirk noted in passing: such a provider-error child returns from the loop normally, so `onComplete` marks it `status:'completed'` with `$0` cost (`orchestrator.ts:227-228` sets `success:true`), which the digest then counts as a completed pass. That is a status-accuracy issue, out of money-path scope.

### Severity / fix
Med (availability). Fix is ops/config, not code: add a `litellm` service to the compose stack and set `LITELLM_BASE_URL` in the `app`+`worker` env, OR (product decision) document that direct openai/gemini/grok BYOK requires an OpenRouter key as the routing path and validate that at key-save time.

---

### Cross-cutting note
Z8 (retry re-spend / non-idempotent recording) and Z9's understated bound both feed the same downstream value — the `batch:{id}:spent` ledger the aggregate cap trusts. Z8 can make it under-count (crash) or over-count (stall race); Z9 lets true spend exceed the documented bound. Neither is catastrophic (BYOK, hard $25 cap input), but a per-session idempotency key on the ledger increment would close Z8's double-record and make the ledger a trustworthy basis for the cap.
