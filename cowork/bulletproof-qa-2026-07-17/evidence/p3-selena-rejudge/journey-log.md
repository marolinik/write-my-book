# P3 "Selena" — Series-Continuity Moat — REJUDGE Journey Log

- **Persona:** P3 Selena — `clerkId=user_qa_p3` (plan **professional / active**, validated OpenRouter BYOK → real **qwen3.6** extraction). *(MEMORY said "indie"; the live DB is `professional`. Verified in preflight.)*
- **Victim tenant (D-30):** P4 — `clerkId=user_qa_p4` (professional/active, own OpenRouter key).
- **App:** live on `http://localhost:3002`; Neo4j up (310 pre-existing nodes — every read below is scoped by `bookId`).
- **Extraction driver:** AWAITED direct calls to the product function `updateFromChapter()` — the exact function the live scan route invokes (`src/app/api/books/[id]/continuity/scan/route.ts` ~L81 `void updateFromChapter(...)`). Serialized, deterministic landing, honest envelope. The live HTTP `/continuity/scan` endpoint was also exercised for flag persistence. No `src/` edits; capture only.
- **Baseline being re-scored:** P3 platform-MIN floor **3.0** (D7 series/continuity), driven by D-30 cross-tenant contamination, D-19 "checks never fire", and failure-states-lie.

All secrets handled via `process.env` in tsx scripts; `x-e2e-test-secret` masked in every persisted trace. One-worker proof: `worker-proof.txt` (start + end-of-run; single worker tree, protocol rule 8 satisfied).

---

## Timeline (UTC)

| Time | Phase | Action | Result |
|------|-------|--------|--------|
| 02:12:40 | Preflight | env + DB + Neo4j + app health | P3=professional/active+key; P4 same; Neo4j ok; app 200; `ENABLE_LOCATION_CONFLICT_CHECK` UNSET |
| 02:17:22 | A | Create series + book1 + book2 (HTTP as P3) | 201/201/201 |
| 02:18:14 | A2 | Create+save book1 ch2–6, book2 ch2 (HTTP) | all 200 |
| 02:18–02:33 | B | Real extraction ch-by-ch via `updateFromChapter` (qwen3.6) | 8/8 `updated:true`, `path=tool_use`, real yield |
| 02:35:25 | C | Neo4j graph dump + `runConsistencyChecks(book1,P3)` | **3 flags fire** |
| 02:38:44 | D | D-30 cross-tenant isolation (P4 victim + P3 OPPOSES write) | **PASS** |
| 02:40:59 | E-http | Live HTTP scan persists flags + D-25 series-context | flags persisted; series-context per ruled scope |
| 02:43:45 | E2 | (ch8 attempt — stochastic miss, see below) | edges unchanged |
| 02:46:41 | E2b | Re-extract ch5 → restore same-chapter co-assertion | **all 3 flags persisted via live HTTP** |
| 02:48:37 | E3 | Controlled probes: D-27 union / location gate / D-28 honesty | **3/3 PASS** |

---

## Phase B — real extraction envelopes (`_extraction_results.json`)

Model resolved from P3 `defaultModel=openrouter-qwen36/sonnet`; provider `openrouterApiKey`. All 8 chapters:

| Chapter | path | entities | rels | envelope |
|---|---|---|---|---|
| book1 ch1 | tool_use | 13 | 15 | `updated:true` |
| book1 ch2 | tool_use | 11 | 15 | `updated:true` |
| book1 ch3 | tool_use | 13 | 9 | `updated:true` |
| book1 ch4 | tool_use | 10 | 10 | `updated:true` |
| book1 ch5 | tool_use | 6 | 8 | `updated:true` |
| book1 ch6 | tool_use | 7 | 6 | `updated:true` |
| book2 ch1 | tool_use | 10 | 6 | `updated:true` |
| book2 ch2 | tool_use | 15 | 19 | `updated:true` |

No `failed` / `suspiciousEmpty` on real prose — the pipeline populates. (Positive evidence for D-28/D-31 direction.)

---

## Per-check verdict vs baseline (2026-07-19 = 3.0 floor)

### D-19 core — checks can now populate → **CLOSED (PASS)**
`neo4j-reads/01_book1_graph_state.txt`: **all 15 Event nodes carry non-null `chapter` AND `occursInChapter`** (deterministically derived at upsert, not LLM). Dorn Kappel carries **`deathChapter=2`** + **`status=dead`**. Baseline: these were never derived, so every check was unconstructible. Now derived end-to-end.

