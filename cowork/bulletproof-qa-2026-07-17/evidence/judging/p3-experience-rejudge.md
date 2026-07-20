# P3 "Selena" — Rejudge Verdict (UX/Experience lens) — 2026-07-20

Blind. Rubric + `evidence/p3-selena-rejudge/` only. Headline (MIN-over-floors): **6.5**.

## Per-dimension scores
- **D1 Functionality — 7.5.** All exercised worked first-try over live HTTP: series/books/chapters 201/200; 12+ real qwen3.6 extractions `updated:true`; all three check classes fire via `runConsistencyChecks` and persist as durable ContinuityFlag rows through the live scan endpoint (`01_book1_graph_state.txt`, `06_relcontra_live_persist.txt`).
- **D2 Reliability & data safety — 7.5.** Empty-keys extraction returns `failed:true`, contentHash NOT stamped, zero fabricated nodes (`07` probe 3). Sticky-dead survived contradicting ch4 re-extraction. Deduction: OBS-1 — a previously-firing contradiction silently stopped firing after an unrelated ch7 write (`04` shows 2/3).
- **D3 Usability — 7.0.** Flag payloads legible (severity, plain-English, entities, chapterNumber, jumpChapter+anchor). Extraction state machine visible/honest (`extracting`→`checked`, `throttled:true` + `retryEligibleAt`). Deductions: relationship_contradiction ships `chapterNumber:0, jumpChapter:null, anchor:null` (`57`); zero UI evidence.
- **D3b Ergonomy — 7.0.** One-POST scan, signature dedup, content-hash skip (no re-bill on re-scan), throttle w/ explicit retry time.
- **D4 Onboarding — NO-EVIDENCE.**
- **D5 Performance feel — 6.5 (dev-labeled).** Saves 133–460ms (1.6s first). Scan-with-work 6.7s; GET continuity 7.1s; series-context 5.9s — sluggish on the two reads a writer hits most. Cached/throttled 207–391ms fine.
- **D6 Look & feel — NO-EVIDENCE.**
- **D7 Trust & safety — 8.0.** Strongest evidence: victim edges byte-identical before/after P3's adversarial same-name OPPOSES write, 0 leaked/cross-book edges, 0 false victim flags, userId stamped (`03_d30_isolation.txt`). Held back: single attack vector; auth-spoof honestly unexercised.
- **D8 Manuscript intelligence — 7.5.** Every fired flag verified against seeded prose = true positive; zero false positives (book2 clean → 0, victim → 0, location gated). 8.5 FP cap NOT triggered. Held under 8: ch8 stochastic miss, OBS-1 forgettable contradiction, Zoë/Zoe diacritic fork.
- **D9 Retention — 6.5.** Trust preconditions exist; flag can vanish without resolution trace; no resolution/dismissal lifecycle evidenced.
- **D10 Delight — 6.5.** Series-context surfacing "Dorn Kappel … dead many years ago" opening book2 ch1 (`52`, `05`).
- **D11 Competitive edge — 6.5.** Moat delivers felt value (cross-book death carry, 3 classes fire zero-FP) a manual bible can't do passively — but bible never stochastically misses/forgets/forks. Would pay as supplement, not retire Scrivener+bible.

## Defects found (executor missed/underplayed)
1. relationship_contradiction persists `chapterNumber:0/jumpChapter:null/anchor:null` while other flag types carry full jump affordances (`57`, `06`). **LOW-MED (UX).** [→ D-91]
2. Silent flag disappearance without lifecycle trace: 3 issues → 2 persisted after ch7 write (`04`). **LOW-MED.** [OBS-1]
3. `occursInChapter=0` suppression class: book2 four events occ=0 (`02`); SUMMARY "all Events carry chapter" is book1-only. **LOW.**
4. Duplicate death-event fork book2 ch1 ("Death of Dorn Kappel" AND "Dorn Kappel's death"). **LOW.**
5. Directed-duplicate symmetric edges (ALLIED_WITH ch1 twice; OPPOSES ch7 twice, `03`). **LOW.**

Method notes: worker-proof valid (one logical worker). Extraction driven by awaited serialized `updateFromChapter()` calls, not production fire-and-forget — concurrency untested. E2b ch5 re-save used `changeSource:"system"` to bypass CAS (labeled honestly).

## "Suspiciously clean?"
**No — conspicuously honest.** Preserves ch8 miss, live 2/3 flag regression, Zoë/Zoe fork, explicit "not exercised" list. Missing verdict-relevant evidence: any UI (a UX judge sees zero pixels), HTTP cross-tenant access attempts, flag resolution lifecycle, dismissal workflow, concurrent double-scan, chapter delete/renumber effects — scope gaps that cap how high experience dims can go.

**One line:** The moat is finally real — 3 classes fire on genuine BYOK extraction with zero FPs and byte-identical isolation — but recall is stochastic, one flag type has a broken anchor, flags can silently vanish, so a pro keeps her manual bible open in the next tab. **Headline: 6.5.**
