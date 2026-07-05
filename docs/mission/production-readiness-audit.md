# Write My Book — Production Readiness Audit

_Synthesized from six adversarially-verified dimension audits. Every blocker/high candidate was re-checked against the actual code; REFUTED and OVERSTATED severities were downgraded before inclusion. Date: 2026-07-04._

---

## 1. Verdict + Score

**Overall readiness: 66 / 100 — CONDITIONAL GO for paid public launch.**

The prior standing verdict was **~65/100** ("bones of a 9/10 delivering 6.5/10, mostly because already-built subsystems aren't wired together"). Wave-1 and the shipped tiers moved the needle, but only marginally on the composite — and for a specific, honest reason: the biggest wins landed on the **agent-AI-trust** dimension (74), where the "built but not wired" thesis is now **largely resolved** — craft skills, vector retrieval, writer-memory, the thumbs-down→learned-preference loop, and real streak/word-count stats all have verified load-bearing call sites (Tier 1.1–1.5, 1.7). The **code-security** posture is genuinely strong (82): both webhooks verify signatures, BYOK keys are AES-256-GCM encrypted and validated-before-store, ownership fencing is consistent, `DEV_AUTH_BYPASS` is triple-fenced, and the feared "$10 hard-kill loses everything" scenario is refuted — the orchestrator degrades gracefully.

What holds the score down is not a broken core, but **thin edges and unverified ops**: the **test-CI-observability** dimension (48) is the weakest link — 254 real unit tests and 19 e2e specs exist but **CI never runs any of them**, the 322-line Stripe webhook has zero tests, and server/worker Sentry is almost certainly dead (no `instrumentation.ts`). **Friction reconciliation** (56) confirms wave-1 was honest — all 9 claimed fixes plus B1 are genuinely present — but 12 items remain open and the F6 locale sweep was under-delivered.

Dimension scores: friction-reconciliation **56**, code-security **82**, infra-deploy **68**, write-a-book-path **68**, agent-ai-trust **74**, test-ci-observability **48** → composite **≈66**.

**Why CONDITIONAL and not GO:** zero verified code launch-blockers survived adversarial review, and the manual blank-page→export path works today independent of the worker. But paid launch is gated on **four ops conditions** (below) and **one high-severity AI defect** that breaks the exact BYOK config the mission validates (OpenRouter-only "Discuss finding"). Clear those and this is a GO.

**Why not NO-GO:** no finding breaks the core write/save/export flow, loses words irrecoverably, leaks data, or mischarges a paying user on day 1. The safety net (autosave CAS, version snapshots, worker-independent manual authoring) holds.

---

## 2. P0 Launch Blockers (ranked)

**Verified true code launch-blockers: ZERO.** Every blocker/high candidate was adversarially re-verified and downgraded — the reasoning is preserved per-item in §3 and the friction table. This is an honest "none," not an empty scan: the strict bar (breaks core flow / loses words / leaks data / mischarges, on day 1) was applied and nothing cleared it.

However, paid launch **is conditional** on the following gates. These are not code defects that ship broken — they are release actions and one high-severity AI-quality fix that must be cleared _before_ admitting paying traffic. Treat them as **CONDITIONAL-GO gates (C0–C3)**:

