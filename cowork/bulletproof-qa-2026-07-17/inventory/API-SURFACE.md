# API Surface Inventory (verified 2026-07-17)

Scope: every `src/app/api/**/route.ts` in D:\Projects\wmb-pub @ main (478359c). **89 route files, 130 exported handlers** (GET 55, POST 48, PATCH 14, DELETE 11, PUT 2). All paths verified by reading the route source; nothing inferred from naming alone.

Legend: **Clerk** = session resolved via `requireUser()`/`getDbUser()` (src/lib/auth.ts:16-100); **book-fence** = `db.book.findFirst({ where: { id, userId: user.id } })` before any action; **series-fence** = same on `db.series`; **zod** = schema from `src/lib/validation.ts` (60 exported schemas) or a route-local `z.object`. Error envelope everywhere is `{ error: string }` (+ `details` on zod failures) unless noted.

---

## Books (core CRUD)

- `GET /api/books` — list caller's non-archived books (+series, settings, counts); Clerk; scoped `where: { userId }`; no body. 401/500.
- `POST /api/books` — create book (+default settings + empty Chapter 1, write-first onboarding); Clerk; **plan gate** `checkPlanAccess("create_book")` → 403 w/ `upgradeToTier`; zod `createBookSchema`; 409 duplicate name; cross-user `seriesId` rejected 404 (route.ts:64-75).
- `GET /api/books/[id]` — fetch one book (+series, settings, chapters, counts); Clerk + book-fence; 404.
- `PATCH /api/books/[id]` — update book fields; Clerk + book-fence; zod `updateBookSchema`.
- `DELETE /api/books/[id]` — cascade-delete book; Clerk + book-fence; fire-and-forget vector cleanup (`deleteBookChunks`).
- `POST /api/books/[id]/archive` — archive/restore via `archivedAt`; Clerk; atomic ownership-fenced `updateMany({ id, userId })` → 404 on count 0; zod route-local.
- `GET /api/books/[id]/settings` — get BookSettings (auto-creates default); Clerk + book-fence.
- `PATCH /api/books/[id]/settings` — upsert BookSettings; Clerk + book-fence; zod `updateSettingsSchema`.

## Chapters

- `GET /api/books/[id]/chapters` — list chapters; Clerk + book-fence.
- `POST /api/books/[id]/chapters` — create chapter (+increments `book.chapterCount`); Clerk + book-fence; zod `createChapterSchema`.
- `GET /api/books/[id]/chapters/[chapterId]` — get chapter; Clerk + book-fence + chapter scoped by bookId.
- `PATCH /api/books/[id]/chapters/[chapterId]` — update chapter; Clerk + book-fence; zod `updateChapterSchema`.
- `DELETE /api/books/[id]/chapters/[chapterId]` — delete (+decrement count, fire-and-forget `deleteChapterChunks`); Clerk + book-fence.
- `GET /api/books/[id]/chapters/[chapterId]/content` — read chapter markdown via DocumentService `readPinned` (version-consistent snapshot); Clerk + book-fence; sanitizes U+FFFD→em-dash.
- `PUT /api/books/[id]/chapters/[chapterId]/content` — save chapter markdown; Clerk + book-fence; zod `updateChapterContentSchema`; **optimistic locking**: `expectedVersion` CAS → **409 `version_conflict`** with `currentVersion` + `serverContent` (route.ts:131-151); updates chapter/book word counts.
- `PATCH /api/books/[id]/chapters/reorder` — atomic two-phase renumber of chapters AND their scoped documents in one transaction (unique-constraint-safe); Clerk + book-fence; zod route-local (dupe ids/numbers → 400); all chapterIds must belong to the book (404 otherwise).

## Documents (story bible / manuscripts)

