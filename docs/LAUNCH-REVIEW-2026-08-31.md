# Launch Review — 2026-08-31

Full independent pass: architecture mental model + static checks + unit + e2e + launch-readiness list.
Companion to `cowork/bulletproof-qa-2026-07-17/` (prior campaign) and `docs/production-readiness.md` (ops checklist).

## 1. Mental model

**Write My Book (wmb-pub)** — Next.js 16 App Router, React 19, Tailwind 4 (oklch tokens),
Prisma 7 + Postgres, Clerk auth, Stripe billing, BullMQ worker, Qdrant vectors, Neo4j graph,
S3/MinIO object storage. Self-hostable (docker-compose), BYOK-only LLM spend.

### Request/response surface
- `(public)` — `/`, `/privacy`, `/terms` marketing shell.
- `(auth)` — `/login`, `/signup` (Clerk wrappers).
- `(onboarding)` — `/onboarding` wizard (API keys + first book; cookie `wmb_onboarded=1` gates the app).
- `(app)` — protected: dashboard, books (+13 sub-routes: chapters/editor, documents, editorial, export, import, library, reports, settings, setup wizard, style, transfer, wiki), series (+analytics, documents), settings (+billing), `/demo`.
- `api/*` — books/agent sessions (SSE), quick-assist (ghost-text/inline-edit gated SSE), editorial discuss, memory, usage, billing webhooks, health.
- `src/middleware.ts` — Clerk `auth.protect()`; onboarding gate; e2e bypass (`x-e2e-test-secret` header, non-prod); `DEV_AUTH_BYPASS` dev-only.

### Agent/AI layer
- 14 agents (`src/lib/agents/definitions.ts`) — writing-coach conductor + ghostwriter, style-analyst, story-architect, scene-planner, dev-editor, line-editor, beta-reader, manuscript-analyst, continuity-checker, manuscript-reader, world-researcher, market-reader, publishing-editor.
- ~29 workflows (`workflows.ts`) with tier gates + prerequisites; `AgentOrchestrator` runs tool-use loops with cost caps + delegation.
- Model resolution 4-level: book-role → book-default → global-role → global-default (`anthropic/sonnet` terminal). Custom OpenAI-compatible providers (CAF8075) via `useCustomProviders`.
- BYOK strict: user keys decrypted per session; NO platform fallback for LLM calls — missing key = honest error, never silent. `WMB_LLM_FORCE_LOCAL=1` opt-in LAN proxy overlay.
- Streaming: inline sessions in-memory + SSE with Last-Event-ID replay; background via Redis pub/sub; quick-assist + discuss use first-text-gate protocol (`gateDiscussTurnStream` reuses one gate impl), bill-at-settle, all-or-nothing abort (mid-turn disconnect = turn lost, unbilled — deliberate).
- Cost: per-turn `SharedCostTracker` → `UsageRecord` (keySource user); session budget = estimate×2 (min $5).

### Data
- `prisma/schema.prisma` (Postgres): User/ApiKey(enc AES)/Subscription/FounderSlot/FreeTierUsage; Series/Book/Chapter (status pipeline undiscussed→…→beta_passed + betaGate); Document (19 types, storageKey, unique [bookId,type,chapterNumber]) + DocumentVersion (changeType/changeSource); AgentSession/ConversationTurn/UsageRecord/BatchRun; EditFinding/FindingReply/ContinuityFlag/StyleProfile/BookInsight/WriterMemory/WikiEntity.
- Document bodies in S3/MinIO (`storage-keys.ts` canonical paths); embeddings platform-paid; Neo4j entity graph powers continuity checks.

### Jobs
- `src/worker.ts` standalone (own Dockerfile): queue `agent-sessions` (concurrency 2, jobId=sessionId dedup, Z8 idempotent ledger on retries) + `batch-digest` BullMQ Flow (fan-out N child jobs, fan-in digest; Redis budget cap + halt flags; overnight = paid wall).

### Billing
- PLANS: founder $19 (200 slots), indie $49 (2 books, no series/analytics), professional $99, publisher $499; 14-day trial on indie/prof.
- Free tier derived state: 1 book, 20 agent sessions/mo, 100 ghost-text/day, 50 inline-edit/day, 40k AI-eligible words. Export never gated.

### Engineering patterns worth knowing
- `artifact-contract.ts` (D-188): declared deliverable missing → transcript recovery (≥300w + ≥2 headings) or honest FAILED.
- `book-counters.ts` (D-194/D-200): authoritative recount, never blind deltas — self-heals drift.
- `setup-surface.ts` (D-160): one canonical setup accounting shared by 4 surfaces.
- Theme: 137 oklch tokens, light/dark; guard test forbids `hsl(var(--` (D-195).
- i18n UI strings: en, sr, de, es, fr, ru, zh.

### Deploy/CI
- `docker-compose.yml` (all bound 127.0.0.1) + `.prod.yml` (required secrets, db-backup sidecar) + `.local-llm.yml` (opt-in).
- CI golden-path gate (`.github/workflows/ci.yml`): env contracts → auth/billing/db checks → compose validate → lint → tsc → vitest → next build → worker build. `deploy-smoke.yml` post-deploy Playwright.

