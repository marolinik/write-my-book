# P5 Sam — Re-judge Defects (evidence-only, live-driven 2026-07-20)

> **TEAM-LEAD ID CORRECTION (2026-07-20):** the executor's local numbering
> collided with already-filed campaign IDs (D-62/D-63/D-64 are taken elsewhere —
> concurrent-agent numbering drift, the same class of collision noted in
> p4-priya/defects.md). Canonical IDs for this bundle's new findings, used in the
> aggregate + all downstream tracking: **D-62 → D-92**, **D-63 → D-93**,
> **D-64 → D-94**. The raw analysis below is unchanged; read every "D-62/63/64"
> here as "D-92/93/94".

Persona: **Sam**, weekend hobbyist, phone-first (390×844), zero-jargon tolerance,
seeded **UNSUBSCRIBED** (`plan: null`) as `user_qa_p5`. Live app
`http://localhost:3002`, pre-running dev server + single worker (not restarted).
Auth applied at the network layer: `x-e2e-test-secret` (value from
`process.env.E2E_TEST_SECRET`, never printed) + `x-e2e-clerk-id: user_qa_p5`.

Severity S-scale (campaign): S1 data-loss/overcharge/leak/bypass/crash · S2
journey-blocking/fabricated-output/false-positive · S3 friction · S4 cosmetic.

This bundle **re-verifies the five P5 baseline drivers** (D-08, D-09, D-10, D-11,
D-12) against the fixes that shipped since the baseline, and files what is still
open plus any NEW findings. All raw traces in `api-traces/`, screenshots in
`screenshots/`, harness scripts in `scripts/`.

---

## Baseline-driver re-verification (headline)

| ID | Baseline defect | Verdict | Proving file |
|----|-----------------|---------|--------------|
| D-08 | No card-free path to writing (unsubscribed hit 403 on book-create; trial needed a card) | **CLOSED** | `api-traces/02-create-book-freetier.json` (201), `03c-type-words-autosave.json` (200), `screenshots/books-new-form_390x844_light.png`, `screenshots/editor-freetier-book_390x844_light.png` |
| D-09 | Two `<main>` landmarks on every authenticated screen | **CLOSED (primary)** — with residual | `api-traces/axe-results.json` (`mainCount:1` all screens; `landmark-no-duplicate-main` + `landmark-main-is-top-level` gone). Residual: `landmark-unique` + `region` still fire — see D-64 below |
| D-10 | 8 icon-only buttons on `/settings` with no accessible name (`button-name`, critical) | **CLOSED** | `api-traces/axe-results.json` (settings: `namelessButtonCount:0`, no `button-name` violation) |
| D-11 | Mobile bottom-nav labels never translated in any locale | **CLOSED** | `api-traces/locale-sweep.json` (fr nav = `["Accueil","Livres","Agent","Paramètres"]`), `screenshots/books-list_390x844_light_locale-fr.png` |
| D-12 | Arabic silently fell back to 100% English but `PATCH …/language` returned fake 200 | **CLOSED (via honest rejection)** | `api-traces/04-lang-ar.json` (`ar` → **400** honest error), `src/app/api/settings/language/route.ts` L34-46. RTL still not implemented but now moot (ar is not an accepted UI language) |

---

## D-08 — CLOSED. Card-free on-ramp verified end-to-end (was PRODUCT-DECISION/GTM gate)

Baseline: an unsubscribed/card-less writer had **no** path to writing — `POST
/api/books` returned 403 "Upgrade Required," and the "free trial" required a card
(`trial_settings.missing_payment_method:"cancel"`). The write-first / W11 promise
("no wall before editor") did not hold for this segment.

**Now (commit a7402c1 "card-free Free tier"), driven live as unsubscribed Sam:**

- `POST /api/books` `{name,genre}` → **201 Created** (was 403). Returns the book
  + `firstChapterId` (a blank Chapter 1 pre-created for write-first landing).
  Raw: `api-traces/02-create-book-freetier.json`. Book id
  `35ff1112-52af-4001-a0f4-ec83f4dad9b0`.
- `PUT /api/books/:id/chapters/:chapterId/content` (type words + autosave) →
  **200**; `GET …/content` read-back → **200** with the same prose. Raw:
  `03c-type-words-autosave.json`, `03d-read-back-content.json`.
