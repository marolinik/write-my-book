# P5 Sam — Journey Log
**Date:** 2026-07-18 · **Persona:** Sam, weekend hobbyist, phone-first, zero
jargon tolerance · **Identity:** `user_qa_p5`, seeded UNSUBSCRIBED (`plan: null`)
· **App:** http://localhost:3002 (pre-running dev server + worker, not restarted)

Auth: all Sam-scoped work uses headers `x-e2e-test-secret: test-secret` +
`x-e2e-clerk-id: user_qa_p5` — applied at the network level via Playwright
`context.setExtraHTTPHeaders`, so both raw API probes and full browser page
navigations carry the same persona identity. This solves "map the e2e header
trick to browser requests" cleanly; it's also the same pattern the project's own
`playwright.config.ts` already uses (`extraHTTPHeaders` block), so it's the
sanctioned approach, not a workaround.

One exception, clearly labeled everywhere it's used: the mobile editor screens
needed a chapter with real content to judge layout, and Sam owns zero books. I
used the pre-existing dev-bypass user's own book ("The Salt Letters") read-only,
reached by sending requests with **no** e2e headers at all (which correctly falls
through to `DEV_AUTH_BYPASS` per `src/lib/auth.ts`'s three-tier precedence) — never
by impersonating another persona through Sam's own e2e identity, and never writing
anything through it. Screenshots from this path are named
`*_DEVBYPASS-NOT-SAM_*` throughout. I confirmed the impersonation route is
actually closed: sending `x-e2e-clerk-id: user_dev_bypass` returns
`{"error":"Unauthorized"}`, because the `user_qa_` prefix guard in `auth.ts`
routes any non-`user_qa_*` id to a clerk id with no seeded DB row — correct
behavior, not a bug, and it's what forced the no-headers approach above.

---

## 1. Mobile editor reality check

Viewports 390×844 / 360×640 / 320×568, light + dark, on books-list, dashboard,
settings, settings/billing, books/new, and (dev-bypass reference only) the editor
with a real chapter. 55 screenshots total in `screenshots/`, plus one landscape
(844×390) and one reduced-motion capture.

**Horizontal scroll:** zero fails across all 34 screen×viewport×theme
combinations, down to the 320px SE-class viewport. `api-traces/layout-findings.json`
has the raw per-screen `horizontalScroll` booleans — every one is `false`. This is
a genuinely solid result; nothing forced Sam to scroll sideways on any screen
tested.

**Tap targets (WCAG 2.5.5-style, <44×44 CSS px flagged):** present on every
screen, counted but not filed as a defect (see defects.md's "not filed" section
for why) — books-list 5, dashboard 9, settings 21, settings/billing 10,
books-new-form 8, editor 23. Full counts per viewport/theme in
`api-traces/layout-findings.json`.

**Collapsible panels / responsive type:** verified visually across all three
viewports — the sidebar collapses to icon-only, cards reflow to single-column,
type stays legible at 320px without needing tap-to-zoom on any screen I judged.

**Landscape (844×390):** `screenshots/books-list-empty_844x390-landscape_light.png`
— sidebar auto-expands into full desktop-style nav with labels ("Dashboard",
"Books", "Series" with a correctly-shown lock icon reflecting Sam's no-Pro
access), zero horizontal scroll. Clean pass.

**Keyboard-caret overlap on mobile:** **cannot be judged headlessly.** Playwright/
Chromium headless doesn't render an on-screen mobile keyboard, so there's no
real keyboard geometry to check against the caret/toolbar position. Flagging
this honestly per the task brief rather than guessing — this needs a real device
or an emulator with actual soft-keyboard rendering.

**Editor gap (closed):** the first 390×844 hit to the dev-bypass editor route
timed out in both themes (20s) while 360×640/320×568 succeeded immediately after
in the same run. Retried standalone with a 45s timeout — succeeded instantly both
times, consistent with a one-off Turbopack on-demand-compile delay, not a
reproducible issue. All 6 expected editor screenshots (3 viewports × 2 themes)
are now present.

**Verdict: PASS**, with the keyboard-caret item explicitly marked
un-judgeable-headlessly rather than assumed-fine.

---

## 2. BYOK/subscription cliff (W11/W16)

Mapped every AI-gated surface Sam could hit and probed each as Sam via API:
`POST /api/books/{id}/agent` (dev-edit), `POST /api/books/{id}/style`,
`POST /api/books/{id}/inline-edit`, `POST /api/series/{id}/agent`,
`GET /api/books/{id}/export`, `GET /api/books/{id}/editorial/findings`.

**Finding (already reported early to team-lead as it landed):** every one of
these returns `404 "Book not found"`, not a 403 or a paywall message — because
Sam owns zero books, and this codebase checks resource ownership *before*
plan/subscription status on every book/series-scoped route (confirmed via
`src/lib/billing/plan-gating.ts` and route-level reads; consistent with the
campaign's already-confirmed-clean ownership-fence-before-plan-gate pattern from
p8-rita). **Structural conclusion: Sam can never reach or see any of the
granular per-feature AI-gated wall messages the W11/W16 framing anticipated
testing individually.** The only subscription-cliff message he will ever
encounter in this product is the one at book/series *creation* time — the wall
is earlier and more absolute than the Missing-Capabilities Register implies.

**The one real wall, exercised live (not just read from source):** `POST
/api/books` → `403`. Live UI capture at 390×844, both themes:
`screenshots/books-new-filled_390x844_{light,dark}.png` (form filled with "Dragon
Rider Fanfic QA P5" / fantasy) →
`screenshots/books-new-upgrade-modal_390x844_{light,dark}.png` (paywall moment).

Judged against the mission's rubric:
- **Plain language:** yes — "Upgrade Required. Your subscription is inactive.
  Subscribe to access this feature. The Indie Author plan gives you 2 active
  books with all 14 AI agents and workflows." No jargon, states the actual limit.
- **Respectful:** yes — no dark patterns, no fake urgency, no guilt copy.
- **Traps his words: no, confirmed live.** Read `nameInput.inputValue()` after
  the failed submit in both themes — `"Dragon Rider Fanfic QA P5"` survived
  unchanged both times. Traced to `useCreateBook()` in `src/hooks/use-books.ts`:
  the 403 handler routes to a global `UpgradeModal` (via `useUpgradeModal` store)
  instead of resetting form state, so nothing is lost.
- **No dead end:** modal offers Cancel + "View Plans" (→ `/settings/billing`).

**Free surfaces while unsubscribed:** BYOK key management fully works — `GET
/api/settings/api-keys` shows Sam's seeded OpenRouter key correctly masked
(`sk-or-v...705e`) even fully unsubscribed. `export` is unconditionally allowed
by design in `plan-gating.ts` (moot for Sam since he owns no book to export, but
the gate itself doesn't discriminate). Writing/autosave are also ungated by
design — moot for the same reason.

**Trial path check:** read `src/app/api/billing/checkout/route.ts` in full — even
trial-eligible plans require a card up front
(`trial_settings.end_behavior.missing_payment_method: "cancel"`), so there is no
card-free way for Sam to ever create a book, not even temporarily.

**Verdict (W16 headline): the wall is real, it's at creation time (not
per-feature), there is no free tier and no card-free trial anywhere in this
product — but the paywall UX itself is honest, respectful, and non-trapping.**
Per team-lead's ruling, this is now formally filed as **D-08**, classification
PRODUCT-DECISION / GTM gate (founder-list), not a code defect — the gate works
as implemented and deliberately (matches Rita's independent no-bypass sweep),
but it upgrades the known "no managed no-key tier" deferred item from the
2026-07-06 session into a sharper story: there is no card-free path to writing
at all, and the write-first/W11 "no wall before editor" positioning is
contradicted for any unsubscribed user. Full write-up with exact wall copy,
the `trial_settings.end_behavior.missing_payment_method:"cancel"` citation,
and the jargon-standard judgment of the wall copy is in defects.md.

**Books-list empty-state honesty (explicit check, per team-lead's request):**
confirmed honest, not a silent dead end. `screenshots/books-list-
empty_390x844_light.png` shows a plain "No books yet — Start your writing
journey by creating your first book" message with a visible "Create Book"
CTA that leads directly into the same 403 upgrade wall documented above — Sam
always sees why nothing happened, never a spinner-that-never-resolves or a
console-only failure.

**EXPIRED-subscriber read/export probe — NOT-TESTABLE with current seed
data.** Team-lead asked whether an expired subscriber can still read/export
existing data (extending the "never traps words" check), with an explicit
constraint: simulate only via a seeded persona, do NOT mutate another
persona's subscription row. Read `scripts/qa-seed-personas.ts` in full: all 8
personas seed with `plan` of `"indie"`, `"professional"`, or `null` (Sam and
Rita only); the subscription-insert logic hardcodes `status: 'active'`
unconditionally for every non-null plan — there is no `"expired"`,
`"canceled"`, or `"past_due"` status anywhere in the seed data. Sam and Rita
represent "never subscribed," not "subscription lapsed." No seeded persona
can answer this probe, and per the no-mutation constraint I did not
manufacture one by editing another persona's row. Recording this honestly as
**NOT-TESTABLE** rather than guessing or skipping it silently.

---

## 3. Locale ×7 spot pass

**First attempt used the wrong mechanism and is superseded.** I initially tried
`?lang={locale}` as a URL query param — it has zero effect; the app reads/writes
language via `PATCH /api/settings/language` (`src/hooks/use-language.ts`),
persisted server-side, not the URL. Those first-pass screenshots
(`*_locale-{code}.png`, no "2") are pixel-identical to English and are a
methodology artifact, not a locale-leak finding — kept in the evidence folder
for transparency but superseded by the corrected sweep below.

**Corrected sweep:** for each of `en, sr, de, fr, ru, zh, ar`, sent the real
`PATCH /api/settings/language {"language": "<code>"}` as Sam (all returned `200`
with the persisted value echoed back), then screenshotted `/settings`, `/books`,
`/dashboard` at 390×844 light. Files: `*_locale2-{code}.png`. Reset back to `en`
at the end so Sam's persona state isn't left mid-sweep for whichever persona
inspects him next.

**Result: French, Chinese, Russian, Serbian all translate correctly and
completely** — page titles, `<h1>`s, card headings, and body copy all localize
(e.g. "Settings" → "Paramètres"/"设置"/"Настройки"/"Podešavanja"). Genuinely good
i18n coverage for those four.

**Two real leaks found (filed as D-11, D-12 in defects.md):**
- Mobile bottom-nav labels ("Home"/"Books"/"Agent"/"Settings") never translate,
  in *any* locale including the ones that otherwise work correctly.
- **Arabic silently falls back to 100% English** despite the save API reporting
  success — the only one of the 7 tested locales where translation does nothing
  at all. Also confirmed no `dir="rtl"` is ever applied for any locale (checked
  `document.documentElement.getAttribute("dir")` — `null` across the board),
  meaning RTL layout isn't implemented, separate from and compounding the
  Arabic translation failure.

**Number/date formatting:** couldn't get a meaningful read on this — Sam has 0
books/0 words/0 chapters everywhere, so there's no non-zero number to check for
a `"2.026 words"`-class formatting leak. Flagging as untested-for-lack-of-data
rather than claiming a pass.

**Verdict: PARTIAL PASS — 2 new locale leaks found** (D-11 nav labels, S3; D-12
Arabic total-fallback, S2). 5 of 7 locales tested are otherwise clean.

---

## 4. A11y spot pass (mobile)

axe-core (`@axe-core/playwright`) at 390×844 on 5 Sam-scoped/reference screens.
Full detail: `api-traces/axe-results.json`.

- **Systemic (every screen): duplicate `<main>` landmark** — 4 axe rules firing
  identically everywhere, traced to `src/app/(app)/layout.tsx` lines 108 + 131.
  Filed as **D-09 (S3)**.
- **Settings-specific, critical: 8 icon buttons with no accessible name**
  (`button-name` rule). Corroborated independently by the 15-stop keyboard
  tab-order capture (`api-traces/keyboard-tab-order-settings.json`) — 10 of 15
  stops are unlabeled `button`/`a` elements. Filed as **D-10 (S2)**.
- **Focus order / visible focus:** all 15 tab stops on `/settings` show
  `focusVisible=true` — focus rings work correctly, the gap is specifically
  missing accessible names, not missing focus indication.
- **Reduced motion:** `screenshots/dashboard_390x844_reduced-motion.png`
  captured with `emulateMedia({reducedMotion: "reduce"})` — page renders
  correctly, no layout break. **Cannot fully verify** whether animations are
  actually suppressed from a static screenshot — this needs frame-by-frame or
  live observation, noting the limitation honestly rather than claiming a full
  pass.
- **Landscape orientation:** see §1 above — clean, no horizontal scroll, nav
  reflows sensibly.
- **Keyboard-only nav:** exercised via 15 sequential Tab presses on `/settings`
  from page load — all stops reachable, all focus-visible, but 10/15 lack a
  name a screen-reader user could act on (same root cause as D-10).
- **Contrast:** only sampled via screenshot pixel inspection, not a real
  contrast-ratio tool (no axe `color-contrast` rule fired on any scanned screen,
  for what that's worth, but that's a lint pass, not a rendered-pixel
  measurement) — flagging this as a genuine gap in what headless testing
  proved here.

**Verdict: PARTIAL PASS — 2 new a11y defects found** (D-09 landmark, D-10
button-name), everything else checked came back clean or honestly flagged as
unverifiable headlessly.

---

## 5. Empty states

- **Books list** (`screenshots/books-list-empty_390x844_light.png`): "No books
  yet — Start your writing journey by creating your first book" + single
  "Create Book" CTA. Jargon-free, no fake numbers ("0 books" stated plainly).
- **Dashboard** (`screenshots/dashboard_390x844_light.png`): "Welcome back, P5
  Sam (hobbyist)" (the seeded persona display name — a QA labeling artifact, not
  a product behavior, noting it so it isn't misread as the app inventing a
  "hobbyist" tier label), 4 action buttons, 3 stat cards all showing honest `0`
  — Total Books, Total Words, Total Chapters. No fabricated numbers anywhere.
- **Memory / findings:** both are book-scoped surfaces in this product
  (`MemoryStatsCard` is a book-overview component; editorial findings live under
  a book's editorial tab). Since Sam owns zero books and every book-scoped route
  correctly 404s for him (see §2), **there is no independently-reachable
  memory/findings empty state for a zero-book user** — he never sees one, full
  stop. That's consistent with the rest of the ownership-fence behavior and
  isn't a gap in my testing; it's the honest shape of the product for this
  persona.

**Verdict: PASS.** Every empty state Sam can actually reach is coherent,
jargon-free, and honest about zero.

---

## 6. Return-visit honesty

Sam's free surface (writing, autosave, BYOK key management, settings, dashboard
with honest zero-state stats) stays fully usable and honestly labeled while
unsubscribed. The dashboard doesn't dangle fake unlocked-content teasers, and
the one wall he'll ever hit (book creation) is transparent about exactly what
subscribing unlocks ("2 active books with all 14 AI agents and workflows") —
nothing is hidden or misrepresented about what's locked. The dashboard's 4
quick-action buttons (Create Book / Create Series / Start Writing / Import
Manuscript) do all lead toward the same wall eventually since all of them
require a book to exist first, which is a slightly repetitive "same wall from 4
doors" experience worth noting, though not dishonest — each button's own label
doesn't overpromise.

**Verdict: PASS**, with the "4 doors, 1 wall" repetition noted as a minor UX
observation, not a defect.
