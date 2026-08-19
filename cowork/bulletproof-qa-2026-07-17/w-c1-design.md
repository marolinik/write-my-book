# W-C1 FINAL DESIGN — CARD-FREE ON-RAMP ("Free" tier)

**Status:** BUILD SPEC — handed to Opus executors. Every task below is self-contained.
**Branch baseline:** `qa/bulletproof-2026-07-17` @ 8c9c2a1. All file:line anchors re-verified against the working tree on 2026-07-19 by the synthesis agent (plan-gating.ts, quota-checker.ts, plan-gate.tsx, embeddings.ts, checkout route, onboarding route+wizard, agent/ghost-text/batch routes, books route, subscription route, stripe-client.ts, schema, use-books.ts all byte-checked).
**Provenance:** Judges split — J1 (product lens) ranked Design 3 first; J2 (engineering lens) ranked Design 1 first. Their graft lists converge almost exactly, so this spec is: **Design 1's zero-ripple engineering core** (FREE_TIER const, `plan:"none"` kept, no PlanKey widening, no status-code churn) + **Design 3's funnel & structural D-52 fix** (skip→/books/new, ghost/inline meters, all-denials-through-modal, `payment_method_collection:"if_required"`) + **Design 2's abuse grafts endorsed by BOTH judges** (central embedding/indexing gate, earn-the-grant credits, kill switch, concurrency fence, atomic ledger).
**Explicitly rejected** (with judge rationale):
- D3's archived-book count exclusion at `plan-gating.ts:68` — J1: unbounded archived storage; J2: silently loosens PAID Indie limits and reopens archive-to-swap slot-minting. **Keep counting ALL books incl. archived.**
- D3's 429→403 unification on agent routes — J2: avoidable test/caller churn. **Keep existing status codes; modal keys off `upgradeToTier` in the body.**
- D3's `PlanKey`/`PLANS` widening — J2 found the verified `PLAN_HIERARCHY` integration gap (`plan-gate.tsx:8` has no "free"). **Free is NOT a PLANS entry; stored plan stays `"none"`; display renames to "Free".** `plan-gate.tsx` needs ZERO changes ("none" at index 0 already means lowest tier).
- D2's export rate-limit (5/day) and vector-memory-hard-off — J1: brushes the P7 8.0 trust surface / hides a moat. **Export stays unlimited; vector memory is CAPPED for free, not off.**

---

## 1. TIER SPEC — "Free" (stored plan value stays `"none"`; display name "Free")

Who is Free: `!Subscription row` OR `status ∈ {none, canceled}` OR (`status === "trialing"` AND `trialEnd < now`). Derived at gate-evaluation time — **never written to the DB, never a Stripe object.** Free must NEVER be written as `status:"active"` (would 409 the D-06 checkout guard at `src/app/api/billing/checkout/route.ts:71-87`).

| Dimension | Free | Enforcement | Notes |
|---|---|---|---|
| Price / card / API key | $0, no card, no key to sign up or write | Tasks A6/A7 remove both walls | |
| Books | **1** (count ALL rows incl. archived, `db.book.count({where:{userId}})` — keep `plan-gating.ts:68` semantics) | free branch in `checkPlanAccess("create_book")` | anti archive-cycling |
| Typing / autosave / versions / crash buffer / conflict dialog | **Unlimited, full fidelity** | none — NEVER gate the content-save path | Writer-Trust Gate 1; P7 scored 8.0 |
| Export (docx/pdf/epub) | **Always allowed, no cap** | existing invariant `plan-gating.ts:22-24` — untouched | trust asset |
| AI-eligible words | **40,000** total across owned books (sum `Book.wordCount`, schema `prisma/schema.prisma:142`) — past cap: AI actions + vector indexing blocked; typing/save/export NEVER blocked | free-tier meter helper (Task A2) + indexing gate (Task A9) | D3's timing: lands mid-first-novel |
| Agent sessions (dev-edit/line-edit/beta-read/coach/write) | **20 / UTC calendar month** | count `AgentSession` rows `{userId, startedAt >= monthStartUTC}` (schema `:278`, `startedAt` `:294`) — no write path, no drift | resets on the 1st (UTC) — say so in copy |
| Ghost-text completions | **100 / UTC day** | `FreeTierUsage` daily counter (new table, §3) | closes D1's unmetered hole (J1) |
| Inline edits (F2) | **50 / UTC day** | `FreeTierUsage` daily counter | " |
| Concurrent running agent sessions | **1** | count `AgentSession {userId, status:"running"}` before create (Task A5a) | D2 graft; worker capacity |
| Batch / overnight workflows | **0 — paid wall** | new action `"run_batch"`, denied on free | worker infra is the real cost |
| Series / series-agent / analytics | **0 — Pro wall (unchanged)** | existing gates `plan-gating.ts:79-89`, `src/app/api/series/route.ts:44-50`, `series/[id]/analytics/route.ts:23`, `series/[id]/agent/route.ts:62-65` (Z3) | zero edits |
| Models | Any of the ~37 registry models via **BYOK** (user pays own tokens) | none | platform LLM spend = $0 by construction (`src/lib/llm/client-factory.ts:12`) |
| Vector memory (platform-paid embeddings) | **Indexed up to the same 40k-word cap**, then indexing pauses with honest UI copy; queries always allowed | central indexing gate (Task A9) | J1's growth amendment to D2's graft — moat stays demo-able; worst-case spend ≈ $0.0008/user (text-embedding-3-small) |
| Managed AI credits | **Phase B only:** $1.00 one-time grant (≈100 haiku-class credits), earn-the-grant | §8 | deferred behind founder go |