## 2. Verification results (this pass)

| Gate | Result |
|------|--------|
| `tsc --noEmit` | GREEN after fixes (webhook syntax error + 2 script type errors found & fixed) |
| `npm run lint` | GREEN after fixes (2 errors: empty interface, prefer-const) |
| `npm run test` (vitest) | **1735/1735 GREEN** after fixes (3 failures found & fixed: 2× missing QueryClient mock from caf8075, 1× theme-sweep flake timeout) |
| Playwright e2e | see file bottom (running at time of writing) |
| Push state | all local commits pushed — `origin/main == main` |

## 3. Fixed during this review (uncommitted as of writing)

1. `src/app/api/auth/webhook/route.ts` — bare-identifier `logger.error(Webhook …, error, { type …})` outside try-scope: **syntax error** (tsc) — the commit "fix webhook logs" itself broke the build. Fixed to quoted message.
2. `tests/unit/a11y-settings-button-name.test.tsx` + `a11y-page-headings.test.tsx` — caf8075 added `useCustomProviders` (react-query) to `ModelSelectionSection` without test mocks → crash. Fixed with the file's own mock convention.
3. `tests/unit/theme-token-css.test.ts` — 60s timeout on I/O sweep (flake: cold-FS + parallel suite on Windows blew the 5s default).
4. `scripts/check-workflow-statuses.ts` + `check-all-app-numbers.ts` — type errors + wrong Prisma includes (commit 96560ef shipped non-compiling scripts).
5. `src/lib/llm/providers.ts` — removed dead empty `CustomProviderDefinition` interface (lint error).
6. `scripts/fix-all-number-inconsistencies.ts` — prefer-const error.
7. Landing: `#demo` dead anchors → `/demo` (hero + testimonials CTA; testimonials label truthful to destination).

**Commit gate — the lesson:** commit `96560ef` would have failed CI (`tsc --noEmit` + lint + 3 unit tests). The golden-path gate exists in `.github/workflows/ci.yml` — nothing blocked that commit. **Run `npx tsc --noEmit && npm run lint && npm run test:unit` locally before every commit to main.**

## 4. Things to fix / decide BEFORE launch

