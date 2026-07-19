# Sweep #53 — Onboarding + UX cluster (D-51 / D-52 / D-53 / D-54)

Executor: opus-fix-7c. Protocol: check-first, TDD RED-first where testable, minimal
diff, immutable, **NO-COMMIT** (team-lead lands by pathspec).

Lane discipline: touched only landing/billing/agent-bubble **components**. Did NOT
touch `src/lib/graph/**`, `src/lib/agents/**`, any setup/onboarding **completion API
route**, or any **findings dismiss/reject** path. (The tree also carries honesty-1's
D-55/D-58 files — `src/lib/agents/prompt-assembler.ts`,
`src/lib/agents/finding-history-status.ts`, the findings `[findingId]/route.ts`,
`d55-d58-honesty.md` — those are NOT mine; disjoint confirmed.)

Check-first: `git log --oneline --grep=D-51|D-52|D-53` → none on-branch. Related
already-landed: D-11 (mobile bottom-nav labels, `5a3fa02`) and D-08 (card-free Free
tier, `a7402c1`).

---

## D-51 [S3] — fr "untranslated buttons + provider blurbs" — **FIXED-NOW** (expanded scope, team-lead APPROVED)

**Not a data gap.** The fr catalogs were already COMPLETE (the strict `UIStrings` /
`AgentStrings` interfaces reject any missing key). The strings the judge saw
untranslated (J-1: "Add Key" / "Get key" / "Replace" / "Remove" + English provider
blurbs) were **hardcoded English literals that never routed through the catalog**.
team-lead approved the expanded honest fix: component wiring + a 7-locale interface
ripple (the wiring is small; the ripple is the bulk).

**Wiring (thread `useLanguage().t`, replace literals — EN values are byte-identical to
the old literals, so the English UI is unchanged):**

- `src/components/onboarding/provider-card.tsx` — imports `useLanguage`, reads `{ t }`,
  and routes 11 literals through `t.settings.*`: `addKey`, `getKey` (×2), `apiKey`,
  `labelOptional`, `labelPlaceholder` (the input placeholder), `validateAndSave`,
  `cancel`, `validating`, `replace`, `remove`. Provider blurb now
  `{t.settings.providerBlurbs[provider.key] ?? provider.description}` (English blurb in
  `providers.ts` retained as the fallback / source of truth).
- `src/components/settings/api-keys-section.tsx` — `usageSummary` / `noUsageYet` via
  the `{ t }` it already reads.

**Catalog (`src/lib/i18n/ui-strings.ts`) — `UIStrings.settings` interface + all 7
locale blocks (en/sr/de/es/fr/ru/zh):**

- 5 already existed and are reused unchanged (`addKey`, `apiKey`, `labelOptional`,
  `validating`, `cancel`).
- 7 NEW scalar keys: `getKey`, `validateAndSave`, `replace`, `remove`,
  `labelPlaceholder`, `usageSummary`, `noUsageYet`.
- NEW `providerBlurbs: { anthropic; openrouter; openai; gemini; grok }` — translated
  product blurbs; model names (Claude / GPT-4o / Gemini / Grok-4) kept verbatim in
  every locale.

**Deliberately NOT translated — `COST_HINTS` (`provider-card.tsx:55`) left English.**
Per team-lead's under-translate rule, these are **pricing claims** ("from $0.25/1M
tokens", "$3/1M tokens" …) and are deferred to a human pass rather than risk
mistranslating/propagating a possibly-stale billing figure across 7 locales. They
render only on the non-compact onboarding card (hidden on the compact settings cards).
Also left English: the `"Validation failed"` fallback in the `catch` (an internal
last-resort when the hook throws a non-Error — outside the ~11 button/label scope; the
hook normally supplies a real message). **Both listed here for a human pass.**

**Test (RED-first, catalog-level — mirrors the D-11 mobile-nav precedent):**
`tests/unit/provider-card-i18n.test.ts` (17 cases) — every UI locale supplies non-empty
`getKey/validateAndSave/replace/remove/labelPlaceholder/usageSummary/noUsageYet` and a
blurb for all 5 providers; non-English locales actually differ from English on the
labels; blurbs keep model names verbatim; unknown locale falls back to English. RED
proof: run before the catalog keys existed → **17/17 failed** on `undefined`
(`expected undefined to be truthy`). GREEN after the ripple → **17/17 pass**.

