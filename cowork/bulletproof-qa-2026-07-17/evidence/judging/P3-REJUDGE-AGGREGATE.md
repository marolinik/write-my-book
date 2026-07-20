# P3 "Selena" — Rejudge Aggregate Verdict (2026-07-20)

Blind panel, 3 independent Fable judges (func+reliability / UX+experience / trust+manuscript-intelligence lenses), scoring the FRESH independent live bundle `evidence/p3-selena-rejudge/`. Judges had rubric + bundle only — no repo, no target grade, no cross-talk (verdicts returned, not written to a shared dir). Aggregation per GRADING-PROTOCOL: MIN-on-floors, median-elsewhere.

## Headline

**P3 = 6.5** — UNANIMOUS across all three judges. **Decisively off the 3.0 platform-MIN floor** (baseline 2026-07-19).

| Judge (lens) | Headline (MIN-over-floors) | Floor-driver dims |
|---|---|---|
| func + reliability | 6.5 | D3, D5, D8, D11 |
| UX + experience | 6.5 | D5, D9, D10, D11 |
| trust + manuscript-intel | 6.5 | D3b, D5, D9, D10 (D7=8.0, D8=7.5) |

Three lenses, three *different* floor-driver sets, one converged cap. That divergence-on-which-dim / agreement-on-the-number is a strong non-inflation signal. Calibration (2026-07-18) already proved this panel non-inflationary (0/3 scored a planted bundle ≥9 on any dim).

## Per-dimension consensus (median, MIN on floored dims)

| Dim | Scores (func / exp / trust) | Consensus | Note |
|---|---|---|---|
| D1 Functionality | 7.0 / 7.5 / 7.5 | **7.5** | series+books+chapters live, 3 check classes fire+persist; asterisk: extraction driven by awaited `updateFromChapter()` calls, not the route's fire-and-forget leg |
| D2 Reliability/data-safety | 7.5 / 7.5 / 7.0 | **7.5** | failure honesty strong (failed:true, no hash stamp, 0 fabricated nodes); ding: OBS-1 silent flag disappearance + DEF-A false canon |
| D3 Usability | 6.5 / 7.0 / NO-EVID | **6.5** | API surface legible (jumpChapter/anchor/severity); no UI evidence captured |
| D3b Ergonomy | NO-EVID / 7.0 / 6.5 | **6.5** | one-POST scan, dedup, hash-skip; relationship_contradiction jump affordance dead (DEF-B) |
| D4 Onboarding | NO-EVIDENCE | — | bundle starts at API series-create |
| D5 Performance feel | 6.5 / 6.5 / 6.5 | **6.5** | cold reads 6–7s (dev-labeled), warm 207–460ms; extraction 40–160s async |
| D6 Look & feel | NO-EVIDENCE | — | no screenshots/UI |
| D7 Trust & safety | 7.0 / 8.0 / 8.0 | **8.0** | D-30 cross-tenant crater CLOSED with raw before/after read; graph-layer only, route-level authz probe untested |
| D8 Manuscript intel | 6.5 / 7.5 / 7.5 | **7.5** | all fired flags byte-verified TRUE positives, ZERO false positives (8.5 FP cap NOT triggered); held down by DEF-A hallucinated death + OBS-1 + diacritic fork + max-signal-prose-only |
| D9 Retention | NO-EVID / 6.5 / 6.5 | **6.5** | cross-book canon carry real; no flag-resolution lifecycle evidenced |
| D10 Delight | NO-EVID / 6.5 / 6.5 | **6.5** | series-context surfacing dead Dorn into book2 = the one demonstrated magic moment |
| D11 Competitive edge | 6.5 / 6.5 / 7.5 | **6.5** | real differentiation (per-chapter LLM→graph→checks+cross-book canon on cheap BYOK), residuals honestly on table; "impressed then bitten" |

**P3 grade = 6.5** (floored by the 6.5 cluster: D3/D3b/D5/D9/D10/D11 + D8-func).

## What the panel confirmed CLOSED vs the 3.0 baseline
- **D-19** — continuity checks now FIRE end-to-end on real qwen3.6 extraction (were structurally unconstructible). ✅ all 3 judges verified against seeded prose.
- **dead_character_reappears / timeline_violation / relationship_contradiction** — all fire + persist as durable ContinuityFlag rows through the live scan endpoint. ✅ byte-verified true positives.
- **D-30 cross-tenant contamination** (the dominant 3.0 driver) — CLOSED at graph layer with raw before/after proof: victim edges JSON-identical, 0 leaked/cross-book edges, 0 false victim flags, userId stamped throughout. ✅ D7 8.0.
- **D-28** failed-extraction honesty — no silent-green, no fabricated nodes on failure. ✅
- **Zero false positives fired** anywhere in-bundle → D8 8.5 FP-cap does not bind.

