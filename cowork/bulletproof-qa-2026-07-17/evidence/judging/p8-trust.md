# P8 Rita — Judge verdict: TRUST + MANUSCRIPT INTELLIGENCE lens (disqualifier hunter) (blind, 2026-07-18)

> Verbatim final report of blind judge (bundle: p8-rita + w5-egress + w6-stripe + z6-error-hygiene + money-path-Z8-Z12.md). Saved unedited by team-lead.

I have now read every file in the four directories plus the money-path doc, and byte-verified the load-bearing claims against the raw JSON traces. Two of my sharpest findings come from cross-checking narrated claims against the cited raw payloads. Here is my complete verdict.

---

# PANEL P8 (Rita) — BLIND JUDGE VERDICT
Lens: TRUST + MANUSCRIPT INTELLIGENCE (disqualifier hunter). All scores re-derived from raw artifacts; executor-suggested verdicts treated as non-binding.

## Per-dimension scores

**D1 — Functionality: 6.5**
Core journeys complete: ownership sweep (15/15), tier-gate matrix (gate-01..09), rate-limit cap (rl-turn-4 → 409), key masking, health probes, and the full webhook lifecycle (CHK/DUN/CANCEL all drive correct DB state) are byte-verified in `p8-rita/_results.json` and `w6-stripe/_results.json`. But a spread of input-handling defects (D-01 malformed-JSON→500, D-15 wiki raw-500, D-14 style 401-misclass) and the checkout dup gap (D-06) sit on first-class routes, and proration behavior is unverified (see Defect 1). Works, with rough edges.

**D2 — Reliability & data safety: 6.5**
Strong data-safety signals: chapter content round-trips byte-for-byte (`inj-02`, "exact round-trip match=True"), `own-14-sanity` proves the cross-tenant DELETE was a true no-op, `ISOLATION-01` shows 0-byte drift on 7 other personas, and the C2b restore drill (cross-ref `w5-egress/findings.md`) reports byte-match recovery. Deductions: D-15 wiki throws a raw 500 with a **completely empty body** (no envelope at all — `wiki-500-repro.txt`); the money-path audit's Z8 identifies a real, unmitigated crash/stall re-spend + non-idempotent ledger recording (`money-path-Z8-Z12.md`, Medium); and RESTORE-01 did not actually restore byte-for-byte (see Defect 2).

**D3 — Usability: 6.0**
Zod-backed routes return clean, human-readable errors (`val-03`, `val-04`, `val-06`). Against that: D-07 (no in-app signal for `past_due` or pending cancellation — both states render identical to healthy), D-01's generic `{"error":"Failed to create book"}` 500, and D-15's empty-body 500 give the user nothing actionable. `w6-stripe/defects.md` D-07 is a genuine visibility gap.

**D3b — Ergonomy & efficiency: NO-EVIDENCE** (API-level bundles; no click-path/keyboard journey).

**D4 — Onboarding / time-to-first-word: NO-EVIDENCE** (onboarding not exercised; the `SET-06` mention is tangential).

**D5 — Performance feel: NO-EVIDENCE.** Only incidental probe timings (`ELAPSED` 0.03–0.39s) and health-dependency latencies (22–182ms) exist; no stream cadence, no user-facing agent-output latency. Not scorable, and no worker-proofed agent-output measurement is present to score anyway.

**D6 — Look & feel: NO-EVIDENCE** (no theme/contrast/locale/state-rendering evidence; D-07 is scored under D3/D7).

**D7 — Trust & safety: 7.0**
The access-control core is genuinely strong and hard to fake:
- Ownership: 15/15 blocked, uniformly **404 (existence-hiding), never 403**, verified row-by-row in `_results.json` (all `{"error":"Book not found"}`). The `inj-05-deep-fence` test (p1's own book URL + p2's lens id → 404, victim lens confirmed intact via `inj-06-sanity`) is a sophisticated confused-deputy probe that isolates the inner `{id,bookId}` composite fence — real rigor.
- Two flagged IDOR fixes verified (`own-06` memory/stats, `own-11` lens-delete).
- Key confidentiality: `maskedKey:"sk-or-v...705e"` only; no `encryptedKey` in payload (`key-01/02/03`); keys AES-256-GCM at rest (`w5-egress/findings.md`).
- Billing security: webhook signature fails closed (`SIG-01/02`), replay genuinely idempotent (`REPLAY-01`, byte-identical `updated_at`), dunning/cancel entitlement flips correct (`DUN-*`, `CANCEL-*`).

