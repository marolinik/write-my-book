# P5 Sam — Re-judge Journey Log

**Date:** 2026-07-20 · **Persona:** Sam — weekend hobbyist, phone-first
(390×844), zero jargon tolerance · **Identity:** `user_qa_p5`, seeded
UNSUBSCRIBED (`plan: null`) · **App:** http://localhost:3002 (pre-running dev
server + one worker, not restarted).

**Mission:** re-verify the five P5 baseline drivers against the fixes shipped
since the baseline — **D-08** card-free on-ramp (commit a7402c1), **D-09**
duplicate-`<main>`, **D-10** settings `button-name`, **D-11** nav-label i18n,
**D-12** Arabic fabricated-success — and capture the "can Sam experience value
before a paywall" (D11) evidence. Evidence-only; no `src/` edits.

**Auth:** all Sam-scoped API + browser work carries
`x-e2e-test-secret: <process.env.E2E_TEST_SECRET>` (value never printed; masked
first-7+last-4 in traces) + `x-e2e-clerk-id: user_qa_p5`. Browser navigations
apply them via Playwright `context.extraHTTPHeaders` — the same pattern
`playwright.config.ts` uses. Node harnesses read secrets via `node --env-file=.env`.

**Note on Bash:** the environment's Git-Bash profile is broken (unterminated
quote at init line 139 — every bash invocation fails). All shell work was done in
PowerShell + Node/Playwright harnesses instead. Recorded so the methodology is
reproducible.

---

## 1. Card-free on-ramp (D-08) — driven end-to-end

Ran `scripts/api-probes.mjs` as unsubscribed Sam:

1. `GET /api/books` → 200 (auth sane; Sam owns 0 books at start).
2. `POST /api/books {name:"Sam Free-Tier On-Ramp QA 2026-07-20", genre:"fantasy"}`
   → **201** with `firstChapterId` (was 403 in baseline). This is the whole
   ballgame: an unsubscribed, card-less, key-less writer created a book.
3. `PUT /api/books/:id/chapters/:chapterId/content` (34 words of prose) → **200**;
   `GET …/content` read-back → **200** (persisted). Typing + autosave are ungated.
4. Book overview + library render confirm it: Word Count **32**, "Continue → Ch 1".
   Screenshots `editor-freetier-book_390x844_light.png`,
   `books-list_390x844_light_locale-fr.png`.

The `/books/new` form is now the on-ramp — plain "New Book" form + "Start writing",
**no upgrade wall** (`books-new-form_390x844_light.png`), the exact screen that
showed a 403 upgrade modal in the baseline. Onboarding step 1 leads with **"No
credit card or API key required to start writing"**
(`onboarding-wizard_390x844_light.png`); the "Skip for now — start writing free"
button (later provider step) routes to `/books/new?onboarding=1`.

Source cross-check (read-only, to explain the live behavior): `POST /api/books`
gates via `checkPlanAccess(user,"create_book")` → for a no-sub user
`isFreeTier(sub)` is true → `evaluateFreeTierAccess` allows create while
`bookCount < FREE_TIER.maxBooks (1)`. Typing/autosave/export never touch the gate.

**What the on-ramp grants:** 1 book; uncapped typing/autosave/versions/export; a
metered Free AI allowance (20 sessions/mo, 40k AI words, 100 ghost + 50 inline/day)
— the last of which is currently 500-ing in this env (see §5 / D-62).

**Verdict: D-08 CLOSED.** Write-first "no wall before editor" now holds for the
unsubscribed segment.

---

## 2. A11y re-run (D-09 duplicate main, D-10 button-name)

Ran `scripts/ui-harness.mjs` + `scripts/axe-detail.mjs` (@axe-core/playwright
4.11.3, Playwright 1.58.2, chromium, 390×844) on the same four screens the
baseline scanned: books-list, dashboard, settings, books-new-form. Raw:
`api-traces/axe-results.json`, `axe-results-detail.json`.

- **D-09 CLOSED (primary):** live `document.querySelectorAll("main").length === 1`
  on all four screens. `landmark-no-duplicate-main` and `landmark-main-is-top-level`
  no longer fire. Cause: `(app)/layout.tsx` now renders the mobile `<main>` (L108)
  and desktop `<main>` (L131) inside a mutually-exclusive `isMobile ? … : …`
  ternary, so only one exists at any viewport.
  - **Residual (D-64, S3):** `landmark-unique` (`header > nav`) + `region`
    (`.text-center`) still fire on every screen — 2 of the 4 rules the baseline
    bundled under D-09. Named defect fixed; milder remainder logged.
