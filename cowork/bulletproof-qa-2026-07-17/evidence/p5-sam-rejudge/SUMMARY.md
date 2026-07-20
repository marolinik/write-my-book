# P5 "Sam" — Onboarding / Card-Free On-Ramp — REJUDGE SUMMARY

> Written by team-lead from the capture executor's returned report (the harness
> subagent-report guard blocked the executor from writing this file directly).
> These are the executor's CLAIMS — non-binding on judges; re-derive from the raw
> `api-traces/`, `screenshots/`, `axe-results.json`.

**Run:** 2026-07-20 · driven LIVE against `http://localhost:3002` as **P5 "Sam"**
(`user_qa_p5`, `plan:null` UNSUBSCRIBED, phone-first 390×844). One worker throughout
(`worker-proof.txt`). Secrets read from `process.env` via `--env-file=.env`, never
printed (auth secret masked first-7+last-4 in traces). No JS dialogs.

## Headline
**All five P5 baseline drivers CLOSED.** The write-first "no wall before editor"
promise now HOLDS for the unsubscribed segment. One residual (D-94) + two new
findings (D-92 env/honesty, D-93 minor a11y).

| Driver (baseline) | Verdict | Proving file |
|---|---|---|
| **D-08** no card-free path (S2, biggest P5 driver) | **CLOSED** | `api-traces/02-create-book-freetier.json` (201, was 403), `03c-type-words-autosave.json` (200), `screenshots/books-new-form_390x844_light.png` |
| **D-09** two `<main>` landmarks | **CLOSED (primary)** — residual → D-94 | `axe-results.json` (`mainCount:1`; duplicate-main + main-is-top-level gone) |
| **D-10** 8 unnamed settings buttons (CRITICAL) | **CLOSED** | `axe-results.json` (settings `namelessButtonCount:0`, no `button-name`) |
| **D-11** nav labels never translate | **CLOSED** | `locale-sweep.json` (fr = Accueil/Livres/Agent/Paramètres), `screenshots/books-list_..._locale-fr.png` |
| **D-12** Arabic fabricated success | **CLOSED (honest rejection)** | `04-lang-ar.json` — PATCH {ar} → **400** honest error |

## What the card-free on-ramp grants an unsubscribed writer (verbatim from the drive)
- **Create 1 book**, no card, no API key — `POST /api/books` → **201** (baseline 403).
  Onboarding step 1 leads with *"No credit card or API key required to start writing."*
  `/books/new` is a plain form + "Start writing", no upgrade wall.
- **Reach the editor** — blank Chapter 1 auto-created (`firstChapterId`).
- **Type + autosave, uncapped** — `PUT …/content` → 200, read-back → 200; **32 words
  persisted + counted**.
- **Export never capped**; **2nd book → 403** (Free cap = 1 book).
- Designed **metered Free AI allowance** (20 agent sessions/mo, 40k AI words, 100
  ghost-text + 50 inline-edit/day) — **but AI-assist currently 500s in this env → D-92.**

## Nuances
- **D-09:** duplicate `<main>` genuinely fixed (`(app)/layout.tsx` now mutually-exclusive
  `isMobile ? … : …`). 2 of the 4 axe rules the baseline bundled under D-09 still fire
  (`landmark-unique` on `header>nav`, `region` on `.text-center`) → **D-94** (S3 residual),
  so the re-run is not misread as a total landmark sweep.
- **D-12:** fix took the honest-rejection path, not localization — `UI_SUPPORTED_LANGUAGES`
  filters to the 7 codes with real dictionaries; route rejects `ar` with a plain-language
  400 ("…not yet available as an interface language… You can still write books in this
  language"). RTL (`dir`) still unimplemented but moot (`ar` no longer an accepted UI
  language; remains a valid per-book prose language).

## NEW findings (renumbered by team-lead — see defects.md ID-correction header)
- **D-92 (S2, was "D-62") — deploy drift + latent honesty bug.** `free_tier_usage` table
  MISSING in the running dev DB (a7402c1's `db:push` never applied here). Effects as Sam:
  `GET /api/billing/subscription` → **401** (route's blanket `catch{401}` masks a DB 500 as
  auth error), `POST …/ghost-text` + `…/inline-edit` → **500**. Two parts: (a) env — one
  migration fixes all three; (b) **latent code** — the 401-masks-500 strands a Free writer's
  billing page on a false "unauthorized" dead-end even in migrated prod. Blocks the D11
  "taste the AI moat before paywall" story in this env. Proof: `db-table-check.json`,
  `01-subscription-get.json`, `06-ghost-text-free.json`, `06-inline-edit-free.json`,
  `06-env-flags.json`.
- **D-93 (S3, was "D-63") — new axe violations:** `color-contrast` (serious) dashboard
  `.mt-2` (flaky between runs); `heading-order` (moderate) settings `<h3>` in the free-tier
  card. `axe-results-detail.json`.
- **D-94 (S3, was "D-64") — D-09 landmark residual** (the 2 persisting rules above).

## Hygiene
Worker = exactly 1 at capture + end (`worker-proof.txt`, `src/worker.ts` count=1; P5 enqueued
no jobs). Secrets never printed. State left: Sam owns 1 book (Free cap / on-ramp artifact);
`preferredLanguage` reset to `en`.
