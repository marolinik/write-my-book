# Capability Surface Inventory (verified 2026-07-17)

All claims verified against code at `main@478359c` (tree clean). Paths are repo-relative to `D:\Projects\wmb-pub`. Uncertain items marked (?).

## 1. Background job system (BullMQ)

Files: `src/worker.ts`, `src/lib/queue/{connection,agent-queue,agent-worker,batch-flow,batch-digest}.ts`

- **2 queues, 1 worker process.** `agent-sessions` (agent jobs, concurrency `AGENT_WORKER_CONCURRENCY` default 2) + `batch-digest` (fan-in parents, concurrency 2) — both Workers share one Node process (`src/worker.ts:46-61`).
- **Job type `agent-session`** — `AgentJobData` is fully serializable, NO API keys (worker re-fetches + decrypts from DB per job) (`src/lib/queue/agent-queue.ts:18-55`, `agent-worker.ts:267-291`).
- **Retry/backoff:** 3 attempts, exponential 30s base (30/60/120s); retention removeOnComplete 100 / removeOnFail 50 (`agent-queue.ts:63-74`). FlowProducer children restate the same options explicitly (defaults not inherited) plus `ignoreDependencyOnFailure: true` so a failed child never wedges the digest parent (`batch-flow.ts:87-93`).
- **Dedup:** BullMQ `jobId = sessionId` (`agent-queue.ts:84-88`; same pattern for batch children `batch-flow.ts:166-205`).
- **FlowProducer fan-out (overnight batch):** `enqueueBatchFlow` expands (workflows × chapters) into N children on `agent-sessions` + ONE digest parent on `batch-digest`; schedule delay lives on the CHILDREN (parent is pure fan-in, delay 0, attempts 1) (`batch-flow.ts:114-245`).
- **Digest (fan-in):** defensively wrapped, never throws to process level; reads persisted DB artifacts (AgentSession/EditFinding/Chapter) + Redis ledger, writes `BatchRun.digest`/status and one `BookNotification('pipeline_complete')` (`batch-digest.ts:62-205`; pure aggregation in `src/lib/agents/batch-digest-aggregate.ts`).
- **Aggregate budget ledger (Redis):** `batch:{id}:spent` INCRBYFLOAT per completed child; cap crossing sets `batch:{id}:halted`; pre-child guard consults Redis spent+halted AND durable `BatchRun.halted` (Postgres fail-safe for Redis write failure), skipping child as `skipped` with zero spend (`agent-worker.ts:211-246, 636-700`; pure logic `src/lib/agents/batch-budget.ts`).
- **Circuit breaker:** 3 consecutive OR 5 total provider 401/402/403/429 child failures trip halt (`agent-worker.ts:75-147`); clean completion clears consecutive streak.
- **Cancel/TTL semantics:** per-session cancel via Redis flag `session:{id}:cancel` polled every 5th streamed message → `SessionCancelledError extends UnrecoverableError` (no retry) (`agent-worker.ts:161-166, 525-550, 874-885`). Batch cancel sets Redis halt flag (24h TTL) + BatchRun `cancelled` + best-effort removes delayed parent; in-flight children finish (`src/app/api/books/[id]/batch/[batchId]/cancel/route.ts`). All Redis session/batch keys carry 24h TTL (`REDIS_TTL_SECONDS = 86_400`).
- **Progress delivery:** Redis PUBLISH `session:{id}` + RPUSH `session:{id}:messages` catch-up list + `session:{id}:status` key; SSE route subscribes (`agent-worker.ts:255-263`, stream route `src/app/api/books/[id]/agent/[sessionId]/stream/route.ts`).
- **Approval gates:** Redis `approval:{id}` pending state, 2s polling, 10-min timeout → reject (`agent-worker.ts:472-513, 939-997`).
- **Crash policy:** `uncaughtException` → Sentry flush → `process.exit(1)` (supervisor restarts; staying alive would defeat the liveness probe) (`src/worker.ts:113-121`). Stalled check 60s, lock 5 min.
- **Worker liveness:** `/api/health/dependencies` 503s when `agentQueue.getWorkers()` = 0; SSE watchdog + client backstop (`src/lib/health/worker-liveness.ts`, `docs/deployment-topology.md`).

## 2. AI / agent layer

Files: `src/lib/agents/*`, `src/lib/llm/*`, direct-LLM routes under `src/app/api/`