---

## D-52 [S3] — "14-day free trial" with no card-required disclosure — **FIXED-NOW**

**Reality check (check-first):** the card-free trial genuinely exists.
`src/app/api/billing/checkout/route.ts:164-173` sets, for first-time trialers on
plans with `trialDays > 0`:

```ts
sessionConfig.payment_method_collection = "if_required";
sessionConfig.subscription_data = {
  trial_period_days: planDef.trialDays,
  trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
};
```

So the writer starts with NO card and the sub auto-downgrades to Free on day 14 if
none is added. Per team-lead guidance ("if a card-free trial genuinely exists, verify
the copy matches reality"), the honest minimal fix surfaces that fact — no new flow.

**Change (pure copy, gated to the exact plans that have the card-free trial):**

- `src/components/landing/pricing-section.tsx` — under the plan CTA, when
  `plan.trialDays > 0`, render a muted line `No credit card required`.
  (`trialDays > 0` == indie/professional == exactly the plans whose CTA reads
  "Start 14-Day Free Trial"; founder/publisher = 0 → no line.)
- `src/app/(app)/settings/billing/page.tsx` — under the plan whose badge is the
  advertised `"14-day free trial"` (indie), render the same `No credit card required`
  line. The already-shipped trialing banner ("Add a payment method to continue after
  your trial") stays untouched and remains honest for the in-trial state.

**Test (RED-first, behavioral not stylistic):**
`tests/unit/pricing-trial-disclosure.test.tsx` (3 tests) — disclosure present iff
`trialDays > 0`; absent for `trialDays === 0`; exactly one disclosure when a trial and
a non-trial plan render together. RED proof: the string "No credit card required"
existed nowhere in `src/**` before this diff (`git grep` shows only the 2 new
component lines); the negative + scope cases fail against any un-gated/no-op
implementation. GREEN: 3/3 pass.

### D-52-billing follow-up — billing-page card-free disclosure is a per-USER lie — **FIXED-NOW** (team-lead verify blocker)

The Fable D-52 verify approved the **landing** page (`pricing-section.tsx` + its test)
as-is but flagged a blocking lie in the **billing-settings** page — the same
`D-45`/failure-states-lie class:

- Card-freeness is per-`(plan, USER)`, not per-plan. `checkout/route.ts:164` grants
  `payment_method_collection:"if_required"` only when
  `planDef.trialDays > 0 && !hasHadTrial`, where `hasHadTrial = !!sub?.trialEnd`
  (`route.ts:69`). A user who already consumed a trial (`trialEnd` set — the most
  common visitor of the billing page in the trial funnel) is **charged $49 on day 1**.
- My original billing-page copy rendered the `"14-day free trial"` badge + the
  `No credit card required` line on the STATIC per-plan predicate
  `plan.badge === "14-day free trial"` — so it advertised a card-free trial to exactly
  the returning user we will charge.

**Fix (`src/app/(app)/settings/billing/page.tsx`, minimal — the page already reads the
truth at `trialEnd`):** derive `const hasHadTrial = trialEnd !== null;` (mirrors
`!!sub?.trialEnd` in checkout) and gate both surfaces on `!hasHadTrial`:

- Badge block: `plan.badge && !(plan.badge === "14-day free trial" && hasHadTrial)` —
  the trial badge disappears for a trial-consumed user; every other plan's badge is
  unaffected.
- Disclosure: `plan.badge === "14-day free trial" && !hasHadTrial`.

**Test (RED-first):** `tests/unit/billing-trial-disclosure.test.tsx` (2 cases) renders
the real `BillingPage` with `@/hooks/use-billing` fully mocked. `trialEnd: null` →
badge + disclosure PRESENT (guards against over-hiding); `trialEnd` set → BOTH ABSENT.
RED proof against the pre-fix code: the negative case failed —
`expected <span data-slot="badge" …> to be null` (the trial badge still rendered).
GREEN after gating: 2/2 pass.

**Non-blocking structural note (register, not fixed — as instructed):** `PLAN_CARDS`
(`billing/page.tsx:41-108`) hardcodes prices/badges parallel to `PLANS` instead of
deriving from `PLANS` + subscription. That drift is what birthed this lie (the badge
string doubles as the trial predicate). Deriving `trialDays`/price from `PLANS` and the
card-free eligibility from `subscription` would kill the whole class — recommended as a
follow-up refactor, out of this minimal-diff lane.

---

## D-53 [S3] — mobile editor chrome occludes prose (AI pills 320/390; FAB/avatar 320) — **FIXED-NOW**

Root: `src/components/agent/ai-companion-bubble.tsx`. The floating FAB and the
onboarding-offer "AI pills" are corner-anchored `fixed` overlays that (a) collide with
the mobile bottom-nav and (b) blanket the manuscript at narrow widths. Fix = responsive
guards only (no layout rewrite). Reference geometry: `mobile-bottom-nav.tsx` is
`fixed bottom-0 h-14 z-30 md:hidden` (occupies 0–56px on mobile; hidden ≥ md).

**FAB — before → after:**
```
- className="fixed bottom-5 right-5 z-50 ... size-12 rounded-full ..."
+ className="fixed bottom-20 right-5 z-50 ... size-12 rounded-full ... md:bottom-5"
```
Mobile: `bottom-20` (80px) → FAB spans 80–128px, clearing the 56px nav (24px gap).
Desktop (`md:`, no bottom-nav): restores `bottom-5` (20–68px). Resolves the
FAB/nav (a.k.a. "avatar/FAB") corner collision on ≤ md.

**Offer pills container — before → after:**
```
- className="fixed bottom-20 right-5 z-50 flex flex-col items-end gap-2"
+ className="fixed bottom-36 right-5 z-50 flex flex-col items-end gap-2 md:bottom-20"
```
Mobile: `bottom-36` (144px) sits above the raised FAB top (128px); desktop restores
`md:bottom-20` (80px), above the `bottom-5` FAB (68px).

**Each pill — before → after (width-cap so a wide CTA never blankets prose):**
```
- className="flex items-center gap-1.5 rounded-full ... px-3 py-1.5 ..."
-   <SparklesIcon className="size-3.5 text-primary" /> {offer.cta}
+ className="flex min-w-0 max-w-[75vw] items-center gap-1.5 rounded-full ... px-3 py-1.5 ... md:max-w-none"
+   <SparklesIcon className="size-3.5 shrink-0 text-primary" />
+   <span className="truncate">{offer.cta}</span>
```
Mobile: pill caps at 75vw and truncates the label instead of covering the line being
edited; desktop restores full-width label. All Tailwind spacing values
(`bottom-20`/`bottom-36`/`bottom-5`/`max-w-[75vw]`) are in the default scale.

No unit test — pure responsive className change; team-lead to spot-check the rules
(cannot render 320px here). Pixel math above is the verification.

---

## D-54 [S4] — a11y page-heading — **FIXED-NOW** (released by team-lead)

Axe (P5 J-4, `p5-sam/api-traces/axe-results.json`) flagged three **page-heading**
violations. Root cause is uniform: shadcn `CardTitle` renders a `<div>`, not a
heading, so each page's real heading tree is only its explicit `<hN>` tags — and three
pages authored a gap:

| Screen | axe rule | Before | Fix | File |
|---|---|---|---|---|
| books list (empty) | `heading-order` | page `<h1>` → empty-state `<h3>` (skips h2) | `<h3>`→`<h2>` (matches `ShelfSection`'s existing `<h2>` on the non-empty path) | `src/app/(app)/books/page.tsx:113` |
| settings | `heading-order` | page `<h1>` → `<h4>` "Per-Role Overrides" (skips h2/h3) | `<h4>`→`<h2>` | `src/components/settings/model-selection-section.tsx:160` |
| new-book form | `page-has-heading-one` | no heading at all (title was a `CardTitle` `<div>`) | title rendered as `<h1 data-slot="card-title">` (same slot + styling; dropped now-unused `CardTitle` import) | `src/app/(app)/books/new/page.tsx` |

All three are tag-only swaps with **byte-identical styling** (the classes were already
explicit: `text-lg font-medium` / `text-sm font-medium` / `font-display text-xl`), so
zero visual change.

**Test (RED-first):** `tests/unit/a11y-page-headings.test.tsx` (jsdom, 3 cases)
reproduces the two axe rules deterministically — renders the books RSC (invoked as an
async fn with mocked auth/db), `NewBookPage`, and `ModelSelectionSection`, collects
`<h1>..<h6>` in DOM order, and asserts an h1 exists + no level increases by >1 + the
"Per-Role Overrides" heading is `H2`. RED before the swaps: `[1,3]` skip / no h1 /
`H4`. GREEN after: 3/3 pass.

**Out of D-54 scope (separate defects, NOT touched — flagged for triage):** the same
axe run reports `landmark-*` / `region` (moderate, D-09) on multiple screens and
`button-name` **critical** ×8 on `/settings` (D-10). These are landmark/label defects,
not page-heading, so left for their own fix.

---

## Gates (whole sweep: D-51 + D-52 + D-52-billing + D-53 + D-54)

- `npx tsc --noEmit` → exit 0.
- `npx vitest run` → **1124 passed / 139 files / 0 failed** (VITEST_EXIT=0). Floor was
  1078/133; my test adds are `pricing-trial-disclosure` (+3), `provider-card-i18n`
  (+17), `a11y-page-headings` (+3), `billing-trial-disclosure` (+2), remaining growth is
  concurrent teammates. 0 regressions; no in-flight RED from other lanes at gate time.
- RED→GREEN captured for all three testable items: `provider-card-i18n.test.ts` 17/17
  FAIL on `undefined` → PASS; `a11y-page-headings.test.tsx` 3/3 FAIL (`[1,3]` skip / no
  h1 / `H4`) → PASS; `billing-trial-disclosure.test.tsx` negative case FAIL
  (`expected <span data-slot="badge" …> to be null`) → 2/2 PASS.

## Exact pathspecs written by opus-fix-7c (NO-COMMIT — land these)

```
M  src/components/agent/ai-companion-bubble.tsx        (D-53)
M  src/components/landing/pricing-section.tsx          (D-52)
M  src/app/(app)/settings/billing/page.tsx             (D-52 disclosure + D-52-billing per-user gate)
M  src/components/onboarding/provider-card.tsx         (D-51 wiring)
M  src/components/settings/api-keys-section.tsx        (D-51 wiring)
M  src/lib/i18n/ui-strings.ts                          (D-51 interface + 7 locales)
M  src/app/(app)/books/page.tsx                        (D-54 empty-state h3->h2)
M  src/components/settings/model-selection-section.tsx (D-54 h4->h2)
M  src/app/(app)/books/new/page.tsx                    (D-54 h1 + drop unused import)
?? tests/unit/pricing-trial-disclosure.test.tsx        (D-52 test)
?? tests/unit/provider-card-i18n.test.ts               (D-51 test)
?? tests/unit/a11y-page-headings.test.tsx              (D-54 test)
?? tests/unit/billing-trial-disclosure.test.tsx        (D-52-billing test)
?? cowork/bulletproof-qa-2026-07-17/evidence/fix-reviews/sweep53-onboarding-ux.md
```

Note: `src/lib/llm/providers.ts` was cleared for my lane but **not touched** — the
English blurbs there stay as the catalog fallback / source of truth.

NOT mine (honesty-1's D-55/D-58, do not attribute to #53): `src/lib/agents/prompt-assembler.ts`,
`src/lib/agents/finding-history-status.ts`, `src/app/api/books/[id]/editorial/findings/[findingId]/route.ts`,
`src/lib/queue/agent-worker.ts`, `tests/unit/agent-worker-failed-session.test.ts`,
`tests/unit/finding-apply-guard.test.ts`, `tests/unit/finding-history-status.test.ts`,
`tests/unit/continuity-seeded-corpus.test.ts`, `cowork/.../d55-d58-honesty.md`.