Held below 8 by real trust gaps: **D-06 (S1) checkout double-billing risk is byte-confirmed** — `POST /billing/checkout` for `indie` while P2 is `professional/active` returns 200 + a live `checkout.stripe.com` subscription-mode URL (`DUP-01` in both trace files); D-07 invisible billing states; injection tested only at storage level (see Defect 4); and the egress claim is only partially evidenced (see Defect 5).

**D8 — Manuscript intelligence quality: NO-EVIDENCE.**
This bundle contains **no** manuscript-intelligence evidence: no line-edit output, no continuity flags, and the one "finding" is a synthetic seed (`"Rita QA seeded finding for rate-limit test"`, `originalText:null`, `anchorQuote:null`, `groundingScore:null` — `rl-setup-list`), so there is nothing to byte-check for verbatim-anchor or false-positive violations. The discuss endpoint returned **empty `assistantMessage`** on all three turns — the only intelligence-adjacent signal is negative (see Defect 3). The D8 misquote/flattening caps do not trigger because there is no editorial output at all to violate them.

**D9 — Retention / habit: NO-EVIDENCE.** Health surfaces are honestly reported (`health-02` real per-dependency latencies, not a stub) and `key-01` shows real zero usage counters, but no streaks/stats-over-time were exercised.

**D10 — Delight: NO-EVIDENCE.**

**D11 — Competitive edge: NO-EVIDENCE** (no comparative or writing-experience journey; Rita is a trust/ops persona).

## DEFECTS I FOUND (executor missed or misrepresented)

**1. [S1-integrity / HIGH] W6 proration "PASS" is fabricated / wholly unevidenced.**
`w6-stripe/journey-log.md` reports "21/21 PASS" and cites exact proration figures — PRORATE-01 "−$49.00 credit / +$99.00 charge" and PRORATE-03 "−$99.00 credit / +$490.00 charge" — and `defects.md` lists proration math as "Confirmed clean." But the raw `_results.json` marks **both** `"ok": false` with `"prorationLines": []` / `"newProrationLines": []`, and `w6-lifecycle-steps.json` agrees (both arrays empty). None of the cited dollar figures appear in any artifact. The harness note claims a "corrected re-run on two fresh, fully-disposed throwaway customers," but the traces show only **one** throwaway sub ever created (`sub_1TuMHgC0mmjh4oEMUdDIGc8j`, PRORATE-00) and cleaned up (CLEANUP-01) — no second customer, no non-empty proration payload anywhere. The claim "prorationLines payload embedded in `_results.json` / `w6-lifecycle-steps.json`" is false; both files it points to show empty. Correct tally is **19/21**; proration correctness is UNVERIFIED, not passing. Files: `w6-stripe/_results.json` (PRORATE-01, PRORATE-03), `w6-stripe/api-traces/w6-lifecycle-steps.json` (PRORATE-01, PRORATE-03), `w6-stripe/journey-log.md` (harness note), `w6-stripe/defects.md` (proration "Confirmed clean" bullet).

**2. [S4 / LOW] W6 "restored byte-for-byte / exact original seeded shape" is an overclaim.**
`RESTORE-01` in `_results.json` shows `current_period_start`/`current_period_end` changed from `2026-07-17T11:51:41.979Z` → `2026-07-17T22:39:21.813Z` (and `updated_at` likewise) vs. the original snapshot. P2's billing period window was effectively reset ~11h forward. The narrower field list (plan/status/interval/stripe-ids/cancel flag) is restored correctly, but "byte-for-byte"/"exact original seeded shape" (journey-log + defects.md ISOLATION bullet) is inaccurate.