**Routing (BYOK-only, no platform key fallback):** 5 providers (anthropic, openrouter, openai, gemini, grok — `src/lib/llm/providers.ts`); 37-model registry with per-1M pricing + tiers (`src/lib/llm/model-registry.ts`). Route chain: direct Anthropic → OpenRouter fallback; openai/gemini/grok: direct key via **LiteLLM proxy** (`LITELLM_BASE_URL` default `http://localhost:30400`, per-request `x-provider-key` header) → OpenRouter fallback → explicit error (`src/lib/llm/client-factory.ts:150-272`). All calls go through the Anthropic SDK regardless of provider. Per-role model resolution: book settings → user global role overrides → user default → registry default (`src/lib/llm/model-resolver.ts`, applied in `agent-worker.ts:352-417`). Retry handler: 3 retries, backoff 10/30/60s on 429/5xx/529 (`src/lib/llm/retry-handler.ts:11-13`).

LLM-powered capabilities (each: model, prompt, mode, guards):

1. **Orchestrated agent workflows (29 workflows × 14 agent types)** — chapter generation (`write-chapter`/ghostwriter), dev-edit, line-edit, beta-read, analyze, story-bible creation, architecture, style capture/refresh/evolve, onboarding (`onboard-new-book`, `onboard-imported-book`), manuscript read, freewrite, free-drive, revise, discuss-edits, publishing-check, market-analysis, research-world/topic, 4 series workflows, open coach chat. Workflow ids: `src/lib/agents/workflows.ts`; agent system prompts: `src/lib/agents/definitions.ts` (+ `prompt-assembler.ts` context assembly, `skills/` craft guides). Streaming (`client.messages.stream`) through the tool-use loop in `src/lib/agents/orchestrator.ts`; conductor delegates to specialists priced at each model's own rate. Guards: per-session cost cap (route computes `max(2× estimate, $5)`, orchestrator default $10; `orchestrator.ts:31-32`, `agent/route.ts:49,375-377`), wall-clock ceiling (estMaxMin+30 min; default 30 min), 80% budget nudge + armed wrap-up turn with tool allowlist, Infinity→null BullMQ trap normalized (`src/lib/agents/budget.ts`).
2. **CAS / conversational sessions** — `isConversational` workflows persist `ConversationTurn` history; continuation via `agent/[sessionId]/message/route.ts` (direct `messages.create`); immersive CAS UI in `src/components/editor/immersive-*`.
3. **Findings Discuss (Tier 4.2)** — one cheap-tier tool-less turn, `max_tokens: 700`, 3-user-turn cap, extracts constraints into `WriterMemory(source="conversation")` (`src/lib/editorial/{discuss-llm,discuss-prompt,finding-conversation}.ts`, route `.../findings/[findingId]/discuss/route.ts`).
4. **Inline edit** — cheap-tier variant of user's own provider (`resolveCheapModelFor`), quota-gated, zod-validated (`src/app/api/books/[id]/inline-edit/route.ts`).
5. **Ghost text** — cheap-tier, `max_tokens: 60` continuation (`.../ghost-text/route.ts`).
6. **Character chat** — cheap-tier, `max_tokens: 512` (`.../character-chat/route.ts`).
7. **Marketing kit** — `max_tokens: 4096` (`.../marketing-kit/route.ts`).
8. **Wiki populate** — cheap-tier, `max_tokens: 8192` (`.../wiki/populate/route.ts`).
9. **Continuity entity extraction (Tier 4.4)** — cheap-tier structured JSON with **jsonrepair** guard (only file importing it), writes Neo4j graph then derives `ContinuityFlag` rows (`src/lib/graph/entity-extractor.ts`, `src/lib/continuity/{continuity-flags,flag-sync}.ts`, scan route with 90s min-interval + 5s graph timeout `.../continuity/scan/route.ts:18-19`).
10. **Series agent + ambient series awareness (Tier 4.3)** — series-level workflows (`src/app/api/series/[id]/agent/route.ts`); ambient context/synthesis is non-LLM document assembly (`src/lib/series/{ambient-context,series-synthesizer}.ts`).
11. **Memory/preferences** — `WriterMemory` CRUD + learned entries from negative feedback (`src/lib/agents/writer-memory.ts`, feedback route); `SessionBrief` persisted on budget/timeout end (`agent-worker.ts:736-758`, `session-brief.ts`).
12. **Embeddings (only non-BYOK LLM call)** — OpenAI `text-embedding-3-small` (1536-dim) via platform `OPENAI_API_KEY` env, gracefully disabled when absent (`src/lib/vector/embeddings.ts`).