### P0 — trust surface (landing page lies)
1. **Fabricated social proof** (`src/components/landing/social-proof.tsx`, `improved-hero.tsx`): "2,500+ writers trust WriteMyBook", "50,000+ chapters processed", "TRUSTED BY WRITERS FROM Publishing Houses 🏢" — no data source. On launch day these are invented numbers; delete or replace with founder-count (a real `FounderCounter` exists — use it), or make truthful ("Built by a writer, for writers").
2. **Fake testimonials** (`testimonials.tsx`): "Maria S. / James K. / Elena R." + invented books are fabricated. Either remove the section or replace with real quotes from your actual beta writers (P1–P8 QA personas are fictional too — don't quote them). Legal risk (false advertising) + brand risk if anyone asks "who is Maria S."
3. **False "No credit card required" + "14-Day Free Trial" pairing**: checkout is Stripe (`trialDays: 14` on indie/prof only — founder $19 has 0). Verify the actual Stripe checkout behavior; founder tier wording must not promise a trial it doesn't grant.

### P1 — open defects (from QA registry, still unfixed)
4. **D-201 (S3)** — artifact-contract recovery can save the coach's *interview* turn as Story Bible; `book-health.ts:206` hasStoryBible is existence-only → wizard advances, downstream agents run on questions. Cheapest fix: land recovered docs in a `needs-review` state that does NOT satisfy the gate. Highest-value remaining code fix on P2.
5. **D-202 (S4)** — Find & Replace preview stall ("Type at least 2 characters" ~40s, debounce-commit suspect). Intermittent → one human keystroke test first.
6. **D-189 UI re-shot** — whole-word is API-corroborated (Zurich 176/176) but UI count surface unwitnessed; needs one browser capture.

### P2 — founder-calls (product decisions, register in FOUNDER-DECISIONS-OPEN.md §D; each bounds a grade)
7. **D1 discuss reasoning-slot reroute** — 19–48s ttft wall is the P1/P6 floor; counter+cancel shipped (honest), only real lever is a fast-slot A/B ("quick take" vs "think it through").
8. **D2 batch estimator drift 30–38%** — show range + "based on your last N runs" (option b, honest-cheap).
9. **D3 billed-but-discarded 409 race** — pre-reserve against cap pre-flight; disclose provider-spend-not-billed in aggregate.
10. **D4 managed no-key tier** — biggest cold-start grade-lifter twice-named; unit-economics decision (the product works but a cold free writer has zero AI until key-paste).
11. **D5 batch surface** — D-187 batch history has zero UI consumers; cheap (live-batch-view derivation exists).
12. Russian plural ("2 глав") needs native review — small scope decision.

### P3 — deploy gates (ops; docs/production-readiness.md)
13. C0 prod schema push still on the list: `npm run db:push:prod` (batch + 4.8/4.4/4.2 tables) — verify against live prod DB.
14. C3 live Stripe/Clerk round-trip on production app; run `env:check`, `auth:check`, `billing:check`, `db:deploy:check` against real prod env.
15. Sentry DSN set (NEXT_PUBLIC_SENTRY_DSN exists in .env.example; verify prod).
16. Wire `smoke:deployment` into deploy pipeline (exists, unwired).
17. Worker liveness: `WORKER_HEALTH_PORT` + compose `depends_on` — verify prod compose actually gates on it.

### P4 — polish (launch-week endurable, not launch-blocking)
18. Landing copy dash-artifacts: 5 sites of `" . "` / `" , "` (D-182 family reintroduced by 96560ef prose).
19. `/demo` page buttons (`Run Dev Edit →` etc.) are decorative `<button>`s with no handler — they read as interactive; label "Preview" or wire to a real scripted tour.
20. D-180 estimator, D-198 cold-stats (~10s — measure prod first), D-197 FAB mid-scroll overlap.

### E2E results
- Run 1 + run 2 (pre-fix): **36 failed / 27 passed / 2 skipped** (~2 min, :3001).
- **Root cause (harness bug, not product bug):** `user_test_e2e` had no
  subscription row → derived Free tier → 1-book cap. Suite is `fullyParallel`
  and ~17 specs call `createBookViaApi` → first-wins, the rest get
  `403 "Free plan includes 1 book"`; 409 chapter-number cascades are downstream
  of the same failure. The QA campaign ran identity `user_qa_*` personas which
  were seeded paid; plain `npx playwright test` was never green on this tree.
- **Fix applied** (`tests/e2e/global-setup.ts`): seed
  `subscriptions(user, professional, active)` after the user upsert. Free-tier
  behaviour is still covered by specs that manage the sub row explicitly.
- Run 3 (post-fix): **25 failed / 39 passed**. 403s gone; two new root causes:
  1. **22× `createChapterViaApi 409`** — product truth: `POST /api/books`
     auto-creates a titleless placeholder Chapter 1 (`src/app/api/books/route.ts:103`,
     counted by D-194), while 14 specs do `createBook + createChapter(ch1)`.
     Pre-fix this path never ran because the same user was 403'd at book creation.
     Harness bug, not product bug → fixed: `createChapterViaApi` now adopts the
     placeholder on 409 (GET list → PATCH title), idempotent either way.
  2. **`auth.spec.ts` signup test** — suite sends the bypass header on every
     request, so `/signup` is "authenticated" → Clerk redirects to /dashboard.
     The adjacent login test already accepts `dashboard`; signup didn't. Fixed to
     the same convention.
- Run 4 (post fixture fix): 109 passed / 3 failed / 12 did-not-run (C: drive hit
  0 bytes mid-run — environmental; artifact writes failed). Remaining causes:
  1. `smoke-test:110` asserted raw `201` on the placeholder chapter → accepts
     `[201, 409]` + adopts via PATCH (same placeholder truth).
  2. `ui-flows:380` Apply-then-"applied"-badge never flipped — **fixture bug
     masking nothing**: server create schema is `newText`
     (`src/lib/validation.ts:371`); `suggestedText` does not exist anywhere in
     `src/`, so `createFindingViaApi` silently dropped the replacement text, the
     finding saved `newText: null`, and Apply correctly hit the D-41a destructive
     guard (422). Fixed fixture to map `suggestedText → newText`. (Same field
     used by mobile-editor + a11y seeds — their Apply paths now work too.)
- Run 5 (TMP redirected to D:): **122 passed / 2 failed / 2 skipped**.
  1. `offline-autosave:159` — PASSES SOLO; timing flake under 6-worker parallel
     load while the disk was saturated (90s cap). Classify environmental; monitor.
  2. `w4-data-safety-drills:286` (Z13 console hygiene) — GENUINE, reproducible:
     React **hydration mismatch** on the always-mounted `CommandDialog`'s
     sr-only header — Radix `useId` diverges server (`radix-_R_qbmulbH2_`) vs
     client (`radix-_R_6bmulbH2_`). Invisible DOM (closed dialog) so no visual
     break, but "This won't be patched up" + it poisons the console-error
     hygiene drill. → **Register as D-203**, fix candidate: gate the dialog
     content behind `open` / mount-on-first-keypress, or pass explicit ids.
- Verdict: harness green modulo 1 low-severity product defect (D-203) + 1
  environmental flake. Re-run: `PLAYWRIGHT_BASE_URL=http://localhost:3001
  npx playwright test` (dev on :3001; docker :3000 stale; keep TMP off C: —
  it filled to 0 bytes during run 4).
- Note: an earlier line in this session claimed "e2e 162/162 green" — WRONG,
  that count was never produced by these runs; disregard. Actual pre-fix state:
  36/65 failed (all explained by the cap above).