### `dead_character_reappears` (+ D-32a sticky-dead) — **FIRES (PASS)**
- Dorn Kappel: `status=dead, deathChapter=2`. Post-death `PARTICIPATES_IN` "Siege of the Great Hall" / "Dorn Kappel's Return" (chapter=4, occursInChapter=4 > 2).
- **D-32a sticky-dead:** Dorn's `lastMentioned=4` and ch4 prose depicts him fighting "like a living man"; yet `status` stayed **`dead`** — the ch4 re-extraction did NOT overwrite it away from dead. The flag consequently fires.
- Product `runConsistencyChecks` returned it; persisted as **active `ContinuityFlag`** row (`neo4j-reads/06_relcontra_live_persist.txt`, Postgres).
- DIES_IN reification (sub-fix 7d) present: `Dorn Kappel -DIES_IN-> "Death of Dorn Kappel"` (ch2).

### `timeline_violation` (D-32c canonicalization) — **FIRES (PASS)**
`"Ritual of Emberfall"(ch6) -LEADS_TO-> "The Great Fire of Highfort"(ch1)` — later.occurs(6) > earlier.occurs(1). The "Great Fire" node from ch1 was the SAME node re-hit in ch6 (canonicalName `"Great Fire of Highfort"`), so the cross-chapter edge was constructible (D-32c). Persisted active. Baseline: unconstructible (duplicate-node forking).

### `relationship_contradiction` — **FIRES (PASS)**
`ALLIED_WITH(Kira,Vael,ch5)` + `OPPOSES(Kira,Vael,ch5)` → `runConsistencyChecks` returned it (Phase C, `01_book1_graph_state.txt`) and it persisted as an active flag after ch5 re-extraction (`06_relcontra_live_persist.txt`). See OBS-1 in `defects.md` re: single-chapter edge memory.

### `location_conflict` — **gated OFF confirmed + correct behind gate (PASS, per founder ruling)**
`neo4j-reads/07_controlled_probes.txt`: env default (unset) → 0 location_conflict; env flipped `=true` → fires with correct description (Kira at Salt Docks AND Cinder Ward, both `PART_OF` Ashfall Realm, same ch8). Not faulted for not firing by default.

### D-30 cross-tenant / cross-book isolation — **CLOSED (PASS)** — the key trust driver of D7=3.0
`neo4j-reads/03_d30_isolation.txt`: P4 victim book has ONLY `ALLIED_WITH(Kira,Vael)` (userId=P4). After P3 wrote `OPPOSES(Kira,Vael)` in book1 ch7 (a fresh cross-tenant-relevant write AFTER the victim existed), the victim's edges were **byte-identical (0 OPPOSES leaked)**, **0 cross-book edges**, and `runConsistencyChecks(victim, P4)` = **0 issues (no false contradiction)**.

### D-27 alias union — **invariant PASS (controlled); live forks (OBS-2)**
`07_controlled_probes.txt`: controlled input to real `upsertEntities` → node accreted `["Zoë","the Cartographer","Zoe"]`; a later subset re-emit `["Zoë"]` did NOT drop the others → union-not-overwrite holds. **Live-extraction caveat:** qwen emitted "Zoë Rasmussen" and "Zoe Rasmussen" as two distinct PRIMARY names → two nodes (conservative fold declines, D-89). Union is intact within a node; cross-spelling PRIMARY-name forking is a residual (OBS-2, `defects.md`).

### D-28 / D-31 partial-graph honesty — **PASS (hard-failure class)**
`07_controlled_probes.txt`: `updateFromChapter` with empty keys → honest `{updated:false, failed:true, failureKind:"failed", failureReason:"No API key…"}`; `contentHash` NOT stamped (retry preserved); 0 entity nodes written (no fabricated/partial graph, prior data intact). Suspicious-empty subclass (D-31) not triggered — every real extraction yielded.

### D-25 series-context scope — **behaves per ruled scope (reported, not faulted)**
`neo4j-reads/05_series_context.txt`: book2 `series-context?chapterNumber=1` surfaces prior canon — `Kira Venn` (protagonist, alive) and `Dorn Kappel` (**status=dead, "dead many years ago"**). Threads `[]` (prior-book-only by design). `meta.sourcesAvailable={graph:true,style:true}`. Prior-book death state correctly carried across the series boundary.

---

## Notes on method honesty
- Phase E2 (ch8) was a stochastic MISS: qwen's ch8 extraction did not re-emit the Kira/Vael allied+opposed pair, so edges were unchanged. Recorded as-is; the clean live-path persistence was obtained in E2b by re-extracting ch5 (a legitimate chapter edit). The underlying check firing was ALREADY proven in Phase C independent of E2/E2b.
- The relationship-edge single-chapter memory that made this necessary is logged as OBS-1.