Post-session processing (findings persist via CreateFinding tool, beta-gate parse, chapter status advance — suppressed for batch children): `src/lib/agents/post-session.ts`. Batch model resolution fails fast pre-enqueue (`src/lib/batch/resolve-batch-models.ts`); batch eligibility allowlist = {dev-edit, line-edit, beta-read, analyze} only (no WriteChapter/RequestApproval tools) (`src/lib/batch/eligibility.ts`).

## 3. Data layer

**Prisma/Postgres — 32 models, 3 enums** (`prisma/schema.prisma`; note: `prisma db push` flow, no migration history — `docs/database-deploy-backup.md`):

- `User` — account + global per-role model overrides; `Subscription` — Stripe plan/status/trial; `StripeWebhookEvent` — webhook dedup; `FounderSlot` — 200-cap founder claims; `ApiKey` — encrypted BYOK keys (unique user+provider).
- `Series` (+enum `SeriesType`), `Book` (**`archivedAt`** for Shelf 4.8, `@@index([userId, archivedAt])`), `Chapter` — status pipeline + betaGate.
- `Document` (+enum `DocumentType`, 21 types incl. series-level) + `DocumentVersion` — S3-keyed versioned artifacts.
- `AgentSession` (jobId, **batchId**, cost/token columns), **`BatchRun`** (+enum `BatchStatus`; budgetCapUsd/spentUsd/halted/haltReason/digest/parentJobId), `ConversationTurn`, `UsageRecord` — per-session metering.
- `BookSettings` — per-book model roles, beta panel, journey snapshot.
- Editorial: `EditFinding` (anchors, alternatives, grounding, content-hash dedup), **`ContinuityFlag`** (signature-unique, Tier 4.4), **`FindingReply`** (role user|assistant, Tier 4.2), `DismissedPattern`, `CrutchPhrase`, `EditAction`.
- Voice: `CharacterLens`, `StyleProfile`.
- Awareness: `BookInsight` (blackboard), `BookHealthSnapshot`, `DocumentChangeEvent`, `BookNotification`, `WritingGoal`, `WikiEntity`.
- Memory: **`WriterMemory`** (findingId link for conversation-sourced), `SuggestionFeedback`, `SessionBrief`.

**Qdrant** — single collection `wmb_memory`, 1536-dim, rich payload (bookId/docType/chapter/characterNames/…); docTypes embedded: chapter, story_bible, architecture, style, conversation, finding, research (`src/lib/vector/{types,qdrant-client,indexer,memory-manager,retriever}.ts`); old 3-collection layout auto-deleted on init.

**Neo4j** — knowledge graph (Character/Location/Event/Object/PlotThread/Faction/Chapter/Scene nodes, 15+ relationship types) for continuity checks; driver singleton `bolt://` with env creds (`src/lib/graph/{neo4j-client,schema,graph-builder,graph-queries,graph-maintenance}.ts`). Optional-but-recommended in prod (`docs/deployment-topology.md`).

## 4. Billing / entitlements

Files: `src/lib/billing/{stripe-client,plan-gating,quota-checker}.ts`, `src/app/api/billing/{checkout,portal,subscription,webhook,founder-count}/route.ts`

- **Plans:** founder $19/mo (200 slots, no trial), indie $49 (2 books, 14-day trial), professional $99, publisher $499; series+analytics gated to pro+ (`stripe-client.ts:7-95`).
- **Gating invariants:** export ALWAYS allowed; Stripe unset (self-hosted) → everything allowed; none/canceled → read-only; expired trial → treated canceled; **past_due grace** (still allowed, Stripe retries) (`plan-gating.ts`).
- **Metering:** `UsageRecord` per session/route + `estimateCost` (`src/lib/cost.ts`); BYOK model means NO platform spend caps (`getSessionCostLimit` deprecated → Infinity, `quota-checker.ts:39-44`); real money guards are the per-session cap + batch aggregate cap (§1).
- **Batch money caps:** default $10, hard max $25 aggregate; per-child budget `max(2× estimate, $5)`; ≤4 workflows per batch (`src/app/api/books/[id]/batch/route.ts:18-29`).
- **Webhook:** signature-verified, `StripeWebhookEvent` idempotency table (tested in `tests/unit/billing-webhook-route.test.ts`).
- Config verifiers: `scripts/check-stripe-config.ts` (`npm run billing:check`), `scripts/check-clerk-config.ts`.