## New defects surfaced by the panel (post-fix-wave; executor MISSED)
All three judges independently converged on the first two.

- **D-90 (MEDIUM) — extraction over-inference writes a hallucinated death into canon.** Book2 ch2 prose says Zoë Rasmussen only *"had left her charts to the archive"* — no death stated anywhere — yet the graph recorded `Zoë Rasmussen status=dead deathChapter=2` + an Event `"Death of Zoë Rasmussen" type=death` (`p3-selena-rejudge/neo4j-reads/02_book2_graph_state.txt` vs `api-traces/b2_put_content_ch2.json`). No flag fired *yet*, but this is a false-positive time-bomb: the moment Selena writes Zoë into a later chapter she gets a `dead_character_reappears` grounded in a death she never wrote, and series-context reports a living character as dead. Latent-FP / false-canon. **Non-blocking on P3=6.5** (P3 floors on capture-gaps + perf + lifecycle, not D8 alone) but caps D8 and is a real trust risk → follow-up fix track.
- **D-91 (LOW-MED) — relationship_contradiction flag persists with `chapterNumber:0, jumpChapter:null, anchor:null`** (`api-traces/57_http_scan_book1_ch5_v2.json`, `neo4j-reads/06_relcontra_live_persist.txt` "ch0"). Dead jump-to-chapter affordance for that entire flag class in any UI. → follow-up fix track.
- **(LOW) Event canonicalization residual** — book2 holds two nodes for one death (`"Death of Dorn Kappel"` occ=1 vs `"Dorn Kappel's death"` occ=0); D-32c canon works on the book1 case but fails on a trivial word-order variant. Also `occursInChapter=0` sentinel rows the SUMMARY's "15/15 carry chapter" (book1-scoped) does not mention. Class of D-85; instance unfiled. → hygiene track.
- **(disclosed by executor, confirmed) OBS-1** silent flag disappearance after unrelated later-chapter edge re-assertion; **OBS-2** Zoë/Zoe diacritic character fork. Both honestly recorded — completeness gaps, not hidden defects.

## Bundle-integrity notes (trust judge)
- **DEF-C:** SUMMARY claims "the ch8 stochastic miss is recorded raw" — it is NOT; `phase_e2b` clobbered `phase_e2`'s `06_*.txt`, only the post-hoc scan trace `55` survives. Overstatement, not fabrication.
- Headline overstatements: "byte-identical" (snapshot is seeded-pair edges only, not full-graph checksum); "15/15 events" (book1-scoped). Load-bearing claims all survived byte-level adversarial checking.
- Worker-proof PPID chain has unlisted Windows intermediates but end-of-run shows one cli→loader pair and extraction was script-serialized — one-worker requirement holds in substance; extraction measurements NOT void.

## "Suspiciously clean?" — panel consensus
**Shape yes, substance no.** 30/30 HTTP traces 200/201, only the deliberately-induced empty-keys probe fails organically. But the raw reads contain warts the SUMMARY spins and the executor never noticed (D-90 hallucinated death, D-91 ch0 anchor, occ inconsistency) — the signature of *genuinely raw* evidence, not curated. Self-reported OBS-1/OBS-2 + disclosed ch8 miss are real honesty signals. **Missing failure evidence** (caps how high experience dims can go): any UI/screenshot evidence (D3/D6 NO-EVIDENCE), a route-level tenancy probe (P3 HTTP read/scan against P4's book expecting 403/404 — isolation proven graph-layer only), naturalistic-prose extraction (all seeds are max-signal explicit assertions per `_lib.ts`), flag-resolution/dismissal lifecycle, and concurrency/race behavior.

## Bottom line
The series-continuity moat is **real**: three check classes fire on genuine BYOK extraction with zero fired false positives, cross-tenant isolation closed with raw proof, failure signaled honestly. It is "solid SaaS" (6.5), not "bulletproof moat" (9+): recall is stochastic, the graph harbors a latent hallucinated death, one flag class has a dead anchor, flags can silently vanish without a resolution trace, and it's proven only on maximum-signal prose with zero UI evidence. **P3 lifts 3.0 → 6.5.** Lifting P3 toward 9.5 needs product work (UI capture, deterministic extraction, flag-resolution lifecycle, perf, route-authz proof) + D-90/D-91 fixes — not more of the closed-defect work. Consistent with the pre-registered projection (P3 band 5–7).