- Book now owned + listed; word count **32** persisted and counted. Visual:
  `screenshots/editor-freetier-book_390x844_light.png` (Word Count 32),
  `screenshots/books-list_390x844_light_locale-fr.png` ("1 livre · 32 words ·
  Continue → Ch 1").
- The `/books/new` form is now the on-ramp itself — a plain "New Book" form with a
  **"Start writing"** button and **no upgrade wall**
  (`screenshots/books-new-form_390x844_light.png`), the very screen that showed a
  403 upgrade modal in the baseline.
- Onboarding step 1 states, verbatim: **"No credit card or API key required to
  start writing."** (`screenshots/onboarding-wizard_390x844_light.png`). The
  "Skip for now — start writing free" button is on the later provider step and
  routes to `/books/new?onboarding=1` (source `onboarding-wizard.tsx` L111-114,
  L255).

**What the card-free on-ramp grants an unsubscribed writer (verbatim from what was
driven / derived from `FREE_TIER` + `plan-gating.ts` + `free-tier.ts`):**
- **1 book** (`FREE_TIER.maxBooks`; a 2nd → 403). Verified: 1 created successfully.
- **Typing, autosave, versions, export — NEVER capped** (never routed through the
  gate). Verified: autosave 200 + read-back 200.
- Metered AI (per the derived Free tier): 20 agent sessions/month, 40k
  AI-eligible words, 100 ghost-text + 50 inline-edit/day — **but these are
  currently 500-ing in this environment, see D-62.**
- No card and no API key required to reach the editor and write. Verified.

**Verdict: the write-first / "no wall before editor" promise now HOLDS for the
unsubscribed segment.** The core on-ramp (create → write → save → persist) is real
and works. The AI-assist portion of the Free grant is currently broken in this env
(D-62), which blocks the "experience AI value before paywall" (D11) story.

---

## D-62 (NEW, S2) — Free-tier `free_tier_usage` table absent in running env → billing page 401 + AI-assist 500 for every Free user; the 401 masks a 500

> Provisional campaign ID D-62 (per memory index "next free ID"); coordinate with
> the shared register before final numbering.

**Root cause (confirmed):** the deploy gate from commit a7402c1 —
`npm run db:push` (dev) to create the additive `FreeTierUsage` table — has **not
been applied to the running dev DB** (`localhost:5432/writemybook`). Direct
`information_schema` probe: table `free_tier_usage` is **absent** while
`books`/`chapters`/`subscriptions`/`users` are present. Raw:
`api-traces/db-table-check.json` (script `scripts/db-table-check.mjs`, DATABASE_URL
read from env, never printed). The commit itself warned: *"the subscription GET,
ghost-text, and inline-edit routes reference db.freeTierUsage, so code-before-push
breaks the billing page + free ghost/inline."*

**Observable live failures (all as unsubscribed Sam, same headers that return
200/201 elsewhere in the same run):**

1. `GET /api/billing/subscription` → **401 "Unauthorized"**. Raw:
   `api-traces/01-subscription-get.json`. This is the billing/upgrade page's data
   source and the destination of the paywall "View Plans" CTA. The route computes
   `free = isFreeTier(sub)` (true for Sam) then `await getFreeTierSnapshot(userId)`
   → `db.freeTierUsage.findUnique` → **throws** (missing table) →
   `catch { return 401 }` (`src/app/api/billing/subscription/route.ts` L104,
   L121-123; snapshot at `src/lib/billing/free-tier-meters.ts` L188-195).
2. `POST /api/books/:id/ghost-text` → **500 "Failed to generate suggestion"**.
   Raw: `api-traces/06-ghost-text-free.json`. `checkQuota(user,"ghost_text")` →
   `checkDailyMeter` → `db.freeTierUsage.findUnique` (no try/catch, meters L131-137)
   → throws before any LLM call → route catch → 500 (`ghost-text/route.ts` L33,
   L173-177).
3. `POST /api/books/:id/inline-edit` → **500**. Raw:
   `api-traces/06-inline-edit-free.json`. Same chain.

Env confirmed relevant: `STRIPE_SECRET_KEY` **is set** (booleans only in
`api-traces/06-env-flags.json`), so `isFreeTierUser()` returns true and the Free
meter path is active; `FREE_TIER_DISABLED` unset. (The billing-page 401 is
unconditional regardless of Stripe, because the subscription route uses the
*unguarded* pure `isFreeTier`.)

**Two-part severity:**
- **(a) ENV / deploy (primary):** running `npm run db:push` on this DB fixes all
  three. Until then, three Free-tier surfaces are down for the exact persona the
  on-ramp targets.
- **(b) LATENT CODE (independent of env):** the subscription route's blanket
  `catch { return 401 "Unauthorized" }` mislabels a 500 DB/server error as an auth
  failure. Even in a correctly-migrated prod, any future throw inside the free-tier
  snapshot would silently present the writer's billing page as "unauthorized"
  (dead-end, no honest error), instead of a 500. This masking is a real code smell.

**Severity guess: S2** — journey-blocking for the money-path (billing/upgrade page)
and for the D11 "experience AI value before paywall" story (free AI-assist down);
the core write on-ramp is unaffected and a single migration resolves the env part.
Recorded RAW as observed in the live environment; the deploy-vs-code split is left
for the judges.

---

## D-63 (NEW, S3) — New axe violations vs P5 baseline: `color-contrast` (dashboard) and `heading-order` (settings)

The P5 baseline explicitly recorded "no axe `color-contrast` rule fired on any
scanned screen" and did not list `heading-order`. The re-run (same
`@axe-core/playwright` 4.11.3 at 390×844, tags wcag2a/wcag2aa/best-practice) now
finds:

- **`color-contrast` (serious, 1 node)** on `/dashboard` → target `.mt-2`. Raw:
  `api-traces/axe-results-detail.json`. Flaky between the two runs (fired on
  `/books` in the first run, only `/dashboard` in the detail run) — likely a
  transient/low-contrast muted-text element; needs the exact element pinned.
- **`heading-order` (moderate, 1 node)** on `/settings` → an `<h3>` inside the
  dashed free-tier card (`.border-dashed…rounded-lg …> h3`) that skips a level.
  Raw: `api-traces/axe-results-detail.json`. Plausibly introduced by a new
  free-tier upsell card (commit eaa655d also tracks a "heading order" item D-53).

**Severity guess: S3** (friction, not blocking; phone-first a11y polish).

---

## D-64 (NEW/RESIDUAL, S3) — Two of the four original D-09 landmark axe rules persist after the duplicate-`<main>` fix

The D-09 fix collapsed the duplicate `<main>` (now `mainCount:1` on every screen;
`landmark-no-duplicate-main` and `landmark-main-is-top-level` are gone). But the
baseline D-09 bundled **four** axe rules, and **two still fire on every
authenticated screen**:

- **`landmark-unique` (moderate)** → `header > nav`. Multiple `<nav>` landmarks
  (header nav, sidebar nav, mobile bottom nav) without distinct accessible names,
  so they are not uniquely identifiable to assistive tech.
- **`region` (moderate)** → `.text-center`. Some page content sits outside any
  landmark region.

Raw: `api-traces/axe-results.json` + `axe-results-detail.json`. Consistent across
books-list, dashboard, settings, books-new-form.

**Severity guess: S3.** The headline D-09 defect (duplicate main) is genuinely
fixed; this is the milder remainder of the same landmark cluster. Filing so the
re-run is not misread as a total landmark-clean sweep.

---

## Explicitly NOT filed (documented so judges don't misread evidence)

- **`net::ERR_NAME_NOT_RESOLVED` for `clerk.example.test/…clerk.browser.js`** —
  known-benign fake Clerk test domain, appears on every page. Not a defect. (Also
  the source of the Next dev-overlay "2 Issues" badge visible bottom-left in some
  screenshots — that is the Next.js dev indicator counting console errors, not a
  product UI element.)
- **EXPIRED-subscriber read/export probe — NOT-TESTABLE.** No persona is seeded in
  a lapsed/expired state (`scripts/qa-seed-personas.ts` hardcodes `status:'active'`
  for every non-null plan; Sam/Rita are "never subscribed," not "lapsed"). Per the
  no-mutation constraint, not manufactured. Recorded NOT-TESTABLE, not guessed.
- **"CURRENTLY WRITING (1)" shelf heading + "32 words · drafted 0/1 · last touched
  today" stay English under `fr`** (`screenshots/books-list_390x844_light_locale-fr.png`).
  A minor partial-i18n gap on the books-list shelf strings, but OUTSIDE the D-11
  (nav labels) / D-12 (Arabic) scope that this re-judge re-verifies — noted, not
  re-filed as a new defect.
- **Product name renders "Write My Book OK"** on onboarding step 1 and the
  onboarding success toast (`onboarding-wizard.tsx` L116). Pre-existing naming
  artifact seen in the baseline too; not introduced by these fixes, out of scope.
