# P5 Sam — Re-judge v2 Journey Log

**Date:** 2026-07-20 · **Persona:** Sam — weekend hobbyist, phone-first (390×844),
seeded UNSUBSCRIBED (`plan:null`, `user_qa_p5`) · **App:** http://localhost:3002
(dev server + one worker). **Evidence-only; no `src/` edits.**

**Mission:** produce a fresh v2 bundle that CONFIRMS whether the just-landed fixes
lifted P5's floor (D-92 billing + AI-assist, D-95 privacy copy) AND drives the
free-cap NEGATIVES the v1 capture only asserted (2nd-book 403 / export ungated /
no-auth 401).

**Auth:** all Sam-scoped API + browser work carries `x-e2e-test-secret`
(`process.env.E2E_TEST_SECRET`, never printed; masked first-7+last-4 in traces) +
`x-e2e-clerk-id: user_qa_p5`. Playwright injects them via `context.extraHTTPHeaders`
(same pattern as `playwright.config.ts`). Node harnesses read secrets via
`--env-file=.env`. **Bash unavailable** (repo Git-Bash profile breaks at init line
139 — same as v1); all shell work in PowerShell + Node/Playwright.

**Seeded-key disclosure:** `user_qa_p5` carries a **seeded, validated OpenRouter
key** (`default_model = openrouter-qwen36/sonnet`). Sam is plan-free but not truly
key-less; the BYOK AI path was exercised with real OpenRouter calls. Key reported by
provider+length only.

---

## 0. Pre-flight — DB state + server health (read-only)

- Server up: `/api/health` 200, `/` 200.
- `scripts/db-state-check.mjs` (`api-traces/db-state-check.json`): `free_tier_usage`
  table **PRESENT** (the v1 D-92a "missing table" is resolved on disk), 0 rows;
  Sam = `d68c3b5e…`, `default_model openrouter-qwen36/sonnet`, subscription **null**,
  **1 validated OpenRouter key**, **1 book** (v1 leftover, id `35ff1112…`, first
  chapter `10334dac…`), no free_tier_usage meter row yet.

## 1. Confirm items 1 & 2 (D-92 billing + AI-assist) — ran `scripts/api-probes-v2.mjs`

Full sequence in `api-traces/` (+ `_probe-summary.json`). Key live results:
- `GET /api/books` → 200 (Sam owns 1 book).
- **`GET /api/billing/subscription` → 500** "Failed to load subscription"
  (`02-subscription-get.json`). **Expected 200 + freeTier snapshot; got 500.** NOTE:
  this is an honest **500**, NOT the v1 false **401** — the D-92b 401-mask IS fixed.
- `GET /api/usage` → 200 (`02b-usage-get.json`; shows Sam has 1 embedding usage
  record, no prior successful ghost-text).
- **`POST …/ghost-text` → 500**, **`POST …/inline-edit` → 500**
  (`40/41-*.json`). Expected 200 with real output; still 500.
- `GET /api/billing/subscription` again after AI → still 500 (`42-*.json`).

**These contradicted the mission premise ("fixes NOW LIVE"), so I traced the root
cause rather than just reporting the numbers.**

## 2. Root-cause of the still-500 (the fix is correct but NOT loaded) — D-96

1. **Table shape is correct.** `scripts/introspect-free-tier-usage.mjs`
   (`introspect-free-tier-usage.json`): all expected columns + composite
   `UNIQUE(user_id, day)` + FK present. No missing/extra columns. So NOT a schema
   mismatch.
2. **Generated client has the delegate.** grep of `src/generated/prisma/` finds
   `models/FreeTierUsage.ts`.
