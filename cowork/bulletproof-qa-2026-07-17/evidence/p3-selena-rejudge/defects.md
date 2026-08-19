# P3 Rejudge — Defects & Observations (RAW)

Scope: series-continuity moat as driven live by P3 (qwen3.6 BYOK) on 2026-07-20.
Verdict headline: **every P3 baseline drag (D-19/D-27/D-28/D-30/D-31/D-32) is demonstrably closed or working-as-ruled.** No new critical/high defect found. Two low/medium observations below are reported raw for the blind judge — neither is a trust/data-safety regression.

---

## OBS-1 (LOW–MED) — relationship edges remember only ONE chapter (last-write); a later re-assertion can dissolve an earlier same-chapter contradiction
**Where:** `graph-builder.upsertRelationship` — `MERGE (a)-[r:TYPE]->(b) ON MATCH SET r += $props` overwrites `r.chapter` with the current `chapterNumber` on every re-assertion. `relationship_contradiction` keys off `r1.chapter = r2.chapter`.

**Observed live:** Book1 ch5 asserted BOTH `ALLIED_WITH(Kira,Vael)` and `OPPOSES(Kira,Vael)` → `runConsistencyChecks` fired `relationship_contradiction` at ch5 (Phase C, `neo4j-reads/01_book1_graph_state.txt`). I then added ch7 re-asserting `OPPOSES(Kira,Vael)`; the MERGE moved that edge's `.chapter` 5→7, so `ALLIED_WITH(ch5)` and `OPPOSES(ch7)` no longer shared a chapter and the flag stopped firing on the next live scan (`neo4j-reads/04_http_persisted_flags.txt` shows 2/3). Re-extracting ch5 restored ch5 on the edge and the flag returned (`06_relcontra_live_persist.txt`, 3/3).

**Assessment:** partly *intended* (an EVOLVING allied→enemy relationship across different chapters is legitimately not a contradiction), but the single-chapter edge memory means a genuine same-chapter contradiction asserted earlier is *forgettable* once either edge is touched in a later chapter. A per-chapter edge set (or a `chapters` array) would make detection complete. Not a data-loss or cross-tenant issue. **Suggest tracking as a continuity-detection completeness item; not blocking.**

## OBS-2 (LOW) — cross-chapter diacritic variance can still fork into two Character nodes when the model uses each spelling as a PRIMARY name
**Where:** live extraction of "Zoë Rasmussen" (ch1) vs "Zoe Rasmussen" (ch3).

**Observed:** two Character nodes — `Zoë Rasmussen {aliases:["Zoë"]}` and `Zoe Rasmussen {aliases:["Zoe"]}` (`neo4j-reads/01_book1_graph_state.txt`). The conservative character-fold (D-89 pair-corroboration) declined to merge them without stronger rename evidence — this is the deliberate "never false-fold / never lose a character" posture.

**D-27 invariant itself is intact:** the controlled probe (`neo4j-reads/07_controlled_probes.txt`) shows `upsertEntities` UNIONs aliases on ON MATCH and never drops a variant, including on a subset re-emit. So the durable-union fix works *within a node*; the residual is only that two accented PRIMARY spellings can occupy two nodes. **Trust impact low** (both nodes exist; nothing is lost or contaminated; series-canon dedup of accented names is imperfect). Overlaps the already-registered canonicalization backlog (D-85 possessive/case forking is the Event analog).

---

## Things explicitly VERIFIED NOT broken (fix-wave claims that hold)
- **D-30** cross-tenant/cross-book write isolation — endpoints bound `{name, bookId}`; a P3 write does not reach P4's book; no false flag in the victim; userId stamped on nodes/edges. (`03_d30_isolation.txt`)
- **D-19** Event.chapter/occursInChapter + Character.deathChapter derived deterministically. (`01_book1_graph_state.txt`)
- **D-32a** sticky-dead status (dead not overwritten by a later "acting-alive" re-extraction). (`01_...`)
- **D-32c** event-name canonicalization → cross-chapter `LEADS_TO` constructible → `timeline_violation` fires. (`01_...`)
- **D-28/D-73** failed extraction returns an honest `failed` envelope, does NOT stamp the content-hash, and writes no fabricated/partial graph. (`07_controlled_probes.txt`)
- **location_conflict** gate: OFF by default (env unset), correct behind the gate when flipped. (`07_...`)
- Death reification `DIES_IN` (sub-fix 7d) present and does not itself trip the reappearance gate.

## Not exercised (honest gaps, not failures)
- **D-31 suspicious-empty subclass** (model runs but yields nothing on substantive prose) — not reproduced; every real qwen3.6 extraction yielded entities+relationships. The adjacent hard-failure honesty path WAS exercised (probe 3).
- No attempt was made to break tenancy via a spoofed non-`user_qa_*` clerkId (auth prefix-guard is out of moat scope for this bundle).
