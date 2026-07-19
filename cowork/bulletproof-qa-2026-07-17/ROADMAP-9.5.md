# ROADMAP TO 9.5 — post-judging campaign plan (2026-07-19)

Baseline: AGGREGATE-VERDICT.md — platform 3.0 floor-capped / 3.9–6.6 weighted; 0/6 trust gates.
Goal: platform verdict ≥9.5 = every persona ≥9.5 after floor caps + 6/6 writer-trust gates.
Owner approvals: blanket approval granted 2026-07-19 (incl. product changes: card-free on-ramp).

## Method (repeat until 9.5)
FIX WAVE → verify (tsc + unit + targeted live re-probe) → EVIDENCE RE-CAPTURE (adversarial, off-executor, worker-proof, pre-registered Ns met) → RE-JUDGE affected dims (protocol rule 7: shared-path fixes force D1+D2+D8 re-judge) → re-aggregate.

## Workstreams (grade-lift order)

### W-A — Failure-state honesty sweep (lifts D2/D3/D7 in P1/P4/P6/P8; biggest floor-lift per effort)
- A1 **D-36/D-48**: provider-error runs must NOT report complete/natural/statusAdvanced; status must be correctable by later genuine run.
- A2 **D-35/D-39**: setupComplete honored; audit+close silent-drop of unknown/stripped JSON keys on write routes.
- A3 **D-44**: per-key usage panel $0 (startsWith prefix bug) → real spend shown.
- A4 **D-15/D-14/D-01**: empty-body wiki 500s → guarded 4xx envelopes; 401-on-type-error → 400; malformed JSON → 400 envelope globally.
- A5 **D-04-class**: empty assistant/ghost replies must not bill as success (D-38 max_tokens fix) + honest error signal.
- A6 **D-41**: critical finding with empty newText — validation; discuss revisedSuggestion persisted.

### W-B — Money-path closure (trust gate 4)
- B1 **D-45**: fix W6 proration harness assertions, re-run lifecycle with REAL prorationLines checks.
- B2 **D-06**: duplicate checkout-session guard when subscription active.
- B3 **Z8**: idempotent batch spend ledger (crash/stall re-spend).
- B4 **D-59/D-60-adjacent billing honesty**: 201-on-existing-key, ghost-text billing records.

### W-C — Onboarding + card-free on-ramp (D4 4.0×4 panels → target 9+; gate 5 switch test)
- C1 **D-08 PRODUCT**: card-free path to writing (free tier: 1 book, capped words/AI credits, no card) — APPROVED.
- C2 **D-52**: trial marketing honesty (card disclosure) — moot where C1 removes card wall.
- C3 wizard: D-35 finish-fix (A2), architecture-step 570s timeout, time-to-first-word ≤60s measured.

### W-D — P3 series/continuity rebuild (persona at 3.0; D8 floor)
- D1 root-cause P3 verdict defects (D7=3.0 drivers first — likely ownership/gate issues in series routes; then continuity precision/recall).
- D2 continuity net to pre-registered metric: FP 0/≥30 seeded, recall ≥ declared floor.
- D3 re-run P3 journey end-to-end.

### W-E — Experience floor-raisers
- E1 i18n: D-12 Arabic no-op+RTL, D-51 partial locales, D-11 nav labels — locale ×7 complete (D6 requirement).
- E2 a11y: D-10 unlabeled buttons, D-54 heading-order, tab-stop labels (12/15 bare).
- E3 mobile: D-53 chrome occluding prose, avatar/FAB overlap, sub-44px tap targets.
- E4 editor UX: D-47 optimistic-locking on content PUTs (409 path), D-46 diacritic filenames, D-57 error-copy, D-61 estimatedPages, D-05 PDF metadata.
- E5 editorial output hygiene: D-49 fabricated rationale quotes, D-50 self-talk in reports, D-40 fingerprint glitch tokens (prompt+post-filter).
- E6 misc S4 batch: D-55, D-56, D-58.

### W-F — Perf + evidence infra
- F1 D5 measurements at 3 manuscript sizes, prod-labeled; queue status endpoint (D-42); stream keepalive progress honesty.
- F2 W12 golden-path CI gate green.
- F3 Off-executor evidence capture harness (protocol §4) + worker-proof automation — re-judging credibility depends on it.