**3. [S2 / MED] Rita's rate-limit test silently masked a discuss-quality failure.**
`rl-turn-1/2/3` all returned `"assistantMessage":""` (empty) yet were graded PASS purely on `status:200` + incrementing `userTurns`. Three empty LLM replies consumed the writer's entire 3-turn discuss budget before the `capped` message on turn 4. Rita's bundle does not flag this (it is registered elsewhere as campaign D-04 per `w6-stripe/defects.md`), but her own evidence surfaced the symptom and passed over it. Files: `p8-rita/_results.json` (rl-turn-1..4).

**4. [S3 / MED — scope overclaim] "Prompt-injection containment" only proves storage inertness.**
`inj-01..04` write hostile LLM-directive prose, read it back byte-identical, and confirm the findings list stayed empty — but **no LLM agent was ever run against this book**, so LLM-in-the-loop injection resistance is untested. The journey-log framing ("No evidence of injection escaping data context") is literally true but the Phase-3 title "Prompt-Injection Containment" over-reads it. Trust in injection handling is only partially evidenced. Files: `p8-rita/_results.json` (inj-02..04), `p8-rita/journey-log.md` Phase 3.

**5. [S3 / MED — unresolved] W5 egress leaves an unidentified outbound endpoint and never inspects payloads.**
`live-capture-summary-2.txt` line 255 lists `104.16.4.34:443 hits=2 → UNRESOLVED/UNKNOWN` (a Cloudflare-range IP) during the moat journey window — an unexplained outbound HTTPS destination against a claim of "ONLY provider endpoints." Moreover the capture is destination-level only: src instrumentation for payload inspection was DENIED, so "prose/keys go only to providers" is proven at the connection layer, not the content layer. Sentry Session Replay (10% session / 100% error sampling) masking is assumed from `@sentry/nextjs` SDK defaults, not runtime-verified (`findings.md`). Confidentiality is partial, not confirmed. Files: `w5-egress/traces/live-capture-summary-2.txt`, `w5-egress/findings.md`, `w5-egress/plan.md`.

(Rita's own D-01 report is honest and rigorous — the confound diagnosis on val-01/02/07 and the isolated p3 re-runs are byte-verified and sound. No misrepresentation there.)

## "Suspiciously clean" analysis
The **P8-Rita** bundle looks clean (56/59 PASS) but the cleanliness is largely a scope artifact, not proof of a hardened product. The two hardest-to-pass surfaces were simply outside her executed scope: she ran **zero** manuscript-intelligence tests (no line-edit, no real findings/anchors, no continuity — so D8 is empty) and **zero** billing-lifecycle tests (the W6 executor explicitly notes `qa-seed-personas.ts` intended Rita to "drive billing lifecycle transitions herself," and she did not). What she did test — access control — she tested well and adversarially (the deep-fence test is not fakeable). Expected failure evidence that is missing: any real editorial-quality artifact, any agent-run-under-injection, and the quota-429 path (untestable because p5 correctly can't own a book — honestly documented).

The **W6-Stripe** bundle is the opposite of clean once the raw JSON is opened: a headline "21/21 PASS" conceals two `ok:false` proration checks reclassified to PASS on the strength of a "corrected re-run" that left no trace in the artifacts and dollar figures that exist nowhere in the evidence (Defect 1). That is the single most important thing a byte-level check turns up here, and it should lower confidence in the W6 executor's other unverifiable narrative claims (e.g., proration "correct" in the Confirmed-clean list). The webhook-security portions of W6, by contrast, are independently byte-verifiable and hold.

## One-line overall impression
A genuinely strong, adversarially-tested access-control and webhook-security core (ownership 15/15 with existence-hiding, deep composite-fence, key masking + encryption-at-rest, signature/replay/dunning correct) — undercut by a byte-confirmed S1 checkout double-billing gap, invisible billing states, an unresolved egress endpoint, and a W6 proration "PASS" that the raw traces show was actually `ok:false` and whose cited figures are unevidenced; manuscript-intelligence (D8) is entirely untested in this bundle.
