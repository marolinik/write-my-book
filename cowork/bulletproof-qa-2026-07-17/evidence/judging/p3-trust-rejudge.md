# P3 "Selena" — Rejudge Verdict (Trust + Manuscript-Intelligence lens) — 2026-07-20

Blind, adversarial (assume curated, break byte-level). Rubric + `evidence/p3-selena-rejudge/` only. Headline (MIN-over-floors): **6.5**; trust-weighted impression ≈ 7.4.

## Per-dimension scores
- **D1 Functionality — 7.5.** All 30 HTTP traces 200/201; 8/8 extractions `updated:true`; all three classes fire+persist (`01`,`04`,`06`,`50`,`57`). Deduction: every extraction that landed data was an awaited script call to `updateFromChapter()` — route's fire-and-forget leg only observed early-returning/throttled (`55`), so "end-to-end through the endpoint" carries an asterisk.
- **D2 Reliability & data safety — 7.0.** Failure-honesty strong: `failed:true`, no contentHash, 0 fabricated nodes (`07` probe 3); throttle/state honestly surfaced. Against: (a) OBS-1 — contradiction flag silently vanishes after unrelated later edit (`04` 2/3); (b) a successful extraction wrote **false canon** (DEF-A) with no confidence marker.
- **D3 Usability — NO-EVIDENCE.** API payloads only.
- **D3b Ergonomy — 6.5.** Flags carry severity/description/jumpChapter/anchor; envelope carries reason/retryEligibleAt. But relationship_contradiction ships `chapterNumber:0, jumpChapter:null, anchor:null` (`57`) — dead jump affordance.
- **D4 Onboarding — NO-EVIDENCE.**
- **D5 Performance feel — 6.5.** First hits 6.7–7.1s (`50`,`51`), series-context 5.9s (`52`) — plausibly dev cold compile; warm 207–391ms; CRUD <500ms; extraction 40–160s async.
- **D6 Look & feel — NO-EVIDENCE.**
- **D7 Trust & safety — 8.0.** Isolation proven by RAW reads not prose: victim Kira↔Vael edge JSON-identical before/after P3 OPPOSES write, `victim OPPOSES count:0`, `cross-book edges:0`, `runConsistencyChecks(victim,P4)→0`, attack sequenced after victim existed, userIds correct (`03`). Not higher: "byte-identical" overstated (snapshot = seeded-pair edges only, not full-graph checksum); route-level tenancy (P3 HTTP read/scan vs P4 expecting 403/404) never attempted; all auth via e2e-bypass header. One vector, graph-layer only.
- **D8 Manuscript intelligence — 7.5.** All three flags byte-verified TRUE positives (ch2 kills Dorn/ch4 attacks; ch5 allied+opposed same hour; ch6 Ritual→Great Fire w/ ch1 node canonically reused `01` line 47). ZERO false positives (book2 0, victim 0, location silent). ch8 miss + OBS-1/2 honestly disclosed. Held below 8: DEF-A hallucinated death (FP time-bomb), OBS-1, diacritic fork, duplicate death nodes. 8.5 FP cap does not technically bind; graph quality does.
- **D9 Retention — 6.5.** Durable cross-book canon (dead Dorn into book2 ch1, `05`) + persisted flags real; evidence thin beyond.
- **D10 Delight — 6.5.** "Dorn Kappel — dead many years ago" unbidden in series context drafting sequel (`05`).
- **D11 Competitive edge — 7.5.** Per-chapter LLM extraction + deterministic checks + cross-book canon on cheap BYOK = demonstrated differentiator, residuals honestly on table.

## Defects (executor missed/misrepresented)
- **DEF-A (MEDIUM) — hallucinated death in canon.** `02` has `Zoë Rasmussen status=dead deathChapter=2` + Event `"Death of Zoë Rasmussen"`, but ch2 prose (`b2_put_content_ch2.json`/`_lib.ts:144`) says only she "had left her charts to the archive." Extraction invented a death. Mechanism for a future false dead_character_reappears + series-context reporting a living character dead. defects.md silent. [→ D-90]
- **DEF-B (LOW-MED)** — relationship_contradiction `chapterNumber:0/jumpChapter:null/anchor:null` (`57`, `06` "ch0"). Broken attribution/navigation for a whole flag class. [→ D-91]
- **DEF-C (LOW)** — "recorded raw" false for ch8 miss: `phase_e2b` clobbered `phase_e2`'s `06_*.txt`; only post-hoc scan `55` survives. SUMMARY line 4 overstates.
- **DEF-D (LOW)** — canon shallower than claimed: two nodes for one death (`"Death of Dorn Kappel"` occ=1 / `"Dorn Kappel's death"` occ=0), backstory death anchored occ=1 (`02`); D-32c works on book1 case, fails on word-order variant. "15/15 events" is book1-only; book2 has four occ=0 sentinels unmentioned.
- **DEF-E (INFO)** — E2b "legitimate edit" used `changeSource:"system"` to bypass CAS (`56`), not normal user save.
- **DEF-F (INFO)** — worker-proof PID chain unsupported by listed PPIDs; end-of-run shows one cli+loader pair, extraction script-serialized → one-worker holds in substance.

## "Suspiciously clean?"
**Shape yes, substance no.** 30/30 traces 200/201 — not one organic error/timeout/authz rejection; only the induced empty-keys probe fails. Missing: a P3 HTTP attempt vs P4's book expecting 403/404 (isolation is graph-layer only — route-level tenant enforcement untested here), an organic D-31 case, the clobbered ch8 raw file. Overstated headlines: "byte-identical", "recorded raw" (DEF-C), "15/15 events". BUT load-bearing claims survived byte-level checking: every flag maps to a seeded contradiction, no flag fired on clean data, D-30 before/after is real raw evidence. OBS-1/2 + ch8 miss are genuine honesty signals — earns more trust than a spotless bundle.

**One line:** Moat demonstrably works on real extraction and the cross-tenant crater is closed at the graph layer with raw before/after proof — but the run is a scripted happy path, route-level tenancy untested, and the graph quietly contains a hallucinated death the executor never surfaced. **Headline: 6.5.**
