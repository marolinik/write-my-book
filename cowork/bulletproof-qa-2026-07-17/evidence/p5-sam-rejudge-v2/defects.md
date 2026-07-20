# P5 Sam — Re-judge v2 Defects (evidence-only, live-driven 2026-07-20)

> **v2 mission:** CONFIRM the just-landed fixes lifted P5's floor AND drive the
> free-cap NEGATIVES the v1 capture only asserted. Evidence-only; **no `src/`
> edits**. All raw traces in `api-traces/`, screenshots in `screenshots/`, harness
> scripts in `scripts/`. Secrets read from `process.env` via `--env-file=.env`,
> **never printed** (auth secret masked first-7+last-4; API keys reported by
> provider + length only). One worker throughout (`worker-proof.txt`).

Persona: **Sam**, weekend hobbyist, phone-first (390×844), seeded **UNSUBSCRIBED**
(`plan:null`) as `user_qa_p5` (DB confirms `subscription = null`,
`default_model = openrouter-qwen36/sonnet`, one **validated OpenRouter** key).
Live app `http://localhost:3002`. Auth at the network layer:
`x-e2e-test-secret` (from `process.env.E2E_TEST_SECRET`) + `x-e2e-clerk-id: user_qa_p5`.

Severity S-scale (campaign): S1 data-loss/overcharge/leak/bypass/crash · S2
journey-blocking/fabricated-output/false-positive · S3 friction · S4 cosmetic.