Paid tiers: completely untouched code paths (`plan-gating.ts:55+`). Indie's value prop vs Free: 2 books, unlimited AI sessions/words, batch/overnight, no daily meters.

All Free numbers live in ONE const — no hardcoding at gate sites.

---

## 2. IMPLEMENTATION PLAN — PHASE A (core, ship first; ~5-6 dev-days incl. tests)

Ordering matters: A1→A4 are the foundation; A5+ can parallelize. **Coordinate Task A7 with the D-35 fixer (session task #14) — same file `onboarding-wizard.tsx`; rebase onto whichever lands first.**

### Task A1 — `FREE_TIER` constants module
**File:** `src/lib/billing/free-tier.ts` (NEW).
```ts
export const FREE_TIER = {
  name: "Free",
  maxBooks: 1,
  monthlyAgentSessions: 20,
  dailyGhostText: 100,
  dailyInlineEdit: 50,
  maxAiEligibleWords: 40_000,
  maxConcurrentSessions: 1,
} as const;
```
Also export:
- `isFreeTier(sub: Subscription | null): boolean` — `!sub || sub.status === "none" || sub.status === "canceled" || (sub.status === "trialing" && !!sub.trialEnd && sub.trialEnd < new Date())`. This is THE single downgrade rule; every other file imports it (D3's `resolveEffectivePlan` idea, D1's shape).
- `utcMonthStart(): Date` and `utcDayKey(): string` ("2026-07-19") helpers.
Do NOT add anything to `PLANS` in `src/lib/billing/stripe-client.ts:7-89` and do NOT touch `PlanKey` (`:91`) or `PURCHASABLE_PLANS` (`:94`) — avoiding the `PLANS[plan]` ripple at `subscription/route.ts:92` and `checkout/route.ts:30` is a deliberate, judge-endorsed decision.
Optional rollback lever: read `process.env.FREE_TIER_DISABLED === "1"` in `isFreeTierEnabled()`; Task A2 consults it (when disabled, gates behave exactly as today).

### Task A2 — `plan-gating.ts` core rewrite (THE change)
**File:** `src/lib/billing/plan-gating.ts` (whole file is 99 lines; verified above).
1. `:4-9` — extend `PlanAction` union with `"run_batch"`.
2. `:36-42` — the wall the judges hit (unconditional deny for no-sub/none/canceled, copy "Your subscription is inactive…"). REPLACE: when `isFreeTier(sub)` (also covers 3 below), evaluate free limits instead of denying:
   - `create_book`: `db.book.count({where:{userId}}) < FREE_TIER.maxBooks` → allow; else deny `{reason:"Free plan includes 1 book. Upgrade to Indie for 2 active books and unlimited AI runs.", upgradeToTier:"indie"}`.
   - `run_agent`: allow iff BOTH (a) `db.agentSession.count({where:{userId, startedAt:{gte: utcMonthStart()}}}) < FREE_TIER.monthlyAgentSessions` and (b) AI-word check `sumFreeWords(userId) <= FREE_TIER.maxAiEligibleWords` (sum `Book.wordCount` for userId, all books). Deny copy for (a): `"You've used 20 of 20 free AI sessions this month. They reset on the 1st (UTC). Upgrade to Indie for unlimited runs."`; for (b): `"Free plan includes AI on your first 40,000 words. Your writing, autosave, and export are never limited — upgrade to Indie for unlimited AI."` Both with `upgradeToTier:"indie"`.
   - `create_series` / `use_analytics`: deny with the EXISTING Professional copy (`:84`) and `upgradeToTier:"professional"`.
   - `run_batch`: deny `{reason:"Overnight batch runs are part of the Indie plan.", upgradeToTier:"indie"}`.
3. `:45-51` — expired-trial branch: DELETE the deny; expired trials fall into `isFreeTier` → free evaluation. This makes the shipped `missing_payment_method:"cancel"` (checkout `:158`) honest: trial expiry degrades to Free, never lockout.
4. `:91-94` — paid `run_agent` unchanged (unlimited). ADD `case "run_batch": return { allowed: true };` for paid plans (all paid tiers have batch today via `use_agent_session`; preserve that).
5. INVARIANTS that must survive review: `export` early-allow (`:22-24`) stays FIRST-after-signature; `!stripe` self-hosted allow-all (`:29-31`) stays ABOVE all free logic (self-hosted must not inherit free caps — regression test required).
**Tests (same task):** extend `tests/unit/plan-gating.test.ts` — matrix: {no row, none, canceled, expired-trial} × {create_book under/at cap, run_agent under/at session cap, run_agent over word cap, run_batch, create_series, export} + self-hosted allow-all + paid-path untouched. NOTE: existing assertions at ~`tests/unit/plan-gating.test.ts:74-90` encode the OLD deny — rewrite them to the new contract (they going red is expected).

### Task A3 — `quota-checker.ts` granular actions + upgradeToTier passthrough
**File:** `src/lib/billing/quota-checker.ts` (46 lines, verified).
1. `:4-10` — extend `QuotaAction` with `"run_batch" | "ghost_text" | "inline_edit"`.
2. `:24` — mapping: `use_agent_session → run_agent` (keep); `run_batch → run_batch`; `ghost_text`/`inline_edit` → `run_agent` for the plan check, THEN for free users additionally consult the daily meter (Task A4's `checkDailyMeter(userId, "ghost"|"inline")`); on meter exhaustion return `{allowed:false, reason:"Free plan includes 100 ghost-text completions per day. Resets at midnight UTC." /* or 50 inline edits */, upgradeToTier:"indie"}`.
3. `:32-36` — surface `upgradeToTier` in the return object (currently dropped).

### Task A4 — `FreeTierUsage` table + meter helpers
**Files:** `prisma/schema.prisma` (append), `src/lib/billing/free-tier-meters.ts` (NEW).
Schema (additive only):
```prisma
model FreeTierUsage {
  id              String @id @default(uuid())
  userId          String @map("user_id")
  day             String                    // UTC "2026-07-19"
  ghostTextCalls  Int    @default(0) @map("ghost_text_calls")
  inlineEditCalls Int    @default(0) @map("inline_edit_calls")
  @@unique([userId, day])
  @@map("free_tier_usage")
}
```
Helpers: `checkDailyMeter(userId, meter)` (read row for `utcDayKey()`, compare to FREE_TIER limit) and `recordDailyUse(userId, meter)` (Prisma `upsert` with atomic `{increment: 1}`). **Increment ON SUCCESS only** (after the LLM call returns), never on failure — D-36 lesson (never advance state on failure). The check-then-increment race can leak a few over-cap calls: ACCEPTED for these soft business caps; **this pattern is FORBIDDEN for the Phase B dollar ledger** (use atomic conditional decrement there, §8).
Agent sessions deliberately do NOT use this table — they're counted from `AgentSession` rows (zero write path, zero drift).
Migration: `npm run db:push` (dev). Prod: fold into the ALREADY-PENDING `npm run db:push:prod` (memory: batch + 4.8/4.4/4.2 tables still unpushed — this rides along, additive).

### Task A5 — Route wiring (5 routes)
a) **`src/app/api/books/[id]/agent/route.ts`** — gate at `:140-146` keeps `checkQuota(user.id, "use_agent_session")` and 429 status; ADD `upgradeToTier: quotaResult.upgradeToTier` to the 429 body (`:143`). ADD free-tier concurrency fence: immediately after the quota gate, if `isFreeTier(sub)` and `db.agentSession.count({where:{userId, status:"running"}}) >= FREE_TIER.maxConcurrentSessions` → 429 `{error:"One AI session at a time on the Free plan — your current session is still running.", upgradeToTier:"indie"}`. (Locate the `db.agentSession.create` call — ~`:355` per two designs — and place the fence before it, after ownership checks.)
b) **`src/app/api/books/[id]/ghost-text/route.ts:32-38`** — change action to `"ghost_text"`; add `upgradeToTier` + `remainingToday` to the 429 body; call `recordDailyUse(userId,"ghost")` after a successful completion.
c) **`src/app/api/books/[id]/inline-edit/route.ts:33-39`** — same with `"inline_edit"`.
d) **`src/app/api/books/[id]/batch/route.ts:106-109`** — change action to `"run_batch"` (free now hard-denied; paid unchanged); add `upgradeToTier` to the 429 body. (D-56 validation-before-ownership ordering in this file is a SEPARATE defect fix — do not fold in here, but don't regress it either.)
e) **`src/app/api/series/[id]/agent/route.ts:62-65`** — logic unchanged (Pro-gated); add `upgradeToTier` to the deny body if absent.
`src/app/api/books/route.ts:43-49` needs ZERO edits — it already forwards `access.reason` + `access.upgradeToTier` as 403 (verified); new Free copy flows automatically. Post-create it returns `firstChapterId` for the blank Chapter 1 editor (`:105-114`, verified) — the 60-second path's landing pad already exists.

