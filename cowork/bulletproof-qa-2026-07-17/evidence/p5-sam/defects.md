# P5 Sam — Defects (evidence-only)

Persona: Sam, weekend hobbyist, phone-first, zero jargon tolerance, seeded
UNSUBSCRIBED (`plan: null`) as `user_qa_p5`. Severity uses the campaign S-scale
(S1 data-loss/overcharge/leak/bypass/crash > S2 journey-blocking/fabricated-output/
false-positive > S3 friction > S4 cosmetic).

> Campaign register at time of filing: D-01 malformed JSON→500 (P8), D-03 export
> body-swap (P2, S1), D-04 discuss empty-reply (P1, S2), D-05 pdf export missing
> metadata title (P7, S3), D-06/D-07 checkout double-sub risk (W6, S1). Checked
> `p1-maya/defects.md` and `p8-rita/defects.md` for prior a11y/locale filings first
> (grep for `landmark`/`button-name`/`axe` — only false-positive substring hits on
> "SyntaxError"/"case", nothing filed). **New defects below start at D-08.**

---

## D-08 (S3) — Two `<main>` landmarks on every authenticated screen, confusing screen-reader/assistive-tech navigation

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
| settings | 6 (incl. D-09 below) |
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

## D-09 (S2) — 8 icon-only buttons on `/settings` have no accessible name (axe `button-name`, critical)

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

## D-10 (S3) — Mobile bottom nav labels never translate in any non-English locale

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

## D-11 (S2) — Arabic locale silently falls back to 100% English despite the save API reporting success

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
- **Book/series creation being subscription-gated with no free tier** — this is the
  W16 headline finding (see journey-log.md), but it is *intentional monetization
  design*, not a bug: the paywall itself is plain-language, doesn't trap Sam's typed
  input, and offers a clear next step. Reported to team-lead as a framing/scope
  finding, not filed here as a defect.
