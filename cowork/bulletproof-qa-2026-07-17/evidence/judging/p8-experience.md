# P8 Rita — Judge verdict: EXPERIENCE lens (UX / onboarding / design) (blind, 2026-07-18)

> Verbatim final report of blind judge (bundle: p8-rita + w5-egress + w6-stripe + z6-error-hygiene + money-path-Z8-Z12.md). Saved unedited by team-lead. (Judge model: Opus 4.8 — re-dispatched after Fable spend limit.)

I have now read the entire bundle exhaustively and byte-verified the raw artifacts against the narrated claims. Here is my complete verdict.

---

# BLIND JUDGE VERDICT — Panel P8 (persona Rita) · Lens: EXPERIENCE (UX/onboarding/design)

## Framing note (critical for aggregation)
This bundle is an **API/trust/ops** sweep executed entirely over raw HTTP (`urllib`/`fetch`), plus a code-read money-path audit and a netstat egress capture. **There is zero browser, screenshot, editor, or visual evidence anywhere in it.** For my assigned Experience lens that is the dominant fact: the dimensions I was told to scrutinize hardest (D3b, D4, D6, D10) are almost entirely unevidenced. I score what the artifacts actually support and mark the rest NO-EVIDENCE rather than guess.

## Per-dimension scores

**D1 Functionality — 7.**
Core journeys demonstrably work: books/series/chapters/lens create (201s), findings seed+list, api-keys list, health, and the full W6 billing lifecycle (checkout, signed webhooks, dunning flip `past_due`→`active`, period-end cancel, portal round-trip). Z6 shows 14/16 route families validate cleanly. Deductions: the discuss endpoint returns **empty `assistantMessage:""` on all three turns** (`p8-rita/_results.json` rl-turn-1/2/3) — a real functional gap the log labels "succeeded"; wiki create/update **raw-500s** on parseable-but-invalid input (`z6/_results.json` WIKI-01/02, XCUT-03); malformed JSON→500 at the P8 snapshot (D-01).

**D2 Reliability & data safety — 7.**
Strong integrity signals: byte-for-byte chapter round-trip (`_results.json` inj-02), DELETE-attack proven a true no-op (own-14-sanity), oversized payload rejected pre-write (val-04), and W6 shows **zero cross-persona drift** + byte-identical P2 restore (`w6/_results.json` ISOLATION-01/RESTORE-01). Countered by dishonest failure states — empty-body 500 (D-15), generic 500 (D-01), and the Z8 crash/stall **re-spend/under-report** accounting risk (`money-path-Z8-Z12.md` §Z8, BYOK-bounded). No in-bundle export-truncation evidence (export was only ownership/path-traversal probed).

**D3 Usability — 6.** *(deep lens)*
Positive: Zod routes emit consistent, plain-language, actionable errors ("Your Indie Author plan allows 2 active books. Upgrade to create more.", "Invalid filename", "Too big: expected string to have <=2000000 characters"), and malformed JSON now returns a clean `{"error":"Invalid JSON body"}` on core routes (`z6/_results.json` BOOK-10, XCUT-07). Against that, **three** distinct error-classification defects degrade recoverability: D-01 (500 "Failed to save content" on bad input), D-15 (**500 with a completely empty body** — the worst possible recoverable-error surface, `z6/api-traces/wiki-500-repro.txt`), and D-14 (wrong-type field → **401 "Unauthorized"**, actively misleading a client toward a re-login, `z6/api-traces/style-lens-401-repro.txt`). Plus a state-visibility gap: no in-app signal for `past_due` or pending cancellation (W6 D-07).

**D3b Ergonomy & efficiency — NO-EVIDENCE.** *(deep lens)*
No writing/editor click-path or keyboard evidence exists in the bundle. The only ergonomy-adjacent datum is a negative: the billing "Upgrade" button is rendered on every plan card and wired straight to a checkout route with no interstitial (W6 D-06) — a genuine dead-end/foot-gun, but not a measure of the writing flow.

**D4 Onboarding / time-to-first-word — NO-EVIDENCE.** *(deep lens)*
No fresh-user journey or first-word timing is captured. The only onboarding-relevant facts are frictions, not an experience: unsubscribed users (p5/p8) hit a **hard 403 wall at book creation** ("Your subscription is inactive. Subscribe to access this feature.", gate-01/02), and onboarding's real precondition is ≥1 saved API key (`z6/defects.md` SET-06 note). I decline to score an onboarding experience from two paywall data points.

**D5 Performance feel — 6.**
Dev-server latencies are present, labeled, and plausibly non-stubbed: validation probe elapsed 33–392 ms (`p8-rita/api-traces/val-*.txt`); health per-dependency 22–182 ms with varied values (`_results.json` health-02). No stream-cadence evidence (discuss returned empty, non-streamed) and no load testing.

**D6 Look & feel — NO-EVIDENCE.** *(deep lens)*
No themes/contrast/locale-completeness/visual-state evidence. Only API-shape signals: clean empty states (`{"findings":[],"total":0}`, analytics `totals:0`, books `[]`) and one bad error-state (empty-body 500). Cross-referenced to D3.