### W-G — Re-grade cycles
- G1 after W-A/W-B: re-capture P4/P6/P8 evidence, re-judge.
- G2 after W-C/W-E: re-judge P1/P5 + experience dims.
- G3 after W-D: full P3 re-run + re-judge.
- G4 pre-registered metrics at N (misquote ≥100, flattening ≥30, continuity 30+30, autosave ≥20/scenario incl. offline-autosave unblock).
- G5 final full 8-panel re-judging + trust gates.

## Status log
- 2026-07-19: roadmap committed. Wave 1 dispatched: A1, A2+A3, A4 (parallel agents, no-commit mode; team-lead verifies+commits).
- 2026-07-19: **A1 DONE** (commit 3824604). D-36 confirmed already fixed (99c17f4, 13 tests); D-48(b) fixed via TDD (guard `<=`→`<` in advanceChapterStatus, 6 new tests). Adversarial verify: APPROVE-WITH-NOTES. tsc 0, 670/670.
- 2026-07-19: **D-62 registered** (S3, from A1 verify note 3): batch consecutive-failure breaker never increments on in-loop provider-failure children — `recordBatchFailure` fires only on thrown `isBatchBreakerError` (agent-worker.ts:908); N resolved provider-failure children can't trip the breaker, batch keeps spending through provider outage. → W-B scope (B3-adjacent).
- 2026-07-19: **W-D root-cause + W-C1 on-ramp design workflow COMPLETE** (wf_e912a95e-347, 10 agents). Outputs: `w-d-rootcause.md` (P3 = 5 structural root causes RC-1..RC-6, 10 fixes sized in dependency order, re-run metric plan), `w-c1-design.md` (card-free on-ramp build spec, Phase A/B/C, 4 open founder questions FQ-1..FQ-4). Harness track C (off-executor evidence harness design, W-F3) FAILED — re-dispatched separately.
- 2026-07-19: **D-63 registered (CRITICAL security)** from RC-1, confirmed in source by team-lead: Cypher injection — relationship `type` is free LLM-controlled string (tools.ts:606, no enum; cast `as RelationshipType` at :1524 is runtime no-op) interpolated raw into `MERGE (a)-[r:${type}]->(b)` (graph-builder.ts:272; labels ARE escaped, type is not). Payload can escape the pattern → unscoped cross-tenant `DETACH DELETE`. Write-up: evidence/d63-cypher-injection.md. Dispatched opus-fix-sec (boundary sanitizer + schema enum + graph-file injection sweep, TDD). → W-D critical-path fix 1. Next free ID: D-64.
- 2026-07-19: **D-63 LANDED (commit 45bcbc2, pushed)** — sanitizeRelationshipType boundary guard in graph-builder (canonical-map then strip to `[A-Z0-9_]`, RELATED_TO fallback, `_` digit-prefix; output always /^[A-Za-z0-9_]+$/), RELATIONSHIP_TYPES hoisted to types.ts as single source (extractor + tool enum + sanitizer), UpdateGraphEntity `type` now enum. Adversarial verify APPROVE-WITH-NOTES: full bypass battery executed against real function (0 escapes incl. evil-toString), second-sink sweep of all graph Cypher clean (only labels via escapeLabelForQuery + type via sanitizer; raw `type` only in console.error JS strings), extraction list identical 15, continuity net-positive (lowercase variants previously wrote case-distinct edges checks MISSED). tsc 0, 681/681. W-D RC-1 done.
- 2026-07-19: **W-A2/A3/A4 LANDED** (4 commits). `51c1f29` fix(api): leak-safe ZodError envelope + honest error copy (D-01/D-14/D-15/D-57, 11 files) — new zod-error.ts helper, memory/feedback raw-issues leak killed, wiki not-found copy unified. `dc912fa` fix(api): strict settings writes + registry usage rollup (D-35/D-39/D-44, 12 files) — 6 settings schemas .strict()+named-key 400s, D-44 registry-based per-provider usage (openrouter-* variants no longer read $0). `c682637` refactor(api): route ZodError catches through helper across 22 routes. All: 2 Fable adversarial verifies APPROVE-WITH-NOTES + opus-fix-a4 full green (tsc 0, 681/681). A4↔fork collision (dup imports) caught + reconciled. Remaining W-A: A5 (D-04/D-38 empty-reply billing), A6 (D-41). D-63 in flight (opus-fix-sec).
