# P5 "Sam" — Rejudge Aggregate Verdict (2026-07-20)

Blind panel, 3 independent Fable judges (func+reliability / UX+experience / trust+safety), scoring `evidence/p5-sam-rejudge/`. Rubric + bundle only, no repo, no target, no cross-talk. Aggregation per GRADING-PROTOCOL: **MIN-on-floors** (D1/D2/D7/D8), median elsewhere.

## Headline

**P5 = 3.5** — floored by the adversarial trust lens on D2/D7. **DOWN 0.5 from the 4.0 baseline.**

| Judge (lens) | Headline | Floor-driver dims |
|---|---|---|
| func + reliability | 5.0 | D7/D10/D11 |
| UX + experience | 4.5 | D7/D11 |
| trust + safety (adversarial) | **3.5** | D2 3.5, D7 3.5 |

**Why DOWN despite closing all 5 baseline drivers:** the baseline 4.0 was capped by D-08 (no card-free path). That wall is verifiably gone (all 3 judges confirm 201 create for `plan:null`, autosave 200, byte-identical read-back). But the **fresh adversarial capture probed trust surfaces the baseline never touched** and found two S2 honesty defects the new on-ramp shipped with. MIN-on-floors exists precisely so an adversarial trust finding is not averaged away by two gentler lenses.

## Per-dimension consensus

| Dim | func / exp / trust | Consensus | Note |
|---|---|---|---|
| D1 Functionality | 6.5 / 6.0 / 6.0 | **6.0** (MIN, floor-dim) | card-free loop works; AI-assist + billing down in-env |
| D2 Reliability/honesty | 5.5 / 6.5 / 3.5 | **3.5** (MIN, floor-dim) | masked 500→401 on money path caps it |
| D3 Usability | 6.5 / 5.0 / 6.5 | 6.5 (median) | plain-language ar reject; billing "Unauthorized" dead-end |
| D3b Ergonomy | 6.0 / 6.5 / 6.0 | 6.0 | clean phone path to first word |
| D4 Onboarding | 7.0 / 6.0 / 4.0 | 6.0 | wall gone (real lift); self-contradicting key copy + false privacy claim drag |
| D5 Performance | 7.0 / 6.5 / 6.5 | 6.5 | CRUD 34–457ms dev |
| D6 Look & feel | 6.0 / 5.5 / 6.5 | 6.0 | mainCount:1, 0 nameless buttons (big a11y wins); residual contrast/landmark; partial FR |
| D7 Trust & safety | 5.0 / 4.5 / 3.5 | **3.5** (MIN, floor-dim) | masked money-path error + false privacy copy + Free-cap enforcement UNTESTED |
| D8 Manuscript intel | NO-EVIDENCE | — | AI-assist 500'd pre-LLM |
| D9 Retention | 5.5 / 5.0 / NO-EV | 5.25 | resume affordance, thin |
| D10 Delight | 5.0 / 5.0 / 5.0 | 5.0 | competent, nothing delightful evidenced |
| D11 Competitive edge | 5.0 / 4.5 / 4.0 | 4.5 | AI moat untasteable in-env → "notes app with progress bars" |

**P5 grade = 3.5** (lowest floored dim).

## Confirmed CLOSED (all 3 judges independently verified vs baseline)
- **D-08** card-free on-ramp — 201 create for unsubscribed Sam (was 403), autosave + byte-identical read-back, word count consistent across 4 surfaces.
- **D-09** dup `<main>` (`mainCount:1`), **D-10** 8 unnamed buttons (`namelessButtonCount:0`, was CRITICAL) — real a11y wins.
- **D-11** nav i18n (FR chrome renders), **D-12** Arabic fabricated-success → honest 400 (the baseline lie is dead).

## Floor-driving defects (the two S2s — BOTH NOW FIXED IN-TREE, pending verify)
- **D-92 (S2) — deploy drift + 401-masks-500.** `free_tier_usage` table missing in dev DB (a7402c1 migration never `db:push`ed here) → billing GET 401, ghost-text/inline-edit 500. Two parts: **(b) code** the blanket `catch{401}` masking a DB 500 as auth failure — **FIXED** (systematic honesty sweep, 9 handlers, `billing/subscription/route.ts` + 8 siblings; RED→GREEN `tests/unit/billing-subscription-route.test.ts`; +3 body-parse handlers pending careful extension). **(a) env** the missing table — `db:push` **deferred** until the in-flight P4 capture completes.
- **D-95 (S2, NEW judge-found) — false privacy claim.** Onboarding screen 1 stated *"WMB never stores or processes your content on our servers"* — false (product persists prose: documentId + version + `s3Prefix`; contradicts `terms:108` + `faq:29`). **FIXED** — copy corrected to match published ToS (`onboarding-wizard.tsx`: "stored encrypted at rest and sent only to the AI provider you connect… never used to train AI models… keys encrypted").

## Evidence-integrity findings (about the BUNDLE, for the v2 re-capture)
- **J-1/J-3 (all 3 judges): Free-cap negative enforcement NOT tested.** SUMMARY claimed "2nd book → 403" and "export never capped" — **no such trace exists**; both are source-derived. The tier-gate's adversarial half (cannot exceed cap) is unproven. (My team-lead SUMMARY propagated the executor's overclaim — corrected understanding: assert only what was driven.) A v2 P5 capture MUST drive: 2nd-book create (expect 403), export (expect ungated), no-secret control, cross-user ownership probe.
- **J-2/J-6: "key-less" narrative contaminated** — Sam's account carries a seeded OpenRouter key (env provisioning seeded all personas). Plan-gate card-free proof stands; a truly key-less capture needs a fresh no-key account.
- Editor UI + rendered failure-states never captured (typing was API-only). v2 must screenshot the mobile editor + what Sam sees on a 500/401.

## Lower-severity (confirmed)
- **D-93 (S3)** serious color-contrast 2.71:1 (dashboard) + heading-order (settings Anthropic card). **D-94 (S3)** landmark-unique + region on all screens.
- New minor: `<html lang>` stuck "en" under FR (a11y), partial FR localization (card metadata untranslated), stale dashboard "Total Chapters 0" vs 1 chapter, "Write My Book **OK**" naming artifact, jargon-forward settings/onboarding copy for a zero-jargon persona.

## Secrets: PASS
All 3 judges (esp. adversarial trust) grepped the bundle for `sk-…`/`postgres://`/`Bearer`/Stripe/`password` → zero hits. Auth secret only ever masked. Env flags booleans-only.

## Bottom line + what P5=3.5 actually means
The card-free writing on-ramp is **real and honestly evidenced** — the persona's worst screen (a hard paywall) is gone. But the fresh adversarial capture caught the new on-ramp shipping two S2 trust defects (masked money-path error, false privacy copy) that the baseline never probed, and the AI-moat "taste before paywall" is dead in this env (deploy drift). Per MIN-on-floors that lands P5 at 3.5.

**Crucially, 3.5 is a PRE-FIX snapshot:** both floor-driving S2s (D-92b, D-95) are already corrected in the tree; only the env `db:push` (D-92a) + driving the untested negatives remain. Per protocol rule 7 (shared-path fixes force re-judge), **P5 requires a v2 re-capture after D-92b/D-95/db:push land** for its certified number. Projected v2 band once AI-assist works + billing honest + negatives driven: **~5–6** (the underlying on-ramp scores D4 6–7, D3b 6.5, D6 6.0 — the ceiling is positioning/D11, not the wall). P5 is the current platform-MIN candidate; its true post-fix floor is the number that matters.