> **Provisional IDs.** New findings numbered **D-96 / D-97 / D-98** per the "next
> free ID" convention; the campaign has known concurrent-agent numbering drift
> (v1's D-62/63/64 were renumbered to D-92/93/94; D-95 = privacy copy). Coordinate
> with the shared register before final numbering.

> **SEEDED-KEY DISCLOSURE (required).** This `user_qa_p5` account carries a
> **seeded, validated OpenRouter API key** (env provisioning seeded all personas;
> the base `qa-seed-personas.ts` deletes keys, so this key was added by a separate
> provisioning step). Sam is therefore **plan-free but NOT truly key-less** — the
> BYOK AI-assist path CAN be exercised. Every "AI-assist" result below was produced
> with that seeded key against real OpenRouter (`qwen/qwen3.6-27b`). Reported by
> provider + length only (`api-traces/db-state-check.json`,
> `repro-ai-assist.json`); the key value is never printed.

---

## Confirm-item verdicts (headline)

| # | Mission item | Verdict | Was → Now | Proving file |
|---|--------------|---------|-----------|--------------|
| 1 | **D-92 billing honesty** — billing GET returns 200 + freeTier snapshot | **STILL-BROKEN LIVE (500)** — but the 401-mask is fixed | 401 → **500** | `api-traces/02-subscription-get.json` |
| 2 | **D-92 AI-assist works** — ghost-text / inline-edit 200 with real output | **STILL-BROKEN LIVE (500)** | 500 → **500** | `40-ghost-text-free.json`, `41-inline-edit-free.json`, `ui-capture-v2.json` (live editor fetch 500) |
| 3 | **D-95 privacy copy corrected** | **CONFIRMED-LIVE** | false claim → truthful | `screenshots/onboarding-step1-privacy_390x844.png`, `ui-capture-v2.json` |
| 4a | **Free cap** — 2nd book → 403 | **CONFIRMED-LIVE (driven)** | — | `10-create-2nd-book-cap-403.json` (403) |
| 4b | **Export ungated** — export existing book → 200 real | **CONFIRMED-LIVE (driven)** | — | `20-export-existing-book.json` (200, real .docx) |
| 4c | **No-auth control → 401** | **NOT CONFIRMED — masked by `DEV_AUTH_BYPASS`** → D-98 | expected 401 → **got dev-user access** | `30/31/32/33-*.json`, `00-env-flags.json` |
| 5 | **Editor UI + working-AI capture** | **PARTIAL** — editor CONFIRMED; working-AI NOT capturable live (500) | — | `screenshots/editor-chapter_390x844.png`, `ui-capture-v2.json` |

**Exact status deltas asked for:** billing GET **401 → 500** (still non-200);
AI-assist (ghost-text / inline-edit) **500 → 500** (still broken).

---

## Root-cause investigation — why item 1 & 2 are STILL 500 (the fix did NOT go live)

The v1 defect D-92 blamed the **missing `free_tier_usage` table** (deploy drift
D-92a) plus a **401-masks-500** latent code bug (D-92b). Both were "fixed." Driving
v2 live shows the surfaces are **still down**, but for a *different* reason — so
the diagnosis is split precisely below.

**What is now CORRECT (verified):**
- `free_tier_usage` table **EXISTS** with the exact expected shape — columns
  `id, user_id, day, ghost_text_calls, inline_edit_calls` + composite
  `UNIQUE(user_id, day)` index + FK to users.
  Proof: `api-traces/db-state-check.json`, `introspect-free-tier-usage.json`.
- The generated Prisma client on disk **includes** the `FreeTierUsage` delegate
  (`src/generated/prisma/models/FreeTierUsage.ts`).
- **A fresh Node process running the app's OWN modules succeeds green.**
  `getFreeTierSnapshot(sam)` returns a real snapshot
  `{sessionsUsed:0, sessionsLimit:20, ghostUsedToday:0, inlineUsedToday:0, aiWordsUsed:32, aiWordsLimit:40000}`;
  `db.freeTierUsage.findUnique(...)` returns `null` without throwing.
  Proof: `api-traces/repro-snapshot.json`.
- The 401-mask (**D-92b**) is **FIXED in code**: the live billing route now returns
  an honest **500 "Failed to load subscription"**, not the old false **401
  "Unauthorized"**. Proof: `02-subscription-get.json` (500, not 401).

**Why it's still 500 LIVE → D-96.** See below.

---

## D-96 (NEW, S2) — Fix is correct on disk but NOT LIVE: the running Next dev **web server was never restarted**, so it serves a STALE cached Prisma client → billing + AI-assist still 500 for every Free user

**Mechanism (confirmed by timeline + fresh-process repro):**
- `src/lib/db.ts` caches the PrismaClient instance on `globalThis.prisma`
  (`globalForPrisma.prisma ?? createPrismaClient()`, kept in non-prod). Next.js dev
  **HMR reloads route source modules but does NOT rebuild that cached client
  instance.** A full web-server restart is required to pick up a regenerated client.
- **Process/file timeline** (`worker-proof.txt` CreationDate + file mtimes):
  - Web dev server (PID 2488 / start-server.js): started **2026-07-18 14:53** —
    ~20 h **before** the fix.
  - Fix landed: `free-tier-meters.ts` mtime **2026-07-19 09:57**; generated Prisma
    client mtime **2026-07-19 10:01**.
  - **Worker**: restarted **2026-07-20 11:04** (fresh — matches the mission's
    "worker restarted"). **Only the worker was restarted; the web server was not.**
- The running web server therefore holds an in-memory Prisma client generated
  **before** the `FreeTierUsage` model existed → every `freeTierUsage`-touching
  route throws → caught → **500**. Routes that never touch it are fine in the same
  run (`GET /api/books` 200, `GET /api/usage` 200), which is exactly the fingerprint
  of a stale-client-scoped failure.
- The route CODE *has* hot-reloaded (proof: the 401→500 change is live), but the
  cached DB client has not — so HMR gives a false impression of "fix is live."

**Live blast radius (all as Free Sam, same headers that 200 elsewhere in the run):**
1. `GET /api/billing/subscription` → **500** (`02-subscription-get.json`). Billing
   page cannot render the Free current-plan / usage banner (the static plan grid
   still renders — `screenshots/billing-page-live_390x844.png`,
   `ui-capture-v2.json` `billingPage`; note **silent** degradation, no visible error).
2. `POST …/ghost-text` → **500** (`40-ghost-text-free.json`; live editor fetch also
   500 — `ui-capture-v2.json` `liveGhostTextFromEditor`).
3. `POST …/inline-edit` → **500** (`41-inline-edit-free.json`).

**Verdict:** the D-92 fix is **CORRECT** (code + schema + DB + generated client all
verified; a fresh process runs green) but **NOT DEPLOYED to the running web server**.
P5's floor is **NOT lifted in the environment as it stands** — a **web-server
restart** is required for the fix to take effect. This is the same user-facing
outcome as D-92a (billing + free AI down for the on-ramp persona) via a new
mechanism (stale in-memory client vs. missing table).

**Severity S2** — journey-blocking for the money-path (billing page) and the D11
"taste the AI moat before paywall" story; single web-server restart resolves the
runtime part. Recorded RAW; deploy-vs-runtime split left for judges.

---

## D-97 (NEW, S2) — Even after a restart, the Free AI moat's first taste fails: Sam's seeded reasoning model returns **only `thinking` / `redacted_thinking`** blocks → ghost-text/inline-edit 502 "cut off", never a usable suggestion

Bypassing the stale web server with a **fresh-process reproduction** of the exact
route logic (`repro-ai-assist.ts`, `repro-ai-diagnostic.ts`) shows the metering
gate and provider route are fine but the **model output is unusable**:

- Metering gate CLEARS: `checkQuota(sam,"ghost_text")` → `allowed:true, isFree:true,
  remainingToday:100`; inline → `allowed:true, remainingToday:50`
  (`repro-ai-assist.json`). So D-96 is the ONLY thing blocking the gate live.
- Provider route resolves: seeded OpenRouter key → cheap model
  `openrouter-qwen36/haiku` (`qwen/qwen3.6-27b`), `resolvedRoute:"openrouter"`
  (not `"none"`).
- **But the model emits no text.** At `max_tokens` 60 **and** 400, the response
  content blocks are `["thinking","redacted_thinking"]` with **no `text` block**,
  `stop_reason:"max_tokens"` (all output tokens consumed by reasoning).
  Proof: `api-traces/repro-ai-diagnostic.json`.
- The routes extract `content.find(b => b.type === "text")` → empty → the D-04/D-38
  guard returns **502 "The suggestion was cut off before any text was produced.
  Please try again." (retryable)** — never a 200 with a suggestion, and correctly
  never fabricates or bills. `repro-ai-assist.json` shows `ghostText.suggestion:""`,
  `inlineEdit.suggestions:[]`.

**So the moat is blocked twice over:** (1) LIVE **500** (D-96 stale server); (2)
even once restarted, **502 empty-retry** with this seeded default model, because
the reasoning model spends the entire 60-token ghost budget (and the inline budget)
on `thinking`/`redacted_thinking`. A Free writer whose default is a reasoning model
gets an unrecoverable retry loop as their first AI experience.

**Severity S2** (journey-blocking for the D11 "experience AI value before paywall"
story with the seeded model). Note this is a **model×budget** interaction, not a
crash: the honest-502 refusal is arguably correct behavior, but the product ships no
`thinking`-budget handling / reasoning-model guard for the tiny ghost-text budget,
so the first taste is guaranteed empty. Recorded RAW.

---

## D-98 (NEW, env/config; S1-if-prod, otherwise NOT-A-PROD-DEFECT) — `DEV_AUTH_BYPASS=true` masks the no-auth 401 control: header-less requests are silently authenticated as the DEV user

The mission's negative control (a no-secret / no-auth request → 401) **cannot be
demonstrated in this environment.** `00-env-flags.json` shows
`DEV_AUTH_BYPASS:"true"`. `src/lib/auth.ts` (L75-78) resolves any request with no
E2E header to `DEV_CLERK_ID` (a real seeded user) when `NODE_ENV!=="production" &&
DEV_AUTH_BYPASS==="true"`. Driven live:

- `GET /api/books` **no-auth** → **200**, returns the **dev user's** books (e.g.
  "The Salt Letters", `userId 4611e6b9…` — NOT Sam's `d68c3b5e…`).
  `31-noauth-books-list-401.json`.
- `GET /api/billing/subscription` no-auth → **500** (dev user, then the D-96 500).
  `30-noauth-subscription-401.json`.
- `POST /api/books` no-auth → **403** (dev user hit their own plan cap).
  `32-noauth-create-book-401.json`.
- `GET /api/billing/subscription` **wrong-secret** → **500** (falls through the E2E
  branch to the dev-bypass user). `33-badsecret-subscription-401.json`.

**Assessment:** this is a **dev-only** bypass (`NODE_ENV!=="production"`-gated), so it
is not, by itself, a production auth hole. But it means: (a) the 401 negative
control is **unprovable here** — header-less requests get a real user's data; and
(b) it is a latent **S1** risk *iff* `DEV_AUTH_BYPASS` ever reaches a non-dev
deploy. Recorded RAW so judges have the env fact and the reason the 401 control is
absent. Also note the header-less list leaked the dev user's own book metadata into
`31-*.json` (dev-user self-data via the bypass, **not** a cross-tenant leak from
Sam).

---

## CONFIRMED-LIVE (fixes that DID hold)

### D-95 — privacy copy corrected: **CONFIRMED-LIVE**
Onboarding screen 1 now renders the truthful copy and the old false claim is GONE.
Live-rendered text (`ui-capture-v2.json` `onboardingPrivacy`,
`screenshots/onboarding-step1-privacy_390x844.png`):
> **Your Writing Stays Yours** — "Your manuscript is stored encrypted at rest and
> sent only to the AI provider you connect. We never use your content to train AI
> models, and your API keys are encrypted — we never see them in plaintext."

- `hasWritingStaysYours:true`, `hasEncryptedAtRest:true`, `hasNeverTrain:true`.
- **`hasOldFalseClaim:false`** — the old false "WMB never stores or processes your
  content on our servers" is **absent** from the live page (and grep-confirmed gone
  from `src/`; it now survives only in the `fix-reviews/` evidence doc). This copy
  matches published ToS (`terms:204`) + FAQ (`faq:29`).