| # | Gate | Type | Why it must clear before paid launch | Single fix that clears it |
|---|------|------|--------------------------------------|---------------------------|
| **C0** | Prod schema push (4 changes) not yet applied | OPS | Code expects `Book.archivedAt`, `ContinuityFlag`, `FindingReply.role`, `WriterMemory.findingId`. Deploy without the push → P2022/P2021 500s on archive, shelves ripple, continuity, finding-reply for every user. Health checks stay green (they run `SELECT 1`). | Run `npm run db:push:prod` in a maintenance window with fresh backup (per `docs/database-deploy-backup.md`), then re-smoke. |
| **C1** | "Discuss finding" hardcodes `anthropic/haiku` | CODE (high) | OpenRouter-only BYOK users (the mission's qwen3.6 config) get a 400/500 **every time** they click Discuss on an editorial finding — the Tier 4.2 flagship trust feature is dead for that entire segment. `discuss-llm.ts:5` bypasses the `resolveCheapModelFor` pattern the 4 sibling routes use correctly. | Replace hardcoded `HAIKU` const with `resolveCheapModelFor(user.defaultModel)`; add a unit test asserting an openrouter-default user resolves to `openrouter/haiku`. |
| **C2** | Backup/restore drill never performed | OPS | The pg_dump→MinIO sidecar is _defined_ but has never been proven to produce objects or restore. An unverified backup = potential total data loss with no tested recovery — the "lose their words" failure at scale. | Stand up prod stack, confirm `db-backup` uploads, perform + record one full restore into a disposable DB. |
| **C3** | Live Stripe + Clerk round-trips unverified | OPS | CI validates key _formats_ only. A well-formed-but-wrong webhook secret or mis-scoped Clerk instance passes CI and surfaces only as a paying-user payment/auth failure. | Execute the documented live checklists (`docs/stripe-billing-verification.md`, `docs/clerk-auth-verification.md`) against prod instances; record results as a launch gate. |

---

## 3. Code & Security Findings (verified)

No launch-blockers. The following are confirmed code/security defects worth fixing, grouped by theme. All severities are post-adversarial-verification.

### Data consistency — last-write-wins on non-chapter docs (medium ×1, verified)
- **`src/app/api/books/[id]/documents/[docId]/route.ts:97`** — `svc.update()` is called with no `expectedVersion`/CAS, unlike the chapter route (`chapters/[chapterId]/content/route.ts:111-136`). `updateDocumentSchema` (`validation.ts:187-192`) carries no version field; `use-documents.ts:89-93` sends only `{content, changeSource}`. A human editing a story bible while a background `WriteDocument` agent writes the same doc silently overwrites the loser.
  - **Why not high/blocker:** every save still writes an immutable `DocumentVersion` snapshot to S3+DB _before_ the live pointer moves (`version-manager.ts:56-69`, `document-service.ts:145`), so **both writes survive** and the loser is fully recoverable via the existing version-history/restore UI. Narrow window (same user, two tabs, or own agent), non-chapter auxiliary docs only; the core chapter prose IS CAS-protected.
  - **Fix:** thread `docData.currentVersion` into the PATCH + return 409 with `serverContent` exactly like the chapter route; wire the existing `save-conflict-dialog.tsx`.
  - _(This is the same defect surfaced as friction S5 and as the code-security dimension's one flagged item — three lenses, one root cause.)_

### Budget/persistence edge — WriteChapter dropped on the armed wrap-up turn (medium, verified)
- **`src/lib/agents/orchestrator.ts:635`** — `WRAP_UP_TOOLS = new Set(["CreateFinding","WriteDocument"])` omits `WriteChapter` (`tools.ts:283`), the ghostwriter's chapter-persist tool. A `WriteChapter` landing on the dedicated second (armed) wrap-up turn returns "Session ended — tool skipped during wrap-up." and is discarded.
  - **Why not high/blocker:** the gate fires only when `finalTurnRequested` is already true; the **crossing turn's tools still execute once** (`:682-683`), so the common single-call chapter flush is saved. The `FINAL_TURN_NUDGE_TEXT` instructs the model to persist via `WriteDocument` (allowlisted, accepts `CHAPTER_CONTENT`). The skip is visible via SSE, not silent. Ghostwriter delegations get their own $5/20-min cap, making mid-write exhaustion of a lone chapter unlikely.
  - **Fix:** add `"WriteChapter"` to `WRAP_UP_TOOLS` (it's a pure DB write with the same safety profile as `WriteDocument`, unlike the correctly-excluded `DelegateToSpecialist`/`RequestApproval`); add a unit test.

### Revenue gating — analytics read not plan-gated (medium, unverified/reported)
- **`src/app/api/series/[id]/analytics/route.ts:14-19`** — only an ownership check; `checkPlanAccess` defines `use_analytics` as Professional+ (`plan-gating.ts:79-89`) but the route never calls it. A downgraded subscriber keeps reading Pro-tier analytics. Revenue leak, not a data/auth breach.
  - **Fix:** add `const access = await checkPlanAccess(user.id, "use_analytics"); if (!access.allowed) return 403` at the top of the GET, mirroring the series-create route.

### AI honesty — AuthorshipTracker fabricates "100% yours" (medium, reported)
- **`src/components/editor/editor-status-bar.tsx:165-166`** — passes `aiWords: 0, aiEditedWords: 0` unconditionally, so `humanPct` always computes to 100%. The component's own doc-comment promises `data-author` paragraph tracking that **no code writes** (grep for `data-author` yields zero producers). Ghostwriter prose counts as human — an AI-disclosure/provenance concern (some publishers/contests require disclosure).
  - **Fix:** compute real authorship from tracked insertions, or hide the tracker until real tracking ships — do not display a fabricated 100%.

### Lower-severity / defense-in-depth (verified, non-blocking)
| File:line | Severity | Issue | Fix |
|-----------|----------|-------|-----|
| `books/[bookId]/documents/[documentId]/page.tsx:323-330` | low | Doc autosave has no `beforeunload`/`pagehide` flush (2s debounce window loss) | Add `pagehide`/`visibilitychange` listener that flushes `saveContent()` (or `sendBeacon`) |
| `agent/[sessionId]/approve/route.ts:44-72` | low | Approval resolution keys global `approval:{id}` not bound to session; UUID-guessing only, so DiD | Store owning `sessionId` alongside the pending approval; verify match before resolving |
| `story-radar` `radar/route.ts:36-40` vs `48-86` | low | Advertises 5 alert types, emits only word-count pacing + staleness (self-labeled "Placeholder") | Wire Neo4j `ContinuityFlag`/findings into radar, or re-scope UI copy to the 2 heuristics |
| `immersive-focus-mode.tsx:253-267` | info | `dangerouslySetInnerHTML` into `contentEditable`, no sanitization | Self-injection only under single-author model; sanitize (DOMPurify) ahead of import/collab |

### Verified RESOLVED (recorded as positive evidence)
- **Tier 1 wiring (1.1–1.5, 1.7)** — craft skills (`prompt-assembler.ts:1675-1688`), vector memory (`:1867-1878`, 3s timeout guard), writer-memory (`:1558` + discuss route), feedback loop (`feedback/route.ts:59-70` → `writer-memory.ts:184-217`), real streaks (`writing-stats.ts:154-238`). All have load-bearing call sites. **Keep the fail-open try/catch + 3s memory timeout during future refactors.**
- **Autosave resilience** — 2s debounce, offline ref, exponential backoff, conflict guard, `beforeunload` guard, draft recovery, and CAS 409 on the chapter route (`manuscript-editor.tsx:150-197,385-510`). The "lose their words" risk is well-defended on the core surface. **Keep the CAS invariant in the Vitest money-path harness.**

---

## 4. Friction Backlog Status

All 9 wave-1 claimed fixes plus B1 **genuinely verified present in merged code** — the batch was honest, not paper. 12 items remain open.

| Item | Status | Evidence |
|------|--------|----------|
| **B1** | ✅ FIXED | `client-factory.ts:26` `OPENROUTER_BASE_URL` no double `/v1`; anthropic models route direct, no LiteLLM detour (commit 76d4a66) |
| **F1** | ✅ FIXED | `dashboard/page.tsx:102,118,208` + `writing-heatmap.tsx:185,187` use `localeFor(preferredLanguage)` |
| **F2** | ✅ FIXED | `dashboard/page.tsx:385` view-all now `t.dashboard.viewAll`; `totalBooks` stat separated |
| **F3** | ✅ FIXED | `dashboard/page.tsx:253-256` Resume deep-links to last-edited chapter route |
| **F4** | ⚠ OPEN | `clerk-theme-provider.tsx:17` mounts `<ClerkProvider>` unconditionally — dev-mode Clerk noise. Minor |
| **F5** | ⚠ OPEN | Chapter API `{markdown}` vs document API `{content}` naming still inconsistent. Low |
| **F6** | 🟡 PARTIAL | Wave-1 fixed dashboard/heatmap only. `shelf-book-card.tsx:17` bare `toLocaleString()` reproduces "2.026 words"; `books/[bookId]/page.tsx:321,327,358` + ~40 more bare call sites. **Sweep under-delivered.** Medium |
| **F7** | ⚠ OPEN | `tool_use` SSE name present, but completion `documentIds` set to `[]` on error branch (`agent/route.ts:585`); naming under-populated. Minor |
| **S1** | ✅ FIXED | `model-resolver.ts:229` 4-level chain; `agent/route.ts:202-212,254-297` applies resolved model (no forced `${provider}/sonnet`) |
| **S2** | ✅ FIXED | `session-manager.ts:158,180` persist `ConversationTurn` rows; called from 4 routes + worker; rehydration collapses same-role turns |
| **S3** | ✅ FIXED | `chapters/reorder/route.ts` transactional renumber; corkboard + canvas use it — no more 404/P2002 races |
| **S4** | ✅ FIXED | search + replace routes, `find-replace-dialog.tsx`, toolbar entry (Ctrl+Shift+F) mounted |
| **S5** | 🟡 OPEN (medium) | `documents/[docId]/route.ts:97` no CAS — agent `WriteDocument` clobbers manual story-bible edits. **Recoverable via versions** (downgraded from HIGH). See §3 |
| **S6** | ✅ FIXED | `orchestrator.ts:373-375` `clampMaxTokens`; qwen `maxOutputTokens:32768` — no 400 |
| **S7** | 🟡 OPEN (medium) | `orchestrator.ts:635` `WRAP_UP_TOOLS` excludes `WriteChapter`. **Narrow window, crossing turn saved** (downgraded from HIGH). See §3 |
| **S8** | ⚠ OPEN (medium) | No worker-liveness diagnosis in agent route/queue lib; enqueued jobs hang if no consumer. Ops+UX |
| **S9** | ⚠ OPEN | `discuss-llm.ts:5` `anthropic/haiku` hardcode + `entity-extractor.ts:38` forced haiku bypass model resolution. **See C1 (high for OpenRouter-only)** |
| **S10** | ⚠ OPEN (medium) | `immersive-focus-mode.tsx:253` distinct raw-innerHTML content path outside hardened CAS editor; loss window remains |
| **S11** | ⚠ OPEN | `editor-status-bar.tsx:166` hardcoded "100% yours". See §3 AuthorshipTracker |
| **S12** | ⚠ OPEN | `version-branching`, `story-health-dashboard`, `entity-mention-popup`, `word-sprint`, `finding-review-mode` — 0 importers, still dead/unmounted |
| **S13** | ✅ FIXED | `validation.ts:76` + `chapters/[chapterId]/route.ts:69-70` persist `targetWordCount`; popover UI wired |
| **S14** | ⚠ OPEN | Only corkboard for chapter overview; no dedicated outline/synopsis view beside editor |

**Wave-1 verdict:** all claimed fixes (S1,S2,S3,S4,S6,S13,F1,F2,F3) + B1 confirmed genuine. The one under-delivery is **F6** — the locale ripple the log explicitly demanded stopped at dashboard/heatmap and never reached the flagship Shelf cards.

---

## 5. Infra / Deploy Gates

| Gate | Status | Notes |
|------|--------|-------|
| CI env / auth / billing / db-preflight / compose-topology contracts | ✅ AUTOMATED | `ci.yml` runs on every push; runtime env validation fails closed in prod |
| Prod DB push (4 schema changes) | ❌ **TODO (C0)** | Dev DB synced+verified; **prod push never run.** No automated drift detector — `check-db-deploy.ts` validates the schema _file_ + `DATABASE_URL` contract, never diffs live prod |
| Schema-drift readiness probe | ❌ TODO (low) | `/api/health` = env-only; `/api/health/dependencies` = `SELECT 1` — passes against a stale schema. Add an `information_schema` column check to readiness |
| Sentry server/edge error capture | ❌ TODO (medium) | **No `instrumentation.ts` exists** → `sentry.server.config.ts`/`sentry.edge.config.ts` `Sentry.init` never runs. Server/API 500s not captured. Client errors still ship via `withSentryConfig` |
| BullMQ worker Sentry | ❌ TODO (medium) | `worker.ts:37-50` handlers only `console.error`. Separate Node process, uncovered even by a correct Next instrumentation. Add `@sentry/node` init + `captureException` in `on('failed'/'error')` |
| Worker liveness in health check | ❌ TODO (low) | `checkDependencies()` never queries `agentQueue.getWorkers()`. Green `/health` while every background AI workflow hangs |
| Post-deploy smoke in pipeline | ⚠ PARTIAL | `smoke:deployment` + `test:deployment-smoke` exist and work, but run **manually only** — no CD job invokes them |
| Backup sidecar + restore drill | ⚠ **PARTIAL (C2)** | Sidecar defined (`docker-compose.prod.yml:17-53`), rotate script present, `DB_BACKUP_CONFIRMED_AT` guard enforced. **No restore drill ever performed** — launch gate open |
| Stripe live round-trip | ⚠ **PARTIAL (C3)** | Key-format/price-id/live-test contracts CI-enforced; real checkout + webhook signature + subscription lifecycle **manual TODO** |
| Clerk live round-trip | ⚠ **PARTIAL (C3)** | Key-format + `DEV_AUTH_BYPASS`-off contracts CI-enforced; real signup/login/webhook-sync/protected-route **manual TODO** |
| Prod DB push guardrails (backup + approval env gates) | ✅ AUTOMATED | `check-db-deploy.ts` requires fresh `DB_BACKUP_CONFIRMED_AT` (<2h) + `DB_DEPLOY_APPROVED` before push |
| DEV_AUTH_BYPASS prod rejection | ✅ AUTOMATED | Triple-fenced + rejected by prod env validation + CI Clerk check |
| pandoc/typst in prod image | ⚠ TODO (medium) | Export silently downgrades to `.md` if binaries absent (`export-pipeline.ts:332-352`). See §6 |

---

## 6. Write-a-Book Path: Works Today?

**Manual blank-page → exported manuscript: ✅ WORKS TODAY, end-to-end, worker-independent.**

Verified walkthrough:
1. **Signup → onboarding → new book "write" mode** — `books/route.ts:106-111` auto-creates Chapter 1 and returns `firstChapterId`; `books/new/page.tsx` routes straight to the chapter editor.
2. **Blank Chapter 1 editor → debounced autosave** — persists `CHAPTER_CONTENT` to `manuscript/act-XX/chapter-XX.md` (`storage-keys.ts:32-33`), the exact keys the export pipeline scans.
3. **Export** — `export-pipeline.ts:138-151` reads `manuscript/**/*.md`; requires no setup docs, no agent, no worker, no Redis/LLM.

A purely manual writer can produce and export a manuscript **even when every AI subsystem is degraded.** This is the product's safety net and it holds. The setup guard (`agent/route.ts:111-136`, SETUP-07) correctly blocks drafting before voice/structure exist and returns a machine-readable `redirectTo:/books/:id/setup`; all setup workflows are conversational, so a new user completes setup even if the worker is down.

**Dead-ends / gaps on the AI-assisted path:**

| Gap | Evidence | Impact | Severity |
|-----|----------|--------|----------|
| **Worker-down = infinite silent spinner** | `agent/route.ts:385-424` enqueues write-chapter to BullMQ; `stream/route.ts:60-190` subscribes to Redis and never inspects job state; `use-agent-stream.ts:161-182` `onerror` only on socket close | If the worker isn't running, "Write Chapter" spins forever with no error, no timeout, green health check | medium (verified) — **only under a worker outage**; transient crashes self-heal via `attempts:3` + stalled-recovery + Redis replay. An OPS gate (supervise the worker), not a correctly-deployed-user defect |
| **DOCX/PDF/EPUB → raw `.md`** | `export-pipeline.ts:69-78,234,284-288,332-352` | A user exporting to DOCX to send an editor silently gets `.md` if pandoc/typst aren't in the prod image | medium — bake binaries into the image + assert at startup, OR honestly disable formats the host can't produce |
| **"Discuss finding" dead for OpenRouter-only** | `discuss-llm.ts:5` | 400/500 every time for the mission's own BYOK config | **high — C1** |

**Net:** the core promise (blank page → exported book today) is met for the manual writer. The AI-assisted loop is real and mostly wired, but has one high-severity model-routing break (C1), one ops-dependent silent-spinner, and one export-format substitution that must be closed for the AI value prop to feel whole.

---

## 7. Recommended Next Actions

Sequenced punch-list — an operator can execute top-to-bottom.

### Band A — Conditional-GO gates (clear ALL before admitting paying traffic)
1. **C0 — Push prod schema.** `npm run db:push:prod` in a maintenance window with fresh backup (`docs/database-deploy-backup.md`), then re-run smoke. _(ops; blocks archive/shelves/continuity/findings)_
2. **C1 — Fix `discuss-llm.ts` haiku hardcode.** Replace `HAIKU` const with `resolveCheapModelFor(user.defaultModel)` (mirror `inline-edit/route.ts:46`); add the openrouter-default→`openrouter/haiku` unit test. Also fix the sibling `entity-extractor.ts:38` while in the file. _(code, high; ~1 file)_
3. **C2 — Perform + record one backup restore drill** into a disposable DB; confirm the sidecar uploads objects. _(ops)_
4. **C3 — Run the live Stripe + Clerk verification checklists** against prod instances; record as an explicit launch gate. _(ops)_

### Band B — High-trust-ROI hardening (do immediately after launch, ideally within the launch window)
5. **Wire server + worker error monitoring.** Add `src/instrumentation.ts` (`register()` importing the server/edge configs + re-export `onRequestError`); init `@sentry/node` at the top of `src/worker.ts` with `captureException` in `on('failed'/'error')` + `unhandledRejection`/`uncaughtException`. Promote `NEXT_PUBLIC_SENTRY_DSN` from optional-warning to a hard gate. _(You are otherwise blind to prod 500s, including any C0 residue.)_
6. **Run the test suite in CI.** Add `npm run test:unit` as a merge gate to `ci.yml`; add a handler-level test per event type for the untested 322-line Stripe webhook (`billing/webhook/route.ts`) — the single highest-value coverage add. 254 tests currently protect nothing at the gate.
7. **Close the worker silent-spinner.** Poll BullMQ job state in the background SSE path and emit an error when a job stays `waiting` with no consumer; add a client-side max-queue-wait timeout; add `agentQueue.getWorkers()` to `/api/health/dependencies` so monitoring goes red on worker-down. Document the two-process (web + `worker:start`) deploy as a hard requirement in `deployment-topology.md`. _(closes S8 + write-path gap + worker-health gap together)_
8. **Bake pandoc + typst into the prod image** and assert presence at startup, OR honestly disable DOCX/PDF/EPUB when unavailable. Confirm the prod path in `production-readiness.md`.

### Band C — Data-consistency & revenue correctness (next sprint)
9. **Extend CAS to non-chapter docs (S5 / doc-editor).** Thread `expectedVersion` through the document PATCH + `use-documents` save mutation; return 409 with `serverContent`; wire the existing `save-conflict-dialog.tsx`. _(Verified: **this is `wave1_review_followup`-grade — file-localized: `documents/[docId]/route.ts:97`, `validation.ts:187-192`, `use-documents.ts:89-93`.**)_
10. **Add `WriteChapter` to `WRAP_UP_TOOLS`** (`orchestrator.ts:635`) + a unit test asserting a wrap-up-turn `WriteChapter` executes. _(closes S7)_
11. **Plan-gate the analytics read.** Add `checkPlanAccess(user.id, "use_analytics")` to `series/[id]/analytics/route.ts`. _(revenue leak)_
12. **Test the orchestrator budget hard-kill loop** at the integration level (fake model client, scripted tool_use turns, injected per-turn costs) — assert stop-within-one-wrap-up-turn and allowlist enforcement.

### Band D — Observability & polish (post-launch backlog; ties to roadmap Tier 4.x)
13. **Add a schema-contract probe to `/api/health/dependencies`** (query `information_schema` for the release's required columns) so readiness returns 503 on drift — permanently closes the C0-class blind spot.
14. **Wire `test:deployment-smoke` into CD** against the freshly-deployed URL as a cutover gate/rollback trigger.
15. **Finish the F6 locale sweep** — thread `localeFor(preferredLanguage)` into `shelf-book-card.tsx:17`, `books/[bookId]/page.tsx:321,327,358`, and the ~40 remaining bare formatters; add a lint rule banning bare `toLocaleString`.
16. **AuthorshipTracker (S11):** compute real authorship from tracked insertions (mark ghostwriter/inline-edit/ghost-text with `data-author`) or hide it — stop showing a fabricated "100% yours."
17. **Broaden coverage scope** (`vitest.config.ts:16-23`) beyond 6 files to `src/lib/**` + `src/app/api/**` so the number reflects real gaps; set a CI threshold once tests run.
18. **Story Radar (Tier 4.4 tie-in):** wire the Neo4j `ContinuityFlag` data into radar's continuity/character/style alert types, or re-scope the UI copy to the two heuristics actually implemented.
19. **Dead-code cleanup (S12):** remove or mount the 5 zero-importer components; **F4/F5/S10/S14** as low-priority polish.

_Roadmap tie-in: Band A/B clear the "already-built subsystems aren't wired / unverified ops" gap that pinned the prior 65/100. Band C/D are the depth work (Tier 4.6 power-user, Tier 3 moats) that lifts the composite past 75._