## 5. Infra

- **docker-compose.yml:** postgres:16, redis:7 (password), minio + bucket-init (`wmb-projects`), neo4j:5-community, qdrant v1.13.2, `app` (Dockerfile, healthcheck on `/api/health/dependencies`), `worker` (Dockerfile.worker, 2G mem limit). All ports bound 127.0.0.1. **No LiteLLM service in compose** — proxy is `litellm-proxy.py` run separately (?deployment).
- **docker-compose.prod.yml:** NODE_ENV=production + `db-backup` sidecar (hourly pg_dump→gzip→MinIO `backups/hourly|daily|weekly` with `scripts/backup-rotate.sh`).
- **Env validation:** `src/lib/env.ts` — 21 required web keys (Clerk, Stripe ×7 price IDs, S3, Redis, DB, encryption secret), 7 worker keys; placeholder patterns fail closed in prod; DEV_AUTH_BYPASS banned in prod; HTTPS enforced; Sentry/Qdrant/Neo4j optional-warn. CLI: `scripts/check-env.ts`.
- **Sentry:** `sentry.{client,edge,server}.config.ts` + worker's own init (`src/worker.ts:27-31`); server config recursively redacts key-shaped fields and sk-ant/sk-or/sk-proj/xai/AIza patterns from all events.
- **LiteLLM config:** `litellm-config.yaml` — 6 OpenRouter-hosted OSS models (minimax-m2.5, qwen3.5-397b, qwen3-max-thinking, kimi-k2.5, glm-5, deepseek-v3.2) on server `OPENROUTER_API_KEY`; drop_params, 2 retries, 300s timeout. `litellm-proxy.py` also passes through openai/gemini/grok with per-request `x-provider-key` (default port 30399/30400 mismatch by 1 — script default 30399, `LITELLM_BASE_URL` default :30400 (?)).
- **S3/MinIO:** `S3Adapter` implements `StorageAdapter` (read/write/buffer/list/delete, path-style) for all document/version bodies + backups (`src/lib/storage/s3-adapter.ts`, keys in `src/lib/documents/storage-keys.ts`).
- **Export pipeline:** shells out to **pandoc** (docx/epub) and **typst** (`--pdf-engine`) via `exec`; templates in `export-templates/` (5 lua filters, epub-genre.css, typst-book.typ); EPUB post-processed via JSZip for per-file titles; chapter-heading normalization (`src/lib/import-export/export-pipeline.ts:361-417`).

## 6. Test harness

- **Vitest:** 61 unit suites, ~422 `it()/test()` cases (`tests/unit/`, `vitest.config.ts`); money-path harness present: `orchestrator-budget`, `budget`, `batch-budget`, `batch-lifecycle`, `batch-route`, `agent-worker-batch-guard`, `batch-digest-aggregate`, `billing-webhook-route`, `plan-gating` tests. (Handoff records 411/411 green at 478359c — count-vs-411 delta = nested/skipped, not verified by run here.)
- **Playwright e2e:** 19 specs, ~123 `test()` cases (`tests/e2e/`): auth, api-keys, api-health, billing, book-crud, dashboard, documents, editorial, inline-edit, model-selection, beta-score, vector-memory, offline-autosave, mobile-editor, a11y, ui-flows, smoke-test, deployment-smoke, settings. `playwright.config.ts` starts local dev server (live Postgres/Redis/etc. infra deps; `PLAYWRIGHT_BASE_URL` overridable); fixtures + global-setup handle auth.
- **Deployment smoke:** `scripts/smoke-deployment.ts` (`npm run smoke:deployment`) + `playwright.deployment.config.ts` (requires `SMOKE_BASE_URL`/`PLAYWRIGHT_BASE_URL`, no webServer — runs against a live deployment; `npm run test:deployment-smoke`).

## 7. Ops / deployment