**D7 Trust & safety — 8.**
The bundle's clear strength, tested from many angles and adversarially: 15/15 ownership blocked with existence-hiding 404s including the **deep composite-key fence** (inj-05-deep-fence, attacker's own book + victim's lens id) and both flagged IDOR fix-verifications (own-06 memory/stats, own-11 lens DELETE); tier gates + correct fail-closed precedence; key masking with cross-tenant isolation (key-03) and AES-256-GCM at rest (`w5/findings.md`); byte-level injection inertness with no auto-resolved findings/leaked markers (inj-02/03/04); webhook signature fail-closed + genuinely idempotent replay (W6 SIG-01/02, REPLAY-01); portal fails closed without leaking internals; 0 leaks across 94 Z6 probes. Held below 9 by a **live, unguarded S1 double-billing/overcharge path** (W6 D-06, DUP-01 returns a real checkout URL for a second concurrent subscription), the Sentry Session Replay prose-confidentiality hole verified only against SDK docs — not at runtime (`w5/findings.md` §Replay), and one **unresolved external egress IP** `104.16.4.34:443` (`w5/traces/live-capture-summary-2.txt`).

**D8 Manuscript intelligence quality — NO-EVIDENCE.**
No line-edit output, no findings carrying anchors/quotes (the seeded finding is a stub: `originalText:null, anchorQuote:null`), no continuity flags. The one discuss test produced **empty** output. The D8 misquote/false-positive caps do not bite because there is nothing to verify.

**D9 Retention / habit — 6.**
Only the "honest health surfaces" half is evidenced, and it holds: `/api/health/dependencies` reports real, varied, non-stubbed per-service latencies (health-02) and usage stats show honest zeros for a fresh key (key-01). Streaks/writing-stats/habit loops are untested.

**D10 Delight — NO-EVIDENCE.**

**D11 Competitive edge — NO-EVIDENCE.** (Rita never evaluates switching from an incumbent.)

## Defects I found that executors missed or misrepresented

1. **Discuss produces empty replies, graded as success (S2).** `p8-rita/_results.json` rl-turn-1/2/3 each return `{"assistantMessage":"","userTurns":n,"capped":false}`; the journey-log (Phase 4) calls them "real LLM call, succeeded." The rate-limit assertion is fine, but the feature returned **no content** on every turn — a real S2 functional failure (matches the campaign's own D-04) that P8 did not flag despite it being visible in its own raw data.

2. **W6 proration correctness claim is contradicted by its own cited artifacts (evidence-integrity, moderate).** `w6/journey-log.md` (lines 77–97) states the corrected proration lines "-$49.00/+$99.00" and "-$99.00/+$490.00" are "embedded in `_results.json` / `api-traces/w6-lifecycle-steps.json`." **Both files show `prorationLines: []` and `"ok": false`** for PRORATE-01 and PRORATE-03. The corrected re-run data does not exist anywhere in the bundle. The 21/21 PASS tally and the money-math correctness assertion rest on numbers that are narrated but unsupported by any artifact I can read.

3. **D-01's "architecturally present on all ~46 routes" is overstated / stale.** P8 asserts a blanket static-analysis scope but never re-verified it. The Z6 sweep one day later shows core routes (`/api/books`, `/api/documents`) now return clean 400 `{"error":"Invalid JSON body"}` — a shared guard was clearly added. D-01 was real on the two routes actually hit; the sweeping generalization was not.

4. **W5 egress leaves two real holes open under a "prove ONLY provider endpoints receive prose" mandate.** (a) `104.16.4.34:443` established outbound, marked UNRESOLVED/UNKNOWN (`live-capture-summary-2.txt`) — an unidentified external HTTPS destination during an agent run. (b) Sentry Session Replay ships DOM for 10% of sessions / 100% of error sessions and was confirmed **only against documented SDK defaults, not by inspecting a captured replay** — a live prose-confidentiality egress that the mandate specifically demanded closing. Also: the static half was transcribed second-hand ("Gerald's harness blocked direct Write"), a chain-of-custody weakness, and captures show **two node PIDs** (37060 + 41240 / 22564 + 37336), which voids the campaign's "exactly one worker" standard for any agent-output measurement drawn from these windows.

5. **Entire experience surface untested (coverage defect for a "bulletproof" campaign).** D3b/D4/D6/D10/D11 have no browser, screenshot, onboarding, or first-word evidence at all. For a persona nominally about the product's trust surface this is defensible, but the campaign's "bulletproof QA" label oversells coverage that this bundle does not provide.

## "Suspiciously clean" analysis
Surface headline (56/59 PASS, all 3 FAILs collapsing to one root cause) reads clean — but it is **earned in the security half and thin/overstated in the rest.** Genuinely earned: the ownership/injection/key/webhook work is rigorous, includes the hard composite-fence and idempotent-replay tests, honestly documents confounds (val-01/02/07 plan-cap), coverage gaps (429 path untestable, 200/24h limit not exercised), and harness self-corrections. What a real adversarial sweep should show but this one lacks: any 429 actually triggered, any concurrency/race artifact, any manuscript-intelligence output, and any UX/error-state screenshot. The two things that should lower trust in the executor's own grading are (a) the empty-discuss "success" gloss and (b) the W6 proration numbers that **do not exist in the artifacts they're attributed to** — the one place the bundle asserts money-math correctness, the raw data flatly contradicts it. Cleanliness here is narrow, not deep: the product's security posture looks strong; its experience posture is simply unmeasured, and one billing correctness claim is unsupported.

## One-line overall impression
A rigorous, honestly-caveated **security/trust** dossier (D7 ≈ 8, real S1 double-billing the main blemish) wrapped around an **almost total experience-evidence vacuum** — plus a discuss feature returning empty replies that was scored as passing and a W6 proration correctness claim its own raw files contradict.