### Task A6 — Onboarding server route: remove the key wall (Wall A)
**File:** `src/app/api/settings/onboarding/route.ts`.
DELETE the block at `:35-45` (keyCount check + 400 "Add at least one valid API key first"). Keep everything else: `onboardingComplete` update (`:48-51`) and `wmb_onboarded` cookie (`:54-60`). `src/middleware.ts` unchanged (cookie flow at `:66-75`; `/api/settings/api-keys` already onboarding-exempt at `:20-24`).

### Task A7 — Wizard skip UX (⚠ coordinate with D-35 fixer — same file)
**File:** `src/components/onboarding/onboarding-wizard.tsx`.
1. Step-2 footer (`:216-232`, verified): the Continue button is `disabled={connectedCount === 0}` (`:226`). ADD a secondary ghost CTA next to it, visible when `connectedCount === 0`: **"Skip for now — start writing free"**, which calls `handleFinishSetup` in skip mode.
2. `handleFinishSetup` (`:81-111`, verified): the `if (!effectiveSelectedProvider) return;` guard (`:82`) must permit the skip path; in skip mode, SKIP the default-model PATCH (`:96-101`); route skip-mode users to **`/books/new?onboarding=1`** instead of `/dashboard` (`:104`) so the first action is naming their book, not a dashboard of zeros (D3's funnel craft, credited by J1).
3. Step-1 copy (`:138-140`): add line "No credit card or API key required to start writing."
4. Verify the cookie is set on the skip path too (it is — same POST).
**Funnel target: signup → skip → named book → typing in a blank autosaving Chapter 1 in ≤60s** (verified feasible: Clerk signup ~20s + skip ~10s + `POST /api/books` 201 with `firstChapterId`).

### Task A8 — Client: ALL plan/quota denials route through the upgrade modal
**Files:** `src/hooks/use-books.ts:97-102` (verified pattern: `err.status === 403 && err.upgradeToTier` → `useUpgradeModal.getState().show(...)`), `src/hooks/use-series.ts:94-99`, plus the agent/ghost-text/inline-edit/batch client hooks (currently surface raw toasts on 429).
Change the predicate everywhere to: **`if (err.upgradeToTier)` regardless of status (403 OR 429)** → open modal. Kill the "silent-toast wall" class. While here, fix the modal+toast double-fire (P5-exp defect 6): when the modal opens, suppress the generic error toast for the same failure. `src/components/billing/upgrade-modal.tsx:16-24` — add Free-tier `TIER_DESCRIPTIONS` copy; modal is already mounted globally (`src/components/layout/app-sidebar.tsx:684`).

### Task A9 — Central vector-indexing gate (D2 graft #1, both judges; J1's "capped not off" amendment)
**Files:** `src/lib/vector/indexing-gate.ts` (NEW) + prose-indexing call sites.
`src/lib/vector/embeddings.ts` is a pure OpenAI wrapper (verified — no db import; env gate `isEmbeddingAvailable()` at `:93-95`). Add NEW module exporting `canIndexProseForUser(userId): Promise<boolean>` = `isEmbeddingAvailable() && (!isFreeTier(sub) || sumFreeWords(userId) <= FREE_TIER.maxAiEligibleWords)`.
Wire it into every PROSE-INDEXING entry point (grep importers of `@/lib/vector` — ~12 files; the known write paths from commit 3969c86: VM1 on-save in `src/app/api/books/[id]/chapters/[chapterId]/content/route.ts`, VM2 rebuild in `src/app/api/memory/rebuild/route.ts`, import route, `src/lib/agents/post-session.ts`). **Queries/search embeddings stay ungated** (moat stays demo-able; per-query cost ≈ nothing). When gated: skip indexing AND surface state honestly wherever memory status renders — copy "Vector memory indexes your first 40,000 words on the Free plan — upgrade to index everything." NO silent degradation (D-35/D-36 lesson), but also no per-save toast spam. This closes the ONLY per-free-user platform-LLM spend (embeddings on `process.env.OPENAI_API_KEY`, `embeddings.ts:22-23`).

### Task A10 — Display surfaces + honesty copy (D-52 disclosure half)
1. `src/app/api/billing/subscription/route.ts:91-107` (verified): keep `plan:"none"` in the payload (plan-gate hierarchy depends on it — `src/components/billing/plan-gate.tsx:8` has "none" at index 0, needs ZERO changes). Change display fields when free: `planName:"Free"` (not "No Plan", `:96`), `maxBooks: FREE_TIER.maxBooks` (not 0, `:100`), and ADD `freeTier: {sessionsUsed, sessionsLimit, ghostUsedToday, inlineUsedToday, aiWordsUsed, aiWordsLimit}` so walls/banners can show real numbers.
2. `src/app/(app)/settings/billing/page.tsx` — add a "Free — $0" card to `PLAN_CARDS` (`:41-108`) rendered as "Your current plan" when `currentPlan === "none"` (`:119`); fix the Indie badge at `:65`: `"14-day free trial"` → `"14-day free trial — no card needed"` (TRUE after Task A12; if founder defers A12, use `"14-day trial (card required)"` instead — see FQ-1).
3. `src/components/landing/pricing-section.tsx` — add Free column/card (`PLAN_ORDER` at `:27`), CTA **"Start writing free — no card, no API key"** → `/signup`; trial CTA copy at `:88-92` aligned with FQ-1 outcome.
4. `src/app/(public)/terms/page.tsx:138-139` — amend the trial sentence to match reality (card-free per A12, or disclose card requirement if deferred) + one sentence describing the Free tier.
5. Post-skip banner (small NEW component on dashboard/editor for free users): "You're on Free — 1 book, 20 AI sessions/mo with your own key, AI on your first 40,000 words. Your writing is always exportable." Dismissible, honest, no dark patterns.

### Task A11 — Keyless-error copy audit (D1 risk-3 / J1 runner-up graft)
The wizard's key wall was accidentally shielding all no-key error paths; skipped users now reach every AI button keyless. Audit EVERY AI surface (agent panel, ghost-text, inline-edit, coach): the BYOK no-key error must return actionable copy + status ("Add an API key in Settings → API Keys — it's free to connect") and the UI must render it, never a D-15-class empty-body 500. Entry points: `src/lib/llm/client-factory.ts:12` explicit no-key error, `src/lib/llm/error-translator.ts` mapping, each route's error branch. Add a Playwright case: keyless free user clicks ghost-text → sees the actionable message.

### Task A12 — Stripe: structural D-52 fix (one param + fence) — see FQ-1
**File:** `src/app/api/billing/checkout/route.ts`.
1. In `sessionConfig` (`:143-150`, verified), when `planDef.trialDays > 0`, ADD `payment_method_collection: "if_required"`. Combined with the ALREADY-SHIPPED `trial_settings.end_behavior.missing_payment_method:"cancel"` (`:152-162`, verified) this is Stripe's canonical card-free trial: no card at checkout → sub auto-cancels day 14 if none added → webhook maps to `canceled` → Task A2 reinterprets as Free. The "14-day free trial" copy becomes TRUE instead of softened.
2. One-trial-per-customer fence: `const hasHadTrial = !!sub?.trialEnd;` (the unique-per-user Subscription row retains `trialEnd` from any prior trial — `sub` already fetched at `:62-64`); when `hasHadTrial`, build `sessionConfig` WITHOUT the trial block (`:153-162`) so repeat checkouts are paid-from-day-1.
3. D-06 interplay (verified): trial-canceled users have `status:"canceled"` → `hasLiveSubscription` false (`:71-87`) → re-checkout works; free users with no row get one created with `plan:"none", status:"none"` (`:125-133`) — grep-audit note: this is one of the `"none"` sites that must keep meaning "not paid", never "denied".
4. Unit test: free user (no row / canceled / expired trial) can start checkout (no 409); `hasHadTrial` user gets no second trial.
Webhook (`src/app/api/billing/webhook/route.ts`): no changes — `customer.subscription.deleted → canceled` is reinterpreted as Free by A2. Executor: re-verify that handler before relying on it (D2 flagged its read as compressed).

### Task A13 — Test & QA sweep
1. Unit: A2 matrix (above), A3 meter mapping, A4 increment-on-success, A12 checkout fences. Update stale assertions: `tests/unit/plan-gating.test.ts:74-90`, `tests/unit/billing-checkout-guard.test.ts:118`, mocks in `tests/unit/series-analytics-route.test.ts`, `tests/unit/zod-error-no-leak.test.ts:62-91` (line refs from D3, judge-verified; confirm at build time).
2. E2E (Playwright, repo convention): the 60-second golden path — signup → wizard skip → `/books/new` → title → typing → autosave fires → export succeeds → create book #2 → modal with Free copy. Plus keyless ghost-text error case (A11).
3. QA persona seeds (commit 88f6ffa) and P5 probes encode the OLD wall (403 on first book, onboarding requires key) — update expectations: P5 Sam's first book now SUCCEEDS.
4. Grep-audit every `plan === "none"` / `status === "none"` comparison before merge (known sites: `plan-gate.tsx:8,27`, `billing/page.tsx:119-120`, `subscription/route.ts:91-101`, `checkout/route.ts:125-133`, `quota-checker.ts:30`): each must still mean "not paid", and none may treat Free as denied.

---

## 3. SCHEMA MIGRATION (complete list)

- **Phase A:** ONE additive table `FreeTierUsage` (Task A4). `Subscription` (`prisma/schema.prisma:45-63`) untouched. No enum changes, no backfill, no data migration.
- **Phase B (deferred):** `User.aiCreditBalance Int @default(0)`, `User.creditsGrantedAt DateTime?`, append-only `CreditTransaction {id, userId, delta Int, reason String, balanceAfter Int, createdAt}` (W6 lesson: money numbers reconstructable from raw rows). All additive.
- Push: dev `npm run db:push`; prod folds into the already-pending `npm run db:push:prod`.

## 4. STRIPE CHANGES (complete list)

- NO new products/prices. Free never touches Stripe.
- Task A12 only: `payment_method_collection:"if_required"` on trial checkouts + `hasHadTrial` fence. Keep `missing_payment_method:"cancel"` exactly as shipped.
- D-06 guard (`checkout/route.ts:71-87`) untouched; regression test that free users pass it.

## 5. ABUSE CONTROLS (Phase A posture)

1. **Platform LLM spend on free ≈ $0 by construction:** generation is BYOK-only (`client-factory.ts:12` — never falls back to platform keys; `UsageRecord.keySource` default `"user"`, schema `:386`); the sole platform spend (embeddings) is capped at 40k words/user by the central indexing gate (A9) ≈ $0.0008/user worst case.
2. Server-side unforgeable caps: sessions from `AgentSession` rows; ghost/inline from `FreeTierUsage`; book cap counts all rows (archive-cycling mints nothing).
3. Batch excluded from free entirely — the BullMQ worker/money path (budget breakers, Z11 digest fallback) never sees a free account.
4. Concurrency fence: 1 running session per free user.
5. Multi-account farming: bounded by Clerk email verification + per-user caps; farming is pointless in Phase A (tokens are self-paid). No IP controls in Phase A — accepted.
6. Wall-honesty invariants (campaign regression classes): every gate returns real status + real JSON body (never 200-but-false — D-35; never empty-body 500 — D-15; never advance state on failure — D-36/D-48); route ordering auth → ownership-404 → plan-403 → validation-400 (D-56 oracle) must not regress.
7. Deferred to Phase C (build only if abuse observed): Redis sliding-window rate-limit lib (the app has ZERO rate limiting today — D2's verified finding; only 429s are quota denials) with D2's budgets: book-create 10/day, agent sessions 10/day, key-validation 10/hr, import 1/day ≤2MB, chapter/doc caps (25/20). Export stays uncapped (trust surface) unless Pandoc CPU shows abuse.

## 6. UPGRADE-WALL UX (the funnel: moat first, wall second)

| # | Moment | Trigger | Behavior |
|---|---|---|---|
| 1 | Minute 0 | signup → skip → typing | NO wall. Conflict-safety moat (autosave/versions/crash buffer) runs silently and free. |
| 2 | First AI click, no key | BYOK no-key error | Not a paywall — actionable "Add your key in Settings (the provider bills you, $0 to us)" (A11). Phase B adds "Try it on us — $1 starter credit". First line-edit should land on the user's OWN prose (voice moat, P6 8.0 — the only verified moat; do NOT lead with continuity until the P3 rebuild lands). |
| 3 | Session 21 / ghost 101 / inline 51 | 429 + upgradeToTier | Modal (not toast) with real numbers from the A10 usage snapshot; monthly/daily resets mean free users are never dead-ended. |
| 4 | Book #2 or word 40,001 (AI) | 403/429 + upgradeToTier | "Your first book stays fully editable and exportable. Unlock book #2 / unlimited AI words with Indie." Typing NEVER blocked. |
| 5 | Batch / series / analytics | existing walls | Hard wall, contextual copy ("Overnight runs are how paid members wake up to edited chapters."). |
| 6 | Trial day 14, no card | auto-cancel → Free | Banner: "Your trial ended — you're on Free. Nothing was deleted. Your books and exports still work." Downgrade, never lockout — honesty IS the retention play. |
| 7 | Post-skip | dashboard/editor | Dismissible Free-status banner (A10.5). |
| Anti-moment | any denial as raw toast | — | Eliminated by A8 (modal on any `upgradeToTier`, double-fire fixed). |

## 7. ROLLOUT / MIGRATION

- **Zero data migration.** No-sub / none / canceled / expired-trial users become Free at gate-evaluation time on deploy — strict improvement (read-only → 1 writable book + capped AI).
- Over-cap grandfathering: caps gate creation/AI-starts only; a lapsed user with 3 books keeps editing/exporting all 3, can't create #4. No forced archiving, no deletion, ever.
- Rollback: revert commit (schema is additive, harmless to leave) or `FREE_TIER_DISABLED=1` env lever (A1, optional).
- Deploy order: Phase A is one PR; DB push (dev) before merge; prod push rides the pending `db:push:prod`.
- i18n: new strings English-first week-1 (extends known D-51 debt); file follow-up for the 14 locales.
- Monitoring post-ship: free→Indie conversion by wall moment, cap-hit rates (tune FREE_TIER constants), embedding spend/user, worker queue depth.

## 8. PHASE B — MANAGED STARTER CREDITS (deferred; requires founder go, FQ-2; ~5-7 dev-days + MANDATORY adversarial money-path review — this repo's worst defect class: Z8/Z11/D-06/W6)

The only piece that gives KEYLESS hobbyists day-zero AI (full teardown gap #4 / D11 parity with Sudowrite's 10k credits). Spec (D2's controls + D3's plumbing, both judges endorsed):
1. **Grant:** $1.00 one-time (≈100 credits), granted NOT at signup but when (a) Clerk email verified AND (b) ≥200 words typed in the editor (earn-the-grant — bots must do human-shaped work for $1 of haiku tokens); disposable-email-domain blocklist at grant time; one grant EVER (`creditsGrantedAt` non-null → no re-grant); backfill to existing verified accounts under identical conditions.
2. **Model lock:** platform-funded calls locked to cheap tier via existing `resolveCheapModelFor` (verified real at `ghost-text/route.ts:40-49`); sonnet/opus on credits → 422 upgrade wall.
3. **Session cap:** ≤$0.25/session on the managed path — override `MIN_SESSION_BUDGET_USD` ($5 floor, `agent/route.ts:50`, verified) for credit sessions so the existing orchestrator budget breaker enforces mid-stream; per-action `max_tokens` clamps (ghost 300 / inline 1k / coach turn 2k).
4. **Ledger:** atomic conditional decrement ONLY (`updateMany` with `aiCreditBalance >= N` in WHERE + count check — never read-then-write, Z8 class); append-only `CreditTransaction`; Redis spend counter with DB fallback (Z11 pattern, precedent commit c9e99e7). Money FAILS CLOSED on Redis+DB unavailability.
5. **Kill switch:** env `PLATFORM_FREE_AI_DAILY_CAP_USD` global daily cap; when tripped → honest 503 "Free AI is at capacity today — your own API key still works"; BYOK unaffected. Never a fake failure state (§6-item-3 judge theme).
6. **Labeling:** every platform-funded call writes `keySource:"platform"` (schema `:386` supports it) + UI badge "starter credit" — EXPLICIT, never a silent fallback (preserves the `client-factory.ts:12` BYOK-honesty promise, teardown Synthesis-2 row 3).
7. **Wall variant:** credits-exhausted modal with dual CTA — "Add your own API key — AI stays free" / "Start 14-day Indie trial" (BYOK-as-relief-valve: the wall no incumbent has).

## 9. OPEN FOUNDER QUESTIONS (only these truly remain)

- **FQ-1 — Ship the card-free trial (Task A12) in Phase A?** Both judges endorse the mechanism (safe only BECAUSE A2 makes expiry degrade to Free); J2 requires flagging the revenue trade: conversion shifts from "forgot to cancel" to "chose to pay" on day one, with no instrumentation period. **Default: YES, ship in Phase A** (it is the only honest fix for D-52; deferring means shipping the `"card required"` disclosure copy variant in A10 instead). Decide before A10/A12 start.
- **FQ-2 — Phase B go/no-go + grant size.** $1.00/100 credits, earn-the-grant. Bounded exposure ≈ $1/verified-human account. Without it, keyless hobbyists (P5 Sam archetype — the largest addressable segment) still get zero AI taste and D11 stays below Sudowrite/NovelAI parity. **Default: GO, immediately after Phase A stabilizes, with the mandatory adversarial review.**
- **FQ-3 — Approve cap defaults:** 1 book / 20 sessions/mo / 100 ghost/day / 50 inline/day / 40k AI words / 1 concurrent. All are constants in `FREE_TIER` (A1) — tunable post-launch from conversion data. **Default: approve as-is.**
- **FQ-4 — i18n:** English-first for the ~15 new strings acceptable for week-1? (Extends D-51 debt.) **Default: yes, with a filed follow-up.**

## 10. RISK REGISTER (carried from designs, deduplicated)

1. Zero-words-lost invariant: NO cap may ever touch the content-save/autosave path — word cap gates AI + indexing only (reviewer must verify).
2. Self-hosted regression: `!stripe` allow-all stays first branch (regression test in A2).
3. `"none"` semantics overload: grep-audit in A13.4 is mandatory pre-merge.
4. Keyless users now reach AI surfaces: A11 audit is NOT optional (D-15 class).
5. Meter race overshoot: accepted for soft caps; forbidden for Phase B money (atomic decrement only).
6. Test debt: old-wall assertions go red by design — budgeted in A13.
7. Concurrent-fixer collision: A7 vs D-35 fixer on `onboarding-wizard.tsx` — sequence explicitly.
8. Revenue cannibalization: canceled users regain capped AI; Indie's residual value = 2 books + unlimited AI + batch + no daily meters. Instrument before loosening caps.
9. Voice-moat-first funnel: do not demo continuity (P3=3.0) as the free taste until its rebuild lands.