- **Topology (docs/deployment-topology.md):** HARD two-process contract — web (`node server.js`, :3000) + worker (`node dist-worker/worker.js`) both mandatory; worker-down is page-worthy (503 readiness + SSE watchdog + client backstop). Required: Postgres 16, Redis 7, S3/MinIO; recommended: Qdrant, Neo4j. Only reverse proxy public.
- **DEPLOYMENT.md:** full VPS runbook (DNS, Caddy/nginx TLS, compose bring-up, Clerk/Stripe production setup).
- **production-readiness.md:** CI green (lint/build/worker-build/prisma generate); DB deploy = backup → `prisma generate` → `prisma db push` in maintenance window → smoke (`npm run db:push:prod` = `db:deploy:check` + generate + push); Stripe/Clerk static contract checks (`billing:check`, `auth:check`).
- **KNOWN PENDING GATE:** production schema push for batch + Tier 4.8/4.4/4.2 tables (`npm run db:push:prod`) — dev DB pushed+verified, prod NOT (per session handoffs 2026-07-03/06 in project memory; consistent with push-based flow in `docs/database-deploy-backup.md`). Verify prod schema before exercising batch/shelf/continuity/discuss in prod.

## Risk register (code-observed)

1. **BullMQ retry × LLM spend (double-spend):** a job failing after partial provider spend retries up to 3× and re-runs the orchestrator from scratch; `UsageRecord`/session cost only written in `onComplete` — retried attempts' partial spend is unrecorded and unbounded by the ledger (`src/lib/queue/agent-queue.ts:63-68`, `agent-worker.ts:702-731`).
2. **Batch cap is enforced only between children:** pre-child guard + post-completion INCRBYFLOAT means 2 concurrent children admitted under-cap can both overshoot; overshoot magnitude = per-child budget (up to `max(2×est,$5)` × concurrency) (`agent-worker.ts:211-246, 636-661`).
3. **Redis 24h TTL vs long-scheduled batches:** cancel/halt flags and ledger keys carry 86_400s TTL while `scheduledFor` is unbounded — a batch scheduled >24h out loses its pre-set halt/cancel flag before children run (durable `BatchRun.halted` covers cancel only if that path set it) (`batch/[batchId]/cancel/route.ts` HALT_FLAG_TTL_SECONDS, `agent-worker.ts:127-131`).
4. **LLM output parsing:** entity extraction relies on jsonrepair over free-form model JSON (`src/lib/graph/entity-extractor.ts`); beta-read gate parses report text via `parseAgentOutput` (`src/lib/agents/post-session.ts:404-407`); discuss replies parsed by `parseDiscussResponse` — all silent-degrade on malformed output.
5. **Cancel latency / uninterruptible children:** cancel flag checked only every 5th streamed message — a long non-streaming tool call or provider stall delays cancellation; batch in-flight children explicitly cannot be interrupted (v1) (`agent-worker.ts:525-570`, batch cancel route docstring).
6. **Worker crash-and-exit model:** `uncaughtException → process.exit(1)` relies on supervisor restart (`restart: unless-stopped`); stalled-job recovery (lock 5 min) re-runs jobs — combined with #1 this is the main crash-recovery money path (`src/worker.ts:113-121, 46-51`).
7. **Stripe webhook ↔ subscription state:** dedup via `StripeWebhookEvent` is insert-based; ordering/races between checkout, webhook, and portal updates gate the entire entitlement surface (`src/app/api/billing/webhook/route.ts`, `plan-gating.ts` past_due/trial edge logic).
8. **Autosave/version conflicts:** chapter content PUT uses optimistic CAS with 409 `version_conflict` responses; client-side draft buffer + offline store + immersive sync scheduler must all honor it — multi-tab/offline replays are the fragile path (`src/app/api/books/[id]/chapters/[chapterId]/content/route.ts:111-147`, `src/lib/offline/draft-store.ts`, `src/components/editor/immersive-sync-scheduler.ts`).
9. **LiteLLM proxy is an undeclared prod dependency:** direct openai/gemini/grok BYOK keys route to `LITELLM_BASE_URL` (localhost default) but no compose service exists; without a deployed proxy those users silently depend on the OpenRouter fallback path — and users with ONLY a direct openai/gemini/grok key get hard failures (`src/lib/llm/client-factory.ts:196-266`, `docker-compose.yml`).
10. **Digest ledger read is best-effort zeros:** a Redis hiccup during fan-in reports `$0 spent / not halted` into the morning digest and `BatchRun.spentUsd` (DB rows keep per-session costs, but the reconciled aggregate can silently under-report) (`src/lib/queue/batch-digest.ts:36-57, 146-158`).