3. **A fresh process runs the exact app code GREEN.** `scripts/repro-snapshot.ts`
   (imports the app's own `db` + `getFreeTierSnapshot`) → `repro-snapshot.json`:
   `db.freeTierUsage.findUnique` returns `null` (no throw); `getFreeTierSnapshot(sam)`
   → `{sessionsLimit:20, ghostUsedToday:0, inlineUsedToday:0, aiWordsUsed:32,
   aiWordsLimit:40000}`. **The fix works when freshly loaded.**
4. **Timeline proves the running web server predates the fix.** `worker-proof.txt`
   CreationDate + file mtimes: web server (PID 2488) started **2026-07-18 14:53**;
   fix landed **2026-07-19 09:57–10:01**; only the **worker** was restarted
   (**2026-07-20 11:04**). `src/lib/db.ts` caches the PrismaClient on `globalThis`;
   Next dev HMR reloads route code (that's why 401→500 is live) but **not** the
   cached client. ⇒ the live routes still use a pre-`FreeTierUsage` client and throw.

**Conclusion:** D-92 is FIXED in code/schema/DB/generated-client but **NOT DEPLOYED
to the running web server**. A web-server restart is required. I did **not** restart
it (evidence-only; ~dozens of other agents share this env). Filed **D-96 (S2)**.

## 3. Even post-restart, the moat's first taste fails — D-97

`scripts/repro-ai-assist.ts` + `repro-ai-diagnostic.ts` (fresh process, real
OpenRouter calls with Sam's seeded key):
- Metering gate CLEARS (`ghostQuota allowed:true remainingToday:100`;
  `inlineQuota allowed:true remainingToday:50`) — so D-96 is the sole live blocker.
- Route resolves `openrouter-qwen36/haiku` (`qwen/qwen3.6-27b`),
  `resolvedRoute:"openrouter"`.
- **But the model returns only `["thinking","redacted_thinking"]` blocks, no `text`,
  `stop_reason:"max_tokens"` at both 60 and 400 tokens** (`repro-ai-diagnostic.json`)
  → the route's D-04/D-38 guard would return **502 "cut off, retryable"**, never a
  usable suggestion (`repro-ai-assist.json`: `ghostText.suggestion:""`,
  `inlineEdit.suggestions:[]`). Filed **D-97 (S2)** — reasoning default model ×
  60-token ghost budget = guaranteed empty first taste.

## 4. Free-cap NEGATIVES — driven live (the v1 evidence gap)

`api-probes-v2.mjs`, all raw:
- **(a) 2nd book → 403** (`10-create-2nd-book-cap-403.json`): "Free plan includes 1
  book. Upgrade to Indie…", `upgradeToTier:indie`. **CONFIRMED-LIVE, driven.**
- **(b) export existing book → 200 real** (`20-export-existing-book.json`):
  `docx, wordCount 96, chapterCount 1, estimatedPages 6`. **Ungated. CONFIRMED-LIVE.**
- **(c) no-auth / no-secret → 401?** **NOT confirmable** — `DEV_AUTH_BYPASS:"true"`
  (`00-env-flags.json`) silently authenticates header-less requests as the DEV user:
  no-auth `GET /api/books` → **200** returning the dev user's books (`31-*.json`),
  no-auth subscription → 500, no-auth create → 403, wrong-secret subscription → 500
  (`30/32/33-*.json`). Filed **D-98** (env/config; dev-only bypass, S1-if-prod).

## 5. D-95 privacy copy + editor UI — `scripts/ui-capture-v2.mjs` (Playwright, 390×844, AS Sam)

- **D-95 CONFIRMED-LIVE** (`onboarding-step1-privacy_390x844.png`,
  `ui-capture-v2.json`): screen 1 renders "Your Writing Stays Yours / stored
  encrypted at rest and sent only to the AI provider you connect / never use your
  content to train AI models / keys encrypted". Old false "never stores or processes
  … on our servers" **ABSENT** (`hasOldFalseClaim:false`).
- **Editor CONFIRMED-LIVE** (`editor-chapter_390x844.png`, `book-overview_390x844.png`):
  Sam's prose + "32 words" render. **Live in-page ghost-text fetch → 500**
  ("what Sam sees" = an error, not a suggestion — D-96).
- **Billing page** (`billing-page-live_390x844.png`): the static plan grid renders,
  but the Free current-plan / usage banner is **silently missing** because the
  subscription API 500s (no visible error string — soft degradation).

---

## Worker + secret hygiene

- `worker-proof.txt`: exactly **one** leaf `src/worker.ts` executor (PID 61892; the
  npx→tsx→loader chain is one logical worker), restarted 2026-07-20 11:04. P5 is
  UI/API-heavy; enqueued no jobs.
- Secrets: `E2E_TEST_SECRET` / `DATABASE_URL` read from `process.env` via
  `--env-file=.env`, never printed; auth secret only ever a masked token. API keys
  reported by provider + length only. No JS dialogs.
- **State left (minimal):** Sam still owns exactly 1 book (the 2nd-book create was
  rejected 403; nothing created). One real `.docx` export artifact was produced in
  Sam's storage (`exports/Sam-Free-Tier-On-Ramp-QA-…docx`). AI-assist repros were
  **read-only** (no usageRecord/meter writes); the real OpenRouter calls consumed a
  small amount of the seeded key's credits (sanctioned by the mission). No
  `src/` edits.
