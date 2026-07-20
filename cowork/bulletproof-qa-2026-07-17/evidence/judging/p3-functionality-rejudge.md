# P3 "Selena" — Rejudge Verdict (Functionality/Reliability lens) — 2026-07-20

Blind. Rubric + `evidence/p3-selena-rejudge/` only. Headline (MIN-over-floors): **6.5**.

## Per-dimension scores
- **D1 Functionality — 7.0.** Core journey completes on real infra: series+2 books+10 chapters live HTTP, real qwen3.6 8/8 yielded, all three checks fire via product `runConsistencyChecks`, all three persist through live `/continuity/scan` (`04`, `06`, `57`). Each fired flag verified against seeded prose = true positive. Deductions: first live scan surfaced 2/3 (OBS-1 dissolved the relationship contradiction, needed ch5 re-extract workaround); extraction via awaited direct `updateFromChapter()` calls, not the route's fire-and-forget path (disclosed).
- **D2 Reliability & data safety — 7.5.** Strongest. Failed extraction → `failed:true`, no content-hash stamp, zero fabricated/partial writes (`07` probe 3). No prose lost; content PUTs versioned. ch8 miss recorded raw (`55`); throttle honestly signaled. Held below 8: production async failure path never observed failing over HTTP; graph accepted a fabricated derived fact (Zoë death — Defect 1).
- **D3 Usability — 6.5.** API-level: flags carry jumpChapter/anchor; extraction envelope rich (state/attempts/lowYield/throttled/retryEligibleAt); failure message actionable. Marred by relationship_contradiction `chapterNumber:0, jumpChapter:null, anchor:null` (`57`). No UI.
- **D3b / D4 / D6 / D9 / D10 — NO-EVIDENCE.**
- **D5 Performance feel — 6.5 (dev-labeled).** First hits slow (6.7s/7.1s) — dev-mode compile; warm scans 207–459ms; saves 133–1600ms. Extraction 40–159s/ch model-bound BYOK, non-blocking.
- **D7 Trust & safety — 7.0.** D-30 vector decisively closed: byte-identical victim snapshots, 0 leaked OPPOSES, 0 cross-book edges, userId stamped, `runConsistencyChecks(victim,P4)`=0 (`03`; `phase_d_isolation.ts` honest — P3 write after victim existed). Held at 7.0: only graph-write vector tested; no negative API authz probes; spoofed-auth out of scope.
- **D8 Manuscript intelligence — 6.5.** All four classes constructible + fire; zero false positives fired (book2 0, victim 0, Zoë retrospective occ=0 correctly did NOT fire — good suppression executor undersold). 8.5 FP cap does not trigger. Mid-grade not moat-grade: (a) seeds admitted max-signal (`_lib.ts`), natural-prose detection unproven; (b) OBS-1 live-observed silent flag vanish; (c) fabricated death (Defect 1) + inconsistent retrospective placement (Defect 3) = latent-FP machinery; (d) Zoë/Zoe fork.
- **D11 Competitive edge — 6.5.** Working per-chapter LLM→graph→check→persisted-flag pipeline w/ cross-book canon carry is real differentiation, but proven only under strongest-signal conditions with a dissolution hole + canon residuals — "impressed, then bitten."

## Defects (executor missed/under-reported)
1. **Fabricated death via over-inference — MEDIUM.** Book2 ch2 says Zoë "left her charts to the archive" — never death (`b2_put_content_ch2.json`); graph recorded `status=dead deathChapter=2` + event `"Death of Zoë Rasmussen"` (`02`). Future false dead_character_reappears if she writes Zoë alive. Not in SUMMARY/defects/journey-log. [→ D-90]
2. relationship_contradiction `chapterNumber:0/jumpChapter:null/anchor:null` (`57`, `06` "ch0"). **LOW-MED.** [→ D-91]
3. Retrospective-event placement stochastic not deterministic — book1 ch4 retrospective death → occ=4, book2 equivalents → occ=0 (`01`,`02`); journey-log "deterministically derived" overstates. **MEDIUM (latent FP).**
4. Event canon residual — "Death of Dorn Kappel"(occ=1) + "Dorn Kappel's death"(occ=0) coexist book2 (`02`). **LOW.**
5. Duplicate edges — OPPOSES ch7 twice, victim ALLIED_WITH twice (`03`), both-direction emission. **LOW** (isolation unaffected).
6. Worker-proof PPID chain has unlisted intermediates — INFO, not void; one-worker holds in substance, extraction NOT void.
7. Series-context surfaced only 2 of prior-book cast — Zoë absent from book2 context (`05`), likely OBS-2 fork consequence. **LOW.**

## "Suspiciously clean?"
**No — earns credibility.** Genuine recorded failure: ch8 miss raw (`55`), first scan 2/3 (`04`), self-reported OBS-1/OBS-2, explicit "not exercised" list. Raw reads contain warts SUMMARY doesn't spin AND warts executor didn't notice (Zoë death, ch0 flag, occ inconsistency) — signature of raw not curated evidence. Missing: naturalistic-prose extraction, UI, negative authz probe, concurrency/race, route async path failing over HTTP. "15/15 events carry chapter" is book1-scoped; book2 occ=0 vs occ=4 shows derivation is LLM-influenced — "deterministic" framing mildly overstated.

**One line:** Moat works end-to-end on real extraction — checks fire, flags persist, tenants isolated, failure honest — but only under max-signal prose, with a live-observed flag-dissolution hole and latent hallucination in the graph → "solid SaaS," not "bulletproof moat." **Headline: 6.5** (D8 the substantive cap).
