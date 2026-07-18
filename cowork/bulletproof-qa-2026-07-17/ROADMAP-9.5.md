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
