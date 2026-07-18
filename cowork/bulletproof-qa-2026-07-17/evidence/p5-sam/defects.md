# P5 Sam — Defects (evidence-only)

Persona: Sam, weekend hobbyist, phone-first, zero jargon tolerance, seeded
UNSUBSCRIBED (`plan: null`) as `user_qa_p5`. Severity uses the campaign S-scale
(S1 data-loss/overcharge/leak/bypass/crash > S2 journey-blocking/fabricated-output/
false-positive > S3 friction > S4 cosmetic).

> Campaign register at time of filing: D-01 malformed JSON→500 (P8), D-03 export
> body-swap (P2, S1), D-04 discuss empty-reply (P1, S2), D-05 pdf export missing
> metadata title (P7, S3), D-06 checkout double-subscribe risk (W6/Gerald, S1),
> D-07 dunning UI absent (W6/Gerald, S2). Checked `p1-maya/defects.md` and
> `p8-rita/defects.md` for prior a11y/locale filings first (grep for
> `landmark`/`button-name`/`axe` — only false-positive substring hits on
> "SyntaxError"/"case", nothing filed). **Register correction (per team-lead):**
> this doc originally numbered its four a11y/locale findings D-08..D-11, filed
> before Gerald's W6 sweep landed and independently claimed D-06/D-07. Renumbered
> below to D-09..D-12, freeing D-08 for the founder-gate/no-free-path finding
> (new, formally filed below — classification PRODUCT-DECISION, not a code bug).

---

## D-08 (classification: PRODUCT-DECISION / GTM gate — founder-list, not a code defect) — No card-free path to writing exists; write-first positioning is contradicted for unsubscribed users

**What this is and isn't:** the gate itself works as implemented and, per
Rita's (P8) independent no-bypass sweep, deliberately — every book/series-create
route correctly 403s an unsubscribed user with no ownership-fence bypass, no
leaked internal detail, no trapped input. This is **not** a new code bug. It is
a severity-story upgrade to an already-known deferred founder move: the
2026-07-06 session already flagged "no managed no-key tier" as the single
biggest grade-lifter left on the roadmap. Sam's sweep shows the gap is wider
than that framing implies — there is no card-free path to writing **at all**,
not just no managed-AI tier.

**Evidence — the wall, verbatim:**

Modal (`POST /api/books` as `user_qa_p5`, unsubscribed, `plan: null`):
```
Upgrade Required [X]
Your subscription is inactive. Subscribe to access this feature.
The Indie Author plan gives you 2 active books with all 14 AI agents and workflows.
[Cancel] [View Plans]
```
Toast (same action): `Your subscription is inactive. Subscribe to access this feature.`
Screenshots: `screenshots/books-new-form_390x844_light.png` (form itself renders
fine, unsubscribed and all — the block happens on submit, not on page load).

**Evidence — trial requires a card, so there is no zero-cost on-ramp either:**

`src/app/api/billing/checkout/route.ts` lines 128-137 configure Stripe trial
subscriptions with
```
trial_settings: { end_behavior: { missing_payment_method: "cancel" } }
```
i.e. Stripe will not even start the trial period without a payment method on
file — "start a free trial" still means "enter a card first." There is no
route, UI surface, or documented flow in this campaign's TEST-PLAN that lets a
key-less, card-less writer create a book, a series, or reach the editor at
all. The TEST-PLAN's assumption of a free/write-first path (W11 funnel: "no
wall before editor") does not hold for this persona segment.