### Free cap (2nd book → 403): **CONFIRMED-LIVE (driven, not asserted)**
`POST /api/books` as Sam (who owns exactly 1 book) → **403**:
> "Free plan includes 1 book. Upgrade to Indie for 2 active books and unlimited AI
> runs." `upgradeToTier:"indie"`. (`10-create-2nd-book-cap-403.json`.)
This closes the v1 evidence gap — all three v1 judges dinged the cap as
asserted-not-driven; it is now driven live.

### Export ungated: **CONFIRMED-LIVE (driven)**
`POST /api/books/:id/export {format:"docx"}` as free Sam → **200** with a REAL
export result: `filename Sam-Free-Tier-On-Ramp-QA-…​.docx, wordCount 96,
chapterCount 1, estimatedPages 6, warnings []`. No plan gate on export.
(`20-export-existing-book.json`; list → 200, `20b-export-list.json`.) Matches the
published promise "export is never gated — even if you cancel."

### Editor UI: **CONFIRMED-LIVE**
`/books/:id/chapters/:chapterId` at 390×844 renders Sam's prose ("Sam opened the
notebook…", `hasSamProse:true`) with **"32 words"** visible; book overview shows the
same. `screenshots/editor-chapter_390x844.png`, `book-overview_390x844.png`,
`ui-capture-v2.json` `editor`. **Working-AI capture NOT possible live** — the
editor's ghost-text fetch returns **500** right now (`liveGhostTextFromEditor`), so
Sam sees an error, not a suggestion (root cause D-96).

---

## Explicitly NOT filed / env caveats (so judges don't misread evidence)

- **`net::ERR_NAME_NOT_RESOLVED` for `clerk.example.test`** — known-benign fake
  Clerk test domain. Not a defect.
- **No-auth 401 "STILL-BROKEN" is NOT a code regression** — it is the
  `DEV_AUTH_BYPASS` env (D-98). The route auth code itself is unchanged.
- **The v1 "table missing" (D-92a) is genuinely resolved on disk** — the table now
  exists and is correctly shaped. The remaining live breakage is purely the
  un-restarted web server (D-96), not a schema problem.