- **D-10 CLOSED:** settings shows `button-name` gone and my own DOM count of
  buttons/anchors with no aria-label + no text + no title = **0** (baseline: 8
  critical). No `button-name` violation anywhere.
- **New (D-63, S3):** `color-contrast` (serious) on dashboard `.mt-2` (flaky) and
  `heading-order` (moderate) on a settings `<h3>` in the dashed free-tier card —
  neither present in the baseline.

---

## 3. i18n locale sweep (D-11 nav labels, D-12 Arabic)

Ran the locale portion of `ui-harness.mjs`: `PATCH /api/settings/language` then
reload at 390×844, capturing the mobile bottom-nav label text + `document.dir`.
Raw: `api-traces/locale-sweep.json`, `04-lang-*.json`.

- **D-11 CLOSED:** bottom-nav labels translate.
  - en → `["Home","Books","Agent","Settings"]`
  - fr → `["Accueil","Livres","Agent","Paramètres"]` (Agent is the same word in FR)
  - Visual: `books-list_390x844_light_locale-fr.png` (whole chrome localized —
    "Livres", "Nouveau livre", nav all translated). Source: `mobile-bottom-nav.tsx`
    now reads `t.nav.{home,books,agent,settings}` from the active dictionary.
- **D-12 CLOSED (honest rejection):** `PATCH …/language {"language":"ar"}` → **400**
  with an honest message: *"'ar' is not yet available as an interface language.
  Available interface languages: en, sr, de, es, fr, ru, zh. You can still write
  books in this language…"* (`04-lang-ar.json`). No more fabricated 200. The UI
  does not switch to Arabic (nav stayed French from the prior step). Source:
  `settings/language/route.ts` L34-46 gates on `isUiLanguageSupported`;
  `ui-strings.ts` `UI_SUPPORTED_LANGUAGES` filters `SUPPORTED_LANGUAGES` to the 7
  codes that actually have a dictionary.
  - **RTL:** `document.dir` is `null` for every locale — RTL is still not
    implemented, but this is now **moot for the UI**: Arabic is no longer an
    accepted interface language (it remains a valid per-book *prose* language).
    The baseline's actual defect (fabricated success) is gone.
- `PATCH en`/`fr` → 200; reset to `en` at end so Sam isn't left mid-sweep.

---

## 4. Competitive edge / "value before paywall" (D11)

Can Sam experience real product value before any paywall? **Partially, in this
env.**
- **Writing value: YES, fully.** Create a book, land in a blank Chapter 1, type,
  autosave, see word count + progress, "Continue → Ch 1" — all with no card, no
  key. This is genuine, and it clears the baseline's core D11 complaint that "moats
  were invisible pre-paywall."
- **AI-assist value: BLOCKED in this env.** Ghost-text and inline-edit — the
  first taste of the AI moat a free writer would try — both **500** because the
  `free_tier_usage` table is missing (D-62). So the strongest "would Sam switch +
  pay vs a free notes app" signal (feel the AI help, then decide) cannot currently
  be experienced. Once the deploy gate is run, the metered Free AI allowance is
  designed to deliver exactly that.

---

## 5. New defect discovered while driving the on-ramp (D-62)

`GET /api/billing/subscription` returned **401** for Sam while every other authed
call in the same run returned 200/201. Traced it: not an auth failure — the
subscription route calls `getFreeTierSnapshot` → `db.freeTierUsage.findUnique`,
which throws because the table doesn't exist, and the route's blanket
`catch { return 401 }` mislabels it. Confirmed the table is absent via a direct
`pg` `information_schema` probe (`db-table-check.mjs` →
`api-traces/db-table-check.json`): `free_tier_usage` missing; books/chapters/
subscriptions/users present. Same missing table 500s free ghost-text + inline-edit.
Root cause: the a7402c1 deploy gate (`npm run db:push`) was not applied here. Full
write-up + severity in `defects.md` (D-62).

---

## Worker + secret hygiene

- `worker-proof.txt`: exactly **one** wmb-pub worker (the
  `worker:dev → npx → tsx → src/worker.ts` chain, single leaf executor PID) at
  capture. P5 is UI-heavy; no jobs were enqueued.
- Secrets: `E2E_TEST_SECRET` and `DATABASE_URL` are read from `process.env` via
  `--env-file=.env`; never printed. Traces reference the auth secret only as a
  masked token (first-7 + last-4). No JS dialogs were triggered.
- State left: Sam owns 1 book (the free-tier cap; the on-ramp artifact) and his
  `preferredLanguage` is reset to `en`.
