# P3 "Selena" — Series-Continuity Moat — REJUDGE SUMMARY

**Run:** 2026-07-20 · driven LIVE against `http://localhost:3002` as P3 (`user_qa_p3`, professional/active, real qwen3.6 OpenRouter BYOK) · victim tenant P4 (`user_qa_p4`).
**Method:** real HTTP CRUD + real qwen3.6 extraction through the shipped `updateFromChapter()` pipeline (the exact function the scan route calls) + direct Neo4j reads + the product's own `runConsistencyChecks()` + persisted `ContinuityFlag` rows + live `/continuity/scan` endpoint. No `src/` edits. One worker (proof attached). Nothing fabricated; the one stochastic miss (ch8) is recorded raw.

## Headline verdict
**P3 has moved OFF its 3.0 platform-MIN floor.** Every dominant driver of the D7=3.0 baseline is demonstrably closed on live, real-extraction evidence:
- The continuity checks that "never fired" now **fire end-to-end on real qwen3.6 extraction** (D-19).
- The cross-tenant contamination that broke writer trust is **gone** (D-30).
- Failure is **signaled honestly**, never a silent green (D-28).

## Baseline drag -> status

| Drag (baseline) | Status | Evidence |
|---|---|---|
| **D-19** checks never fire (Event.chapter / deathChapter never derived) | **CLOSED** | 15/15 Events carry chapter+occursInChapter; Dorn deathChapter=2. neo4j-reads/01_book1_graph_state.txt |
| dead_character_reappears + **D-32a** sticky-dead | **FIRES** | Dorn dead ch2, participates ch4; status stayed dead despite ch4 acting-alive. 01, persisted 06 |
| timeline_violation + **D-32c** canonicalization | **FIRES** | Ritual(ch6) -LEADS_TO-> Great Fire(ch1), same node reused. 01, persisted |
| relationship_contradiction | **FIRES** | ALLIED_WITH+OPPOSES (Kira,Vael) same ch5. 01, live-persisted 06 |
| **D-30** cross-tenant / cross-book contamination | **CLOSED** | P3 OPPOSES write leaves P4 victim byte-identical (0 leak), 0 cross-book edges, 0 false flags. 03_d30_isolation.txt |
| **D-27** alias union durable | **INVARIANT PASS** (union never overwrites); live diacritic PRIMARY-name forking is a low residual | 07_controlled_probes.txt (probe 1) + OBS-2 |
| **D-28 / D-31** honest partial graph | **PASS** (hard-failure honesty); D-31 empty-subclass not reproduced | 07 (probe 3) |
| **location_conflict** (founder-ruled OFF) | **OFF by default; correct behind gate** | 07 (probe 2) |
| **D-25** series-context scope | **Per ruled scope** (prior canon incl. dead Dorn surfaced; threads prior-only) | neo4j-reads/05_series_context.txt |

## What PASSED (demonstrably closed)
- **D-19** deterministic derivation of Event.chapter/occursInChapter + Character.deathChapter.
- **dead_character_reappears**, **timeline_violation**, **relationship_contradiction** — all three fire via the product's runConsistencyChecks on the REAL extracted graph, and all three persist as active ContinuityFlag rows through the live HTTP scan endpoint.
- **D-32a** sticky-dead, **D-32c** canonicalization, **DIES_IN** death reification.
- **D-30** cross-tenant/cross-book write isolation — the trust check that drove D7=3.0.
- **D-27** union-not-overwrite invariant (controlled probe against the real fixed upsertEntities).
- **D-28** failed-extraction honesty (no silent green, no hash stamp, no fabricated/partial graph).
- **location_conflict** gate correctness (OFF default, fires only when explicitly enabled).

## What still needs attention (raw; neither is a trust/data regression — see defects.md)
- **OBS-1 (low-med):** relationship edges store a single last-write .chapter; a later re-assertion of one edge in a different chapter can dissolve an earlier same-chapter relationship_contradiction. Detection-completeness gap, not data loss. Observed live.
- **OBS-2 (low):** cross-chapter diacritic variance (accented vs unaccented "Zoe") can fork into two Character nodes when the model uses each spelling as a PRIMARY name (conservative fold declines). Union within a node is intact; series-canon dedup of accented names is imperfect.

## Not exercised (honest)
- D-31 suspicious-empty subclass (model runs, yields nothing on substantive prose) — not reproduced; every real extraction yielded. Auth-spoof tenancy attempts out of moat scope.

## Bottom line for re-scoring
On this fresh, independent, live bundle the series-continuity moat delivers its core promise: **it catches the four seeded contradiction classes it is allowed to catch, it does not contaminate other writers' books, and it does not lie about failure.** The remaining items are completeness polish (OBS-1/OBS-2), not the trust-breaking craters that produced the 3.0 floor. P3 should score materially above its 3.0 platform-MIN.