**Judgment against Sam's zero-jargon-tolerance bar:** the wall copy itself
passes. "Upgrade Required," "Your subscription is inactive," "Subscribe to
access this feature" are plain sentences, no error codes, no dev-facing
language surfaced to the user. It also does the one thing Sam's standard
requires most: it tells him what subscribing buys him ("2 active books with
all 14 AI agents and workflows") instead of a bare "access denied." It does
**not** explain there's no free alternative — the copy reads as if upgrading
is simply the next step, not as if it's the *only* step, which is the softer
form of the same finding: honest about the paywall, silent about the absence
of any non-paywalled path.

**Books-list empty-state check (explicit answer to "does it show the wall
honestly or dead-end silently"):** honest, not silent. `screenshots/books-
list-empty_390x844_light.png` shows a plain empty state — "No books yet —
Start your writing journey by creating your first book" — with a visible
"Create Book" CTA. That CTA leads straight into the same 403 wall above; it
is not a dead click, not a spinner-that-never-resolves, not a console-only
failure. Sam sees exactly why nothing happened.

**Severity note:** the gate-works-as-designed part is not scored. The
positioning-mismatch part (write-first marketing promise vs. actual
unsubscribed-user reality; TEST-PLAN assumed a free path that doesn't exist)
is flagged **S2** — not a crash or leak, but journey-blocking in the specific
sense that it sets an expectation the product cannot honor for this entire
persona segment (any hobbyist without a card, which is most of Sam's cohort).

**Suggested fix (evidence-gathering only, not applied; founder decision, not
QA's to make):** either ship the managed no-key tier already deferred from
2026-07-06, or correct the write-first/W11 marketing claim and TEST-PLAN
assumption to state plainly that book creation requires an active card-backed
subscription from the first click.

---

## D-09 (S3) — Two `<main>` landmarks on every authenticated screen, confusing screen-reader/assistive-tech navigation

**Root cause:** `src/app/(app)/layout.tsx` renders two separate `<main>` elements
(one nested inside the other's containing landmark) — lines 108 and 131:

```
108:  <main className="flex-1 overflow-y-auto pb-14">{children}</main>
131:  <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
```

**Evidence:** axe-core scan (`@axe-core/playwright`) at 390×844, Sam-scoped, on
5 screens — every single one flags the same 4 landmark rules:
`landmark-main-is-top-level`, `landmark-no-duplicate-main`, `landmark-unique`,
`region` (all `moderate` impact). Raw output: `api-traces/axe-results.json`.

| Screen | Violations |
|---|---|
| books-list-empty | 5 (incl. this cluster) |
| dashboard | 4 |
| settings | 6 (incl. D-10 below) |
| books-new-form | 5 |
| editor (dev-bypass reference, not Sam-owned) | 4 |

**Impact:** Screen-reader users navigating by landmark ("jump to main content")
get two ambiguous targets on every page in the app. Content is still reachable
by other means (heading nav, tab order), so this is friction, not a block —
hence S3, not S2.

**Suggested fix (evidence-gathering only, not applied):** collapse to a single
`<main>` in `(app)/layout.tsx`; the two are almost certainly a duplicate-wrapper
artifact from a past layout refactor rather than intentional.

---

## D-10 (S2) — 8 icon-only buttons on `/settings` have no accessible name (axe `button-name`, critical)

**Evidence:** Same axe scan, `settings` screen, one `critical`-impact violation:
`button-name (critical): 8 node(s) — Buttons must have discernible text`. Full
detail in `api-traces/axe-results.json`.

Corroborated independently by the keyboard tab-order capture
(`api-traces/keyboard-tab-order-settings.json`, 15 Tab presses from page load):
10 of the 15 focus stops are bare `button` or `a` elements with **no** `id` and
**no** `aria-label` recorded (vs. 3 stops that do carry a label, e.g.
`button[aria-label="Toggle sidebar"]`). Every stop shows `focusVisible=true`, so
focus rings work — the gap is specifically the missing accessible name, not
missing focus indication.

**Impact:** A screen-reader or switch-control user tabbing through `/settings`
hits 8 controls announced only as "button" with no indication of what they do
(likely per-provider icon actions inside the `ApiKeysSection`/`ModelSelectionSection`
cards — "Get key" external-link icons, provider logos used as buttons, etc., based
on the visual layout in `screenshots/settings_390x844_light.png`). That's a real
task-blocker for that user segment on a page whose entire job is configuring BYOK
keys — hence S2, not S3.

**Suggested fix (evidence-gathering only, not applied):** add `aria-label` to each
icon-only button in `components/settings/api-keys-section.tsx` and
`model-selection-section.tsx` (not inspected line-by-line here — flagged at the
page level via axe + tab-order cross-check, not traced to exact JSX).

---

## D-11 (S3) — Mobile bottom nav labels never translate in any non-English locale

**Evidence:** Corrected locale sweep (real mechanism — `PATCH /api/settings/language`,
not a URL query param; see note in journey-log) across `en, sr, de, fr, ru, zh, ar`,
390×844, `/settings` + `/books` + `/dashboard`. Screenshots:
`screenshots/{settings,books-list,dashboard}_390x844_light_locale2-{locale}.png`.

In every locale that *does* translate (fr, zh, ru, sr all correctly localize page
titles, card headings, and body copy — e.g. `Paramètres`/`设置`/`Настройки`/`Podešavanja`
for "Settings"), the `MobileBottomNav` labels stay hard-coded English: **"Home",
"Books", "Agent", "Settings"** are visible, untranslated, at the bottom of every
screenshot regardless of active locale.

**Impact:** Cosmetic/consistency gap, not a block — the four nav destinations are
icon + label, and icons alone are enough to navigate. But it undercuts the
otherwise-solid i18n effort and looks unfinished for any non-English user on the
one nav surface a phone-first persona like Sam uses constantly.

---

## D-12 (S2) — Arabic locale silently falls back to 100% English despite the save API reporting success

**Evidence:** Same corrected locale sweep. `PATCH /api/settings/language {"language":"ar"}`
returns **`200 {"language":"ar"}`** — the same success shape as every other locale
tested. But the subsequent page render shows **zero translated strings**: page
title, `<h1>`, card headings, body copy, and section titles all render in English,
identical byte-for-byte to the `en` screenshots. Compare
`screenshots/settings_390x844_light_locale2-ar.png` (still says "Settings", "Manage
your API keys and preferences", "API Keys") against `...-fr.png` / `...-zh.png` /
`...-ru.png` / `...-sr.png`, which all correctly localize the same strings.

Also confirmed no `dir="rtl"` is ever applied to `<html>` for any locale
(`document.documentElement.getAttribute("dir")` → `null` for all 7 locales tested,
including Arabic) — grepped `src/components/providers/language-provider.tsx` and
`src/app/layout.tsx` for `dir=`/`rtl`: zero matches. RTL layout is simply not
implemented, which is a separate (unfiled, lower-priority) gap from the outright
translation failure — Arabic is the only one of the 7 tested locales where the
*translation itself* silently does nothing.

**Impact:** The API contract lies — it claims success and persists `language: "ar"`
(confirmed via the same 200 body on every call), but the promised behavior (a
localized UI) never happens for that language. A real Arabic-speaking user gets an
English app with no error, no warning, nothing to act on — classic false-positive/
fabricated-success pattern, hence S2 not S3. Most likely root cause (not traced to
exact file): the `ar` entry is either missing from the UI-strings dictionary or the
loader for it throws and is being silently caught with an English fallback — worth
a targeted look at `src/lib/i18n/` for whichever mechanism resolves `SUPPORTED_LANGUAGES`
codes to actual string bundles.

---

## Explicitly NOT filed as defects (documented so judges don't misread the evidence)

- **`net::ERR_NAME_NOT_RESOLVED` console errors on every screen** — all trace to
  `https://clerk.example.test/...clerk.browser.js`, a fake/placeholder Clerk test
  domain baked into this dev/e2e environment that cannot resolve via DNS here. This
  is a benign environment artifact, not a product defect. It appears on all ~38
  screenshotted page loads and should not be read as 38 broken screens.
- **One hydration-mismatch console warning** on `books-new-form` at 320×568/light
  only (not reproduced at any other viewport/theme combo for the same screen) —
  looked like a one-off dev-mode Turbopack timing artifact, not chased further given
  it didn't reproduce.
- **390×844 dev-bypass editor screenshot timeout (first hit)** — the very first
  navigation to the editor route at 390×844 timed out at 20s in both themes while
  360×640/320×568 (captured immediately after) succeeded cleanly. Retried alone with
  a 45s timeout and it succeeded instantly both times — consistent with a one-off
  Turbopack on-demand-compile delay for that dynamic route on first hit within the
  script run, not a reproducible product issue. Full 390×844 editor screenshots now
  captured (`screenshots/editor-with-content_DEVBYPASS-NOT-SAM_390x844_{light,dark}.png`).
- **EXPIRED-subscriber read/export probe — NOT-TESTABLE, not skipped.** Team-lead
  asked whether an expired subscriber can still read/export existing data. Read
  `scripts/qa-seed-personas.ts` in full: every seeded persona's `plan` is
  `"indie"`, `"professional"`, or `null` (Sam and Rita), and the subscription
  insert hardcodes `status: 'active'` for every non-null plan — no `"expired"`,
  `"canceled"`, or `"past_due"` state is ever seeded. Sam and Rita represent
  "never subscribed," not "lapsed." Per the explicit constraint not to mutate
  another persona's subscription row to manufacture one, this probe cannot be
  answered with current data. Recorded honestly as NOT-TESTABLE rather than
  guessed or silently dropped.
