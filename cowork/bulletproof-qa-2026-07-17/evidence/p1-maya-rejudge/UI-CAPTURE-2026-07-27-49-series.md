# 49-series — D-195 theme-blind chart colour: witnessed closed

Branch `qa/bulletproof-2026-07-17`. Fix commit `ac20626`. Capture after fix, dev :3001.
Persona harness: e2e headers (`x-e2e-test-secret` + `x-e2e-clerk-id`), no `.env` flips.

## What D-195 was

`hsl(var(--token))` wrapped over tokens that are already `oklch(...)` in
`src/app/globals.css`. The composed value `hsl(oklch(0.205 0 0))` is invalid CSS, so
the whole declaration is dropped. For SVG `fill` the fallback is the initial value —
**black**. Light mode masked it (`--primary` is near-black anyway); dark mode inverts
the token to near-white but the bar still painted black.

Scope at fix time: 26 occurrences / 24 lines / 3 files
(`daily-word-chart.tsx`, `reports/analytics-tab.tsx` — 22 of them —, `ui/sidebar.tsx`).

## 49a / 49b — Daily-word chart, light vs dark (PASS)

Falsifiable pre-condition (pre-fix): `barsLight === barsDark === rgb(0, 0, 0)`.

Post-fix measured `fill` on rendered bars, same chart, theme toggled:

| probe | value |
|---|---|
| light bars | `lab(7.78201 -0.0000149012 0)` |
| dark bars | `lab(90.952 -0.0000596046 0)` |
| panel background (dark) | `lab(2.75381 ...)` |
| `fillsDifferAcrossThemes` | `true` |
| `neitherFillIsBlack` | `true` |
| `primaryTokenFlipped` | `true` |
| `fillAttrIsBareToken` | `true` |

Bars now track `--primary` in both themes and neither value is black. Dark-mode bars
sit at L=90.95 against an L=2.75 panel — visible contrast where pre-fix there was none.
Screenshots: `49a-*`, `49b-*`.

## 49c — analytics tab (INCONCLUSIVE, disclosed)

No analytics chart mounts anywhere reachable in the dev DB: this persona has 0 findings
and all-user-keys, and those are the data states the tab's charts key off. Probe returned
`copy: null` for chart nodes because nothing rendered — not because colours were wrong.
`49c-assertions.json` + `49c1-analytics-tab-before-hover.png` banked as-is.

**Coverage gap (not a numbered defect):** the 22 `analytics-tab.tsx` occurrences are fixed
by the same source change and covered by `tests/unit/theme-token-css.test.ts`, but they are
**not witnessed in pixels**. A judge should treat analytics-tab colour as source-verified
only. Reaching it needs a seeded findings + mixed-key state.

**Second disclosed gap:** hover `cursor` read `null` in both themes, so the
`color-mix(in oklab, var(--muted) 30%, transparent)` alpha substitution is source-verified
only. Recharts paints the cursor rect on active hover; the probe never held hover.

## Verification outside pixels

`tests/unit/theme-token-css.test.ts` (new, 72 lines): scans `.ts/.tsx/.js/.jsx/.css` for
`hsl(var(--` and asserts zero matches, plus meta-asserts that the replacement idioms
(`color-mix`, bare `var(--token)`) are present so the guard cannot pass vacuously.
Full suite **1702/1702 across 208 files**. Independent sweep of `src/` confirms zero
sibling `hsl(var(--...))` idioms remain.

## Verdict

D-195 **CLOSED, witnessed** on the daily-word chart. Residual: analytics-tab and the
hover-cursor alpha case are source-verified + test-guarded, not pixel-verified.

## 49c — correction: the transferred-book attempt was void, not informative

Written after the section above, on re-reading `49c-assertions.json` against the source.
The INCONCLUSIVE verdict stands; the **reason recorded above is wrong in one half**, and the
re-shot prescription changes because of it.

`49c-assertions.json` records `identityUsed: "user_dev_bypass"` and book
`4a37715f-30ad-43d9-9960-3ba9c0d169a4`. But `src/lib/auth.ts:62-69` honours the
`x-e2e-clerk-id` header **only for ids prefixed `user_qa_`**:

```ts
const requestedClerkId = headersList.get("x-e2e-clerk-id");
const clerkId =
  requestedClerkId && requestedClerkId.startsWith("user_qa_")
    ? requestedClerkId
    : E2E_TEST_CLERK_ID;
```

`user_dev_bypass` fails that prefix test, so the request silently resolved as
`E2E_TEST_CLERK_ID` = `user_test_e2e`. Database check (container `wmb-pub-postgres-1`,
database `writemybook`):

| clerk id | books |
|---|---|
| `user_dev_bypass` | 10 — including `4a37715f` "The Salt Letters" |
| `user_test_e2e` | **0** |

So 49c viewed that book as a user who owns nothing. Its `chartMounted: false` and
`betaTabPresent: false` are **harness artifacts of a deliberate security guard** — the
prefix test is a control, not a bug — and carry no information about the chart. They must
not be read as evidence that no analytics chart exists.

What still stands: `peek49c.ts` ran with `x-e2e-clerk-id: user_qa_p1`, an honoured id, on
Maya's own book, and legitimately found `Analytics tab aria-selected=true` with
`.recharts-wrapper` count 0. Maya's book genuinely mounts no analytics chart (no beta
scores, all-user-keys). The over-broad claim is the generalisation to the whole dev DB.

**Corrected prescription for the re-shot:** either drive "The Salt Letters" through a plain
dev-bypass session with no e2e header at all, or seed beta scores / a mixed-key state onto a
`user_qa_*` book. Retargeting the same header at the same book will keep returning nothing.

**Not a defect. No number assigned.**