- `GET /api/books/[id]/documents` — list via DocumentService; Clerk + book-fence.
- `POST /api/books/[id]/documents` — create doc (updates Chapter.wordCount for CHAPTER_CONTENT); Clerk + book-fence; zod `createDocumentSchema`.
- `GET /api/books/[id]/documents/[docId]` — read doc + content; Clerk + book-fence + doc scoped by bookId.
- `PATCH /api/books/[id]/documents/[docId]` — update content; Clerk + book-fence; zod `updateDocumentSchema`; CAS `expectedVersion` → **409 `version_conflict`** (route.ts:107-125); fire-and-forget vector re-index.
- `DELETE /api/books/[id]/documents/[docId]` — delete + fire-and-forget vector chunk cleanup; Clerk + book-fence.
- `GET /api/books/[id]/documents/[docId]/versions` — list versions; Clerk + book-fence.
- `GET /api/books/[id]/documents/[docId]/versions/[version]` — version content; Clerk + book-fence; manual int parse → 400.
- `POST /api/books/[id]/documents/[docId]/restore` — restore version; Clerk + book-fence; zod `restoreVersionSchema`.

## Chat / CAS (agent sessions)

- `POST /api/books/[id]/agent` — start agent session (Writing Coach conductor); Clerk + book-fence; zod route-local `startSessionSchema` (+`pageContextSchema`); **plan gate** `checkQuota("use_agent_session")` → 429; prerequisite validation → 422; setup-completeness guard → 422 w/ `redirectTo`; minimum model-tier check → 422 `blocked`; BYOK key required → 400 if no provider key; key re-validated at session start → 400; **dual path**: long non-conversational workflows enqueue to BullMQ (`{ sessionId, queued: true, jobId }`), short/conversational run inline. Per-session budget = max(2× estimate, $5) — deliberately finite (Infinity doesn't survive BullMQ JSON). Sanitized errors (no raw messages).
- `GET /api/books/[id]/agent/[sessionId]/stream` — **SSE** (`text/event-stream`); Clerk + session fenced `{ id, bookId, userId }`; two paths: Redis pub/sub replay+live for background jobs, in-memory listener for inline; `Last-Event-ID` replay offset; `: keepalive` comment every 15s; worker-liveness watchdog fires SSE `error` after 10s if no worker consumes (route.ts:130-162). Event payloads are `AgentStreamMessage` JSON: `thinking | text | tool_use | tool_result | approval_request | error | complete | cost_update | status | budget_warning | delegation_start | delegation_progress | delegation_complete` (src/lib/agents/types.ts:125-142). Auth failure returns JSON 401; missing session returns an SSE error event (200), not 404.
- `POST /api/books/[id]/agent/[sessionId]/message` — continue conversational session; Clerk + session fence (+DB rehydration after server restart); zod `sendMessageSchema`; 400 if workflow not conversational; BYOK model re-resolution.
- `POST /api/books/[id]/agent/[sessionId]/approve` — resolve approval gate; Clerk + session fence; zod route-local (`approve|reject|modify`); background path: Redis key `approval:{id}` with 10-min TTL, 409 if already resolved; inline path: orchestrator + sub-orchestrators.
- `POST /api/books/[id]/agent/[sessionId]/cancel` — cancel session; Clerk + session fence; idempotent (`alreadyDone`); background: Redis halt flag + SSE terminal publish + best-effort BullMQ job removal; DB status → "failed".

## Batch (overnight runs)

- `POST /api/books/[id]/batch` — create/schedule batch of NON-prose-mutating workflows (BullMQ FlowProducer fan-out); Clerk + book-fence; zod route-local `createBatchSchema` (1-4 workflowIds, chapter range, scheduleMode now|tonight); **eligibility guard** rejects prose-mutating/conversational workflows → 400; **aggregate budget cap** default $10, hard max $25, finite-validated → 400; **plan gate** `checkQuota("use_agent_session")` → 429; BYOK batch model resolution → 4xx w/ `code` on failure; "tonight" = client-supplied future instant or next 02:00 UTC. 201 `{ batchId, childCount, scheduledFor }`.
- `GET /api/books/[id]/batch` — list last 20 BatchRuns; Clerk + book-fence + `userId` in where.
- `GET /api/books/[id]/batch/[batchId]` — poll batch + live child-status counts from AgentSession rows; Clerk + fence `{ id, bookId, userId }`.
- `POST /api/books/[id]/batch/[batchId]/cancel` — cancel batch; Clerk + fence; idempotent on terminal states; sets Redis `batch:{id}:halted` (24h TTL) so pre-child guard skips remaining children; digest still runs for partial morning report; best-effort parent-job removal only in delayed/waiting.

## Editorial (findings)

- `GET /api/books/[id]/editorial/findings` — list findings w/ filters + pagination; Clerk + book-fence; zod `findingsQuerySchema` on query params.
- `POST /api/books/[id]/editorial/findings` — batch-create findings; Clerk + book-fence; zod `batchCreateFindingsSchema`.
- `PATCH /api/books/[id]/editorial/findings/[findingId]` — apply/dismiss a finding; Clerk + book-fence + finding scoped by bookId; zod `updateFindingSchema`; auto-apply does exact→fuzzy text match in chapter, **409 if originalText no longer found**; dismiss triggers writer-memory preference inference + conversation-constraint persistence (server-derived bookId).
- `POST /api/books/[id]/editorial/findings/[findingId]/undo` — revert finding to pending, reversing applied text edit when still present; Clerk + book-fence; 400 if already pending.
- `GET /api/books/[id]/editorial/findings/[findingId]/discuss` — read discussion thread + `canDiscuss`; Clerk + book-fence (`loadOwnedFinding`).
- `POST /api/books/[id]/editorial/findings/[findingId]/discuss` — LLM discussion turn; Clerk + book-fence; zod route-local (message ≤2000); **rate limit 200 user turns/24h per user → 429** (route.ts:12,62-66); **3-turn cap per finding enforced with `SELECT ... FOR UPDATE` double-check → 409 capped** (route.ts:73-124); LLM call runs outside any lock.
- `GET /api/books/[id]/editorial/dismiss-pattern` — query dismissed patterns; Clerk + book-fence; zod query schema.
- `POST /api/books/[id]/editorial/dismiss-pattern` — upsert dismissed pattern; Clerk + book-fence; zod `createDismissedPatternSchema`.
- `GET /api/books/[id]/editorial/history` — EditAction log w/ pagination; Clerk + book-fence; zod query schema.
- `GET /api/books/[id]/editorial/summary` — aggregate finding stats (groupBy severity/status); Clerk + book-fence.

## Continuity

- `POST /api/books/[id]/continuity/scan?chapterNumber=N` — Neo4j consistency checks + flag sync; Clerk + book-fence; zod coerced query param; throttled (90s min interval) fire-and-forget LLM graph extraction using caller's BYOK keys; graph calls bounded to 5s — on graph failure returns `{ flags: [], degraded: true }` (200, never deletes flags).
- `POST /api/books/[id]/continuity/intentional` — mark flag intentional; Clerk; ownership-fenced `updateMany({ id: flagId, bookId })` → 404 on 0; zod route-local.

## Writing-assist AI (BYOK cheap-tier LLM calls)

- `POST /api/books/[id]/ghost-text` — ≤1-sentence continuation (max_tokens 60); Clerk + book-fence; **plan gate** `checkQuota` → 429; zod `ghostTextRequestSchema`; 400 if no BYOK key; records UsageRecord.
- `POST /api/books/[id]/inline-edit` — N rewrite suggestions (JSON-array parse, shape-filtered); Clerk + book-fence; **plan gate** `checkQuota` → 429; zod `inlineEditRequestSchema`; 400 no key; records UsageRecord.
- `POST /api/books/[id]/character-chat` — in-character chat via wiki entity; Clerk + book-fence; **no plan/quota gate**; ⚠ no zod — manual `characterName`/`message` presence check only, `history` cast unvalidated (route.ts:27-36); ⚠ 500 envelope leaks raw `error.message` (route.ts:158-164); records UsageRecord.
- `GET /api/books/[id]/daily-plan` — heuristic daily plan (no LLM); Clerk + book-fence; ⚠ `requireUser()` outside try/catch → unauthenticated becomes unhandled 500, not 401 (route.ts:15; same pattern in radar, wiki, marketing-kit, wiki/populate, writing-wrapped — middleware normally 401s first, so reachable mainly under E2E/dev bypass).
- `POST /api/books/[id]/feedback` — thumbs up/down on AI suggestions (upsert, toggling); Clerk + book-fence; zod route-local; negative feedback feeds writer-memory inference (failure never fails the POST); 500 envelope echoes `err.message`.
- `GET /api/books/[id]/radar` — word-count pacing/staleness alerts (no LLM); Clerk + book-fence.
- `GET /api/books/[id]/analysis` — latest ANALYSIS_REPORT read straight from S3; Clerk + book-fence; graceful `{ empty: true }` fallbacks; bare catch maps any error → 401 (route.ts:83-85).
- `GET /api/books/[id]/cost-estimate?workflowId=X` — pre-session cost + tier-block info via 4-level model resolution; Clerk + book-fence; manual query check → 400.
- `GET /api/books/[id]/marketing-kit` — read stored kit (parameterized `$queryRaw` on `books.marketing_kit`); Clerk + book-fence.
- `POST /api/books/[id]/marketing-kit` — generate kit with user's LLM; Clerk + book-fence; no zod (no meaningful body); BYOK required.

## Wiki

- `GET /api/books/[id]/wiki` — list entities w/ type/search filters; Clerk + book-fence; zod `wikiQuerySchema`; no try/catch (see daily-plan note).
- `POST /api/books/[id]/wiki` — create entity; Clerk + book-fence; zod `wikiEntitySchema`.
- `GET|PATCH|DELETE /api/books/[id]/wiki/[entityId]` — entity CRUD; Clerk; ownership via relation filter `{ id, bookId, book: { userId: user.id } }` (route.ts:13-15); PATCH zod `wikiEntityUpdateSchema`.
- `POST /api/books/[id]/wiki/populate` — LLM extraction of entities from bible/architecture/first-3-chapters (20k-char truncation per chapter); Clerk + book-fence; BYOK cheap-tier; no body.

## Style

- `GET /api/books/[id]/style` — list StyleProfiles (user+book scoped) + CharacterLenses; Clerk + book-fence; ⚠ bare `catch → 401` misreports any DB error as Unauthorized (route.ts:44-46, 84-86).
- `POST /api/books/[id]/style` — create StyleProfile; Clerk + book-fence; ⚠ no zod — manual `name` check only.
- `GET|POST /api/books/[id]/style/lenses` — list/create CharacterLens; Clerk + book-fence; ⚠ no zod (manual required-fields check); P2002 → 409; bare catch → 401.
- `PATCH|DELETE /api/books/[id]/style/lenses/[lensId]` — update/delete lens; Clerk + book-fence + lens-by-bookId (PATCH); ⚠ PATCH passes body fields through with zero validation (route.ts:28-39); DELETE checks book but ⚠ deletes by lensId without confirming the lens belongs to that book (route.ts:55-64) — however `characterLens.delete({ where: { id: lensId } })` after only book-fence means a caller who owns ANY book can delete another user's lens by guessing its cuid (cross-tenant delete, low probability but real).

## Search / Replace

- `GET /api/books/[id]/search?q=&caseSensitive=` — plain-text search across chapter content (2-200 chars); Clerk + book-fence; zod `searchQuerySchema` (safeParse → 400).
- `POST /api/books/[id]/search/replace` — replace-all across targeted chapters, minting versions (`find_replace`); Clerk + book-fence; zod `replaceRequestSchema`; chapterIds narrowed within book only.

## Import / Export

- `POST /api/books/[id]/import` — dual mode: JSON confirm (zod `importConfirmRequestSchema`) or legacy multipart (.md/.txt/.docx, 20MB cap); Clerk + book-fence; vector `indexBatch` after import.
- `POST /api/books/[id]/import/preview` — parse uploads without persisting; Clerk + book-fence; extension/size checks per file with per-file warnings; no zod (FormData).
- `POST /api/books/[id]/export` — run export pipeline (docx/pdf/epub/md); Clerk + book-fence; zod `exportRequestSchema`; note: `checkPlanAccess("export")` is ALWAYS allowed by design (plan-gating.ts:21-24 — "never hold writers' work hostage") and this route doesn't even call it; 500 envelope echoes pipeline `error.message`.
- `GET /api/books/[id]/export` — list prior exports from storage; Clerk + book-fence.
- `GET /api/books/[id]/export/[filename]` — download export; Clerk + book-fence; **path-traversal rejected** (`..`, `/`, `\` → 400, route.ts:22-24); storage key confined to `exports/`; Content-Disposition embeds filename in quotes (a literal `"` in the name could malform the header — CR/LF blocked by Node header validation) (?minor).
- `GET /api/books/[id]/export/config` — read export config doc or defaults; Clerk + book-fence.
- `PUT /api/books/[id]/export/config` — deep-merge partial config into stored doc; Clerk + book-fence; zod `exportConfigUpdateSchema`.

## Insights (agent blackboard)

- `GET /api/books/[id]/insights` — list w/ status/domain filters; Clerk + book-fence; query params unvalidated strings (passed to Prisma equality — safe).
- `POST /api/books/[id]/insights` — create manual insight; Clerk + book-fence; ⚠ no zod — manual required-field + enum check (route.ts:66-83); `expiresAt` from body via `new Date()` unvalidated.
- `PATCH /api/books/[id]/insights/[insightId]` — resolve/dismiss; Clerk + book-fence + insight-by-bookId; manual action check.
- `DELETE /api/books/[id]/insights/[insightId]` — hard delete; Clerk + book-fence + insight-by-bookId.

## Writing stats

- `GET /api/books/[id]/writing-stats` — daily counts, streaks, weekly avg, goals; Clerk + book-fence; zod `writingStatsQuerySchema`.
- `POST /api/books/[id]/writing-stats` — upsert writing goal; Clerk + book-fence; zod `writingGoalSchema`.
- `GET /api/writing-wrapped` — year-in-writing aggregate for caller; Clerk (userId-scoped queries); no try/catch (Unauthorized → 500).

## Series

- `GET /api/series` — list caller's series (+books, counts); Clerk; `where: { userId }`.
- `POST /api/series` — create series; Clerk; **plan gate** `checkPlanAccess("create_series")` → 403; zod `createSeriesSchema`.
- `GET|PATCH|DELETE /api/series/[id]` — series CRUD (DELETE detaches books to standalone first); Clerk + series-fence; PATCH zod `updateSeriesSchema`.
- `POST /api/series/[id]/books` — add existing (ownership-checked, 400 if already in a series) or create new book; Clerk + series-fence; zod `addBookToSeriesSchema`.
- `DELETE /api/series/[id]/books/[bookId]` — detach book; Clerk + series-fence + book fenced `{ id, seriesId, userId }`.
- `POST /api/series/[id]/books/[bookId]/reorder` — transactional bookNumber shuffle; Clerk + series-fence + book fence; zod `reorderBookSchema`.
- `GET|POST /api/series/[id]/documents` — list/create series docs via DocumentService(seriesId); Clerk + series-fence; POST zod `createDocumentSchema`.
- `GET|PATCH|DELETE /api/series/[id]/documents/[docId]` — series doc CRUD; Clerk + series-fence; PATCH zod `updateDocumentSchema`.
- `GET /api/series/[id]/inherit?bookId=` — check inheritance state; Clerk + series-fence + book fence; manual query check → 400.
- `POST /api/series/[id]/inherit` — apply series→book document inheritance; Clerk + series-fence + book fence; zod `applyInheritanceSchema`.
- `GET /api/series/[id]/synthesize?artifactType=` — list book contributions; Clerk + series-fence; manual query check.
- `POST /api/series/[id]/synthesize` — synthesize book artifact into series doc; Clerk + series-fence + book fence; zod `synthesizeSchema`.
- `GET /api/series/[id]/analytics` — per-book/cross-book stats; Clerk + series-fence; **plan gate** `checkPlanAccess("use_analytics")` → 403.
- `POST /api/series/[id]/agent` — series-aware agent session (inline orchestrator); Clerk + series-fence + book fence; zod `startSeriesAgentSchema`; BYOK model resolution; ⚠ no `checkQuota` gate here, unlike book agent route (src/app/api/series/[id]/agent/route.ts:30-100 — verified absent in full file; the book route gates at agent/route.ts:139-145).

### Books ↔ series context

- `GET /api/books/[id]/series-context?chapterNumber=N` — ambient series sidebar (on-stage names, prior characters, open threads, tone drift); Clerk + book-fence; zod coerced query; defense-in-depth: hides sidebar unless `book.series.userId === user.id` (route.ts:73), prior-book query re-scoped by userId (route.ts:88-90); per-source failure isolation + 5s Neo4j timeouts → degrades, never 500s on source failure.

## Memory (writer memory + vector memory)

- `GET /api/memory` — list active WriterMemory (global + optional bookId narrowing); Clerk; `where: { userId }`; ⚠ bookId param not ownership-checked but only narrows caller's own rows — safe.
- `POST /api/memory` — create memory; Clerk; zod route-local (category enum, ≤1000 chars); ⚠ `bookId` accepted without ownership check (route.ts:43-51) — caller can attach a memory to a foreign bookId; row is still userId-owned so no read leak (low).
- `PATCH /api/memory/[id]` — update content; Clerk; ownership-fenced `updateMany({ id, userId })`; ⚠ returns `success: true` even when 0 rows matched (no 404, route.ts:20-25); catch echoes `err.message` at 500 (an Unauthorized throw becomes 500 "Unauthorized", not 401).
- `DELETE /api/memory/[id]` — soft-deactivate; same fence + same 0-row and error-envelope caveats.
- `GET /api/memory/stats?bookId=` — vector memory stats; Clerk; ⚠ **missing ownership check on bookId**: `getBookChunkCounts(bookId)` runs before any book-fence, so any signed-in user can read another user's book chunkCount/lastIndexed by guessing the id (src/app/api/memory/stats/route.ts:13-28; embedding costs ARE scoped to `user.id`). Global path returns platform-wide totals (`getGlobalMemoryStats`) to any user — aggregate only (?acceptable).
- `POST /api/memory/clear` — wipe a book's vector memory; Clerk + book-fence (requires `confirm: true`); zod `memoryClearSchema`.
- `POST /api/memory/rebuild` — rebuild a book's vector index; Clerk + book-fence; zod `memoryRebuildSchema`.

## Settings / BYOK keys

- `GET /api/settings/api-keys` — list keys (decrypt→mask, per-provider usage aggregates); Clerk; `where: { userId }`; bare catch → 401.
- `POST /api/settings/api-keys` — upsert one key per provider; Clerk; zod `createApiKeySchema` (safeParse); **key validated against the provider before storage** — invalid keys never stored (route.ts:103-112); AES encryption via `encryptApiKey`; first key becomes default.
- `GET /api/settings/api-keys/[id]` — on-demand key health re-validation (updates/clears `validatedAt`); Clerk + `{ id, userId }` fence; invalid key = 200 `{ valid: false }`.
- `DELETE /api/settings/api-keys/[id]` — delete key; Clerk + fence; blocks last-key removal (400) and removal during running agent sessions (409); promotes a new default.
- `GET|PATCH /api/settings/default-model` — get/set global default model + 6 per-role overrides; Clerk; zod route-local; registry-ID existence validated per field → 400; bare catch → 401.
- `GET|PATCH /api/settings/language` — get/set preferred language; Clerk; zod `updateLanguageSchema` (safeParse).
- `GET /api/settings/onboarding` — onboarding status + validated key count; Clerk.
- `POST /api/settings/onboarding` — mark onboarding complete; Clerk; requires ≥1 validated key (400); sets `wmb_onboarded` cookie (HttpOnly, SameSite=Lax, 1y) consumed by Edge middleware gate.

## Usage / budget

- `GET /api/usage` — 30-day usage rollups by agent/model/book; Clerk; `where: { userId }`; fire-and-forget `validatePrices()`.
- `GET /api/usage/books/[bookId]` — per-book 30-day usage incl. LLM/embedding split; Clerk + book-fence; bare catch → 401.

## Billing / Stripe

- `POST /api/billing/checkout` — create Stripe Checkout session; Clerk; zod `checkoutSchema` (safeParse); 503 if Stripe unconfigured; founder plan: monthly-only rule + **atomic 200-slot check in a transaction** (route.ts:60-83); trial config for plans with `trialDays`; customer created/linked on the fly; metadata carries `{ userId, plan, billingInterval }`.
- `POST /api/billing/portal` — Stripe billing-portal session; Clerk; 404 if no `stripeCustomerId`.
- `GET /api/billing/subscription` — plan snapshot; Clerk; **poll-fallback**: if local row >5 min stale, re-syncs from Stripe (status/plan/periods/cancelAtPeriodEnd), swallowing Stripe errors; bare catch → 401.
- `GET /api/billing/founder-count` — founder-slot counter for pricing page; **no route-level auth by design** (comment "No authentication required", route.ts:4-7) — ⚠ **but middleware does NOT list it in `isPublicRoute`** (src/middleware.ts:5-14), so anonymous pricing-page visitors are blocked by `auth.protect()`; comment and middleware disagree (functional bug, not a leak).
- `POST /api/billing/webhook` — **Stripe webhook, public route** (middleware.ts:12); auth = `stripe.webhooks.constructEvent` signature verification (400 on bad/missing sig, 503 if Stripe off); **idempotency** via `StripeWebhookEvent` unique-constraint insert (P2002 → dedup, route.ts:11-22); handles 7 events: `checkout.session.completed` (founder-slot claim + subscription upsert w/ trial detection), `customer.subscription.created` / `.updated` (price→plan mapping, period stamps), `.deleted` (status→canceled, plan kept), `.trial_will_end` (log only), `invoice.paid` (re-activate), `invoice.payment_failed` (→past_due). Status mapping collapses incomplete/unpaid → canceled.

## Auth webhook (Clerk)

- `POST /api/auth/webhook` — **public route** (middleware.ts:11); auth = svix signature verification over raw body (401 on missing headers/bad sig; 500 if `CLERK_WEBHOOK_SECRET` unset); handles `user.created` (upsert), `user.updated` (updateMany), `user.deleted` (**deleteMany — destructive cascade of the user row**). Payload fields cast, not schema-validated (signature is the trust boundary).

## Health

- `GET /api/health` — env-var health (`envHealth("web")`); **public** (middleware.ts:13); 200/503; no auth, no DB.
- `GET /api/health/dependencies` — dependency readiness (`checkDependencies()`); **public**; 200/503; `force-dynamic`, nodejs runtime.

---

## Cross-cutting

**Middleware (src/middleware.ts)** — `clerkMiddleware` protects everything except: `/`, `/login*`, `/signup*`, `/privacy`, `/terms`, `/api/auth/webhook`, `/api/billing/webhook`, `/api/health*`. Additional onboarding gate: authed users without `wmb_onboarded=1` cookie are redirected to `/onboarding` (API exemptions: `/api/settings/onboarding`, `/api/settings/api-keys*`). Three bypasses, all non-production-gated: `x-e2e-test-secret` header (middleware.ts:28-32 + auth.ts:54-61 mapping to seeded e2e user), `DEV_AUTH_BYPASS=true` (skips middleware entirely + auto-creates dev user), and a misconfigured-Clerk fallback returning 401 (dev) / 503 (prod). Matcher covers all non-static paths + `/(api|trpc)(.*)`.

**Auth pattern** — no per-route Clerk API; every protected route calls `requireUser()` (throws `Error("Unauthorized")`) or relies on it, then re-derives the DB user. `getDbUser` auto-provisions a User row from the Clerk session on first request. There is **no roles/admin concept anywhere** — no `/api/admin` routes exist, no role checks; the only "gating" is plan tier.

**Ownership pattern** — uniform inline fencing, no shared helper: `db.book.findFirst({ where: { id, userId: user.id } })` (or `db.series...`) before any nested access; child resources further scoped by `bookId`/`seriesId`; a few routes use relation filters (`book: { userId: user.id }`, wiki entity) or ownership-fenced `updateMany` (archive, memory, continuity/intentional). Verified gaps: **memory/stats bookId** (read-only metadata IDOR) and **style lens DELETE** (delete-by-id after only book-fence) — flagged above.

**Tier/entitlement gating** — `checkPlanAccess(userId, action)` (src/lib/billing/plan-gating.ts): actions `create_book | create_series | run_agent | use_analytics | export`; `export` always allowed; **Stripe-unconfigured = everything allowed** (self-host mode, plan-gating.ts:29-31); inactive/canceled/expired-trial → deny with `upgradeToTier`; `past_due` still allowed. `checkQuota` is a thin alias (`use_agent_session`→`run_agent`); despite the name there is **no volume quota — it is a subscription-status check only**; `getSessionCostLimit` is deprecated (returns Infinity; real spend control is the per-session/batch budget caps computed in the agent/batch routes). Gated: create book/series (403), agent session, ghost-text, inline-edit, batch (429), series analytics (403). NOT gated: character-chat, marketing-kit, wiki populate, series agent (⚠ flagged), continuity scan — all of which spend the user's own BYOK key, so exposure is user-cost, not platform-cost.

**Validation** — zod throughout: 60 shared schemas in src/lib/validation.ts plus route-local `z.object`s; two styles: `.parse` + catch `ZodError` → 400 `{ error: "Invalid input", details }` (details is the raw error object) vs `.safeParse` → 400 flattened. Exceptions with manual/no validation: character-chat, insights POST, style POST/lenses POST/lens PATCH (flagged above); multipart routes (import, import/preview) validate extension+size manually.

**Error envelope** — `{ error: string }` with conventional statuses (400/401/403/404/409/422/429/500/503); no success wrapper (payloads returned bare). 409 has three distinct meanings: duplicate name, document `version_conflict` (with `serverContent`), discuss-cap/approval-already-resolved. Inconsistencies: ~12 routes use bare `catch → 401` mapping any failure to Unauthorized (settings/*, style/*, analysis, usage/books, billing/subscription); ~7 routes call `requireUser()` without a catch so Unauthorized surfaces as 500 (daily-plan, radar, wiki GET/POST, wiki populate, marketing-kit, writing-wrapped); 3 routes echo raw `error.message` in the 500 body (character-chat, feedback, memory/*, export POST).

**Rate limiting** — none globally (no middleware limiter, no IP limiting). Only instance: finding-discuss (200 user turns/24h per user → 429 + 3-turn cap per finding → 409). Cost-abuse control is instead: plan gate + finite per-session budget (2× estimate, min $5), batch aggregate cap ($10 default/$25 max), and BYOK (user pays their own provider).

**SSE/streaming** — exactly one streaming endpoint: `GET .../agent/[sessionId]/stream` (see CAS section). All other AI endpoints are request/response JSON (character-chat, ghost-text, inline-edit, discuss do a full LLM round-trip server-side).

**Webhooks** — Stripe (sig + DB-unique idempotency, 7 events) and Clerk (svix sig, 3 events incl. destructive user.deleted). Both public in middleware; signature is the sole trust boundary — appropriate.

**CORS / CSRF** — no CORS headers anywhere in src (verified: zero `Access-Control-Allow`/cors matches), so cross-origin reads are browser-blocked by default. No CSRF tokens; mitigation is Clerk's SameSite cookie plus the fact that JSON bodies force preflight; the multipart import endpoints are the only "simple-content-type" POSTs, and SameSite=Lax keeps cookies off cross-site POSTs — posture acceptable, undocumented.

**⚠ Security findings summary (all verified with file:line above)**
1. `GET /api/memory/stats?bookId=` — bookId not ownership-checked before `getBookChunkCounts` (src/app/api/memory/stats/route.ts:13-28). Read-only metadata IDOR.
2. `DELETE /api/books/[id]/style/lenses/[lensId]` — deletes by lensId without verifying lens.bookId matches the fenced book (src/app/api/books/[id]/style/lenses/[lensId]/route.ts:55-64). Cross-tenant delete if a cuid is known.
3. `GET /api/billing/founder-count` — declared public in code comment but absent from middleware `isPublicRoute` (src/middleware.ts:5-14 vs route.ts:4-7); anonymous pricing page cannot read it.
4. `POST /api/series/[id]/agent` — no `checkQuota`/plan gate, unlike the book agent route (src/app/api/series/[id]/agent/route.ts vs src/app/api/books/[id]/agent/route.ts:139-145). Inactive-subscription users can still start series agent sessions (BYOK spend only).
5. `POST /api/memory` — accepts arbitrary `bookId` without ownership check (src/app/api/memory/route.ts:43-51). Low impact (row stays userId-scoped).
6. Error hygiene: raw `error.message` echoed at 500 in character-chat (route.ts:161-163), feedback (route.ts:80-83), memory routes, export POST (route.ts:66); bare `catch → 401` masks server faults in ~12 settings/style/usage routes.
7. No admin surface exists — nothing to gate; flagged as an observation, not a bug.
