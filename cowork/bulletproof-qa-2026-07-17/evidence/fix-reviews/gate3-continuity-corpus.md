# Gate 3 — Continuity-net precision/recall seeded corpus

**Verdict: MET (deterministic detection layer)** — with the live-Neo4j integration
portion honestly marked BLOCKED-ENV and the `location_conflict` detector proven
only behind its (default-OFF) env gate.

New test file (NO-COMMIT, tree left dirty):
`D:\Projects\wmb-pub\tests\unit\continuity-seeded-corpus.test.ts`

Gates: `npx tsc --noEmit` → exit 0. `npx vitest run` → **133 files / 1078 passed /
0 failed** (this file contributes 41; 0 regressions). The ZodError / "redis down" /
"Failed to extract entities" lines in the run are deliberate failure-path logs from
OTHER lanes' tests, all green.

---

## STEP 1 — Detection-surface map (pure vs Neo4j-gated)

**Entry point:** `runConsistencyChecks(bookId, userId?)` →
`src/lib/graph/graph-queries.ts:325` → returns `ConsistencyIssue[]`.

**Surfacing layer** (what a writer actually sees): `toContinuityFlags()` +
`continuityIssueSignature()` → `src/lib/continuity/continuity-flags.ts`. Only these
reach a writer:

| Flag type | Severity | Surfaced? | Default state |
|---|---|---|---|
| `dead_character_reappears` | critical | inline | ON |
| `timeline_violation` | critical | inline | ON |
| `relationship_contradiction` | major | book-level | ON |
| `location_conflict` | major | inline | **OFF (gated)** |
| `character_undocumented` | minor | — dropped by toContinuityFlags | ON |
| `orphan_plot_thread` | major | — dropped by toContinuityFlags | ON |

**Can detection run without live Neo4j and without an LLM? YES.**
`runConsistencyChecks` is pure Cypher via `withSession("READ", …)`. It is driven in a
unit run by mocking `@/lib/graph/neo4j-client` with a **faithful, query-text-driven
in-memory session** — the emulator inspects the *generated Cypher* to choose the
predicate (story-time `coalesce` vs narrating chapter; directed vs undirected
`PART_OF`; shared-ancestor requirement; same-chapter co-assertion; tenant guard). A
detection-logic revert changes the query text → the emulator evaluates the reverted
predicate → the corpus goes RED. This is the proven pattern already trusted in
`tests/unit/continuity-checks-rewire.test.ts`; my corpus reuses that emulator.

The **LLM extraction layer** (`entity-extractor.ts`) is BLOCKED-ENV (no API key) and
OUT OF SCOPE — I seed the graph STATE directly, downstream of extraction, and test
DETECTION only, exactly as instructed.

## STEP 3 caveats (checked first)

- **`location_conflict` is DEFAULT-OFF** — confirmed at `graph-queries.ts:39`
  (`isLocationConflictCheckEnabled()` gates on `ENABLE_LOCATION_CONFLICT_CHECK==="true"`;
  the `session.run` is skipped when off). Founder-decision "fix 8" pending. I did NOT
  re-enable it. It is measured in a SEPARATE gated block (flag ON) and excluded from
  the default precision/recall.
- **Existing corpus** — `continuity-checks-rewire.test.ts` holds fire/no-fire proofs
  (13 tests). My file is the distinct *labeled-corpus + measured P/R* artifact, not a
  duplicate; it reuses the same faithful emulator rather than a second, weaker one.
- **RC-3 upstream guards live at the UPSERT layer** (graph-builder), already covered:
  Fix 7a → `graph-event-name-canonicalization.test.ts`; Fix 7b →
  `continuity-graph-properties.test.ts`; Fix 7c →
  `graph-alias-merge-disambiguation.test.ts`. My corpus adds their *detection-layer*
  complement.

## STEP 2 — Corpus (32 default + 5 gated = 37 scenarios; 41 tests)

Each scenario = seeded graph state + ground-truth SURFACED flags; run through the real
`runConsistencyChecks → toContinuityFlags` pipeline; matched by `type + entity-set`.

**Default-config corpus (location_conflict OFF), by class:**
- `dead_character_reappears`: 8 TP, 8 TN
- `timeline_violation`: 3 TP, 3 TN
- `relationship_contradiction`: 3 TP, 4 TN
- cross-cutting: 2 TP (incl. unscoped tenant), 1 TN (foreign-tenant excluded, RC-6) + 1 clean-book TN
- **Total: 15 TP-bearing + 17 TN = 32 scenarios; 18 true-positive flags.**

Coverage of the required classes:
- **TP**: dead reappears present-time; killed-ch5-speaking-ch8 (the P3 hero case);
  posthumous intro then acts; multi-reappearance→single anchored flag (D-79);
  effect-precedes-cause loops; same-chapter allied+opposed.
- **TN**: appears BEFORE death; retelling with earlier story-time (RC-2); mentioned-only
  / no participation (D-19 precision); same-chapter-as-death; transformed≠dead;
  legitimate cause→effect; same-chapter LEADS_TO; evolving alliance; different-chapter
  co-assertion.
- **RC-3 detection-layer guards**: `TP-dead-08` alias-fold — one node with a canonical
  alias yields exactly ONE flag (aliases must not split identity into two phantom
  flags); `TN-dead-06` two DISTINCT same-surname characters — a live `Lord Vance`'s act
  is NOT attributed to the dead `Sera Vance` (the crater path — a silently-destroyed
  character — proven absent at the detection layer).

**Gated `location_conflict` corpus (flag ON):** 2 TP (sibling co-location; deeper-nested
siblings sharing an ancestor), 3 TN (nested containment; unrelated locations;
different story-time flashback) + 1 default-OFF proof (no fire on the true-conflict
topology when the flag is unset).

## Measured precision / recall

| Corpus | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| Default (flag OFF) | 18 | 0 | 0 | **1.00** | **1.00** |
| Gated `location_conflict` (flag ON) | 2 | 0 | 0 | **1.00** | **1.00** |

Asserted in-file: `mismatches==[]`, `fp==0`, `fn==0`, `precision==1`, `recall==1`,
and `tp>=15` (guards against a vacuously-green corpus).

## TDD RED-first proof (not vacuous)

Flipped `TP-dead-01`'s expectation to `[]` (claiming a real dead-reappearance is
clean). The suite went RED as designed — both the per-scenario test and the aggregate:
`AssertionError: expected [ 'dead_character_reappears::Corvin' ] to deeply equal []`
and `+ "FP TP-dead-01 …: dead_character_reappears::Corvin"`. This proves the detector
genuinely FIRES and the harness catches a wrong label. Reverted to GREEN (41/41).

## Detection bugs found

**None.** Every landed detector behaved correctly across all 37 scenarios. (Per the
task, a detection bug would have been reported here, not fixed in this lane.)

## Deterministically closed vs BLOCKED-ENV

- **CLOSED (deterministic, this run):** the full writer-facing detection+surfacing
  pipeline for `dead_character_reappears`, `timeline_violation`,
  `relationship_contradiction` (default config) and `location_conflict` (behind its
  gate) — precision 1.00 / recall 1.00 on a 37-scenario labeled corpus.
- **BLOCKED-ENV (honest split):** running the exact Cypher against a *live populated
  Neo4j* (no DB up in this unit run), and the *LLM extraction* that produces the graph
  state (no API key). Both are downstream/upstream of the detection layer this gate
  targets; neither is fabricated here.

## Gate verdict

**MET** for the continuity-net *detection* layer: deterministic seeded corpus, real
pipeline, measured precision 1.00 / recall 1.00, RED-proven non-vacuous, tsc clean,
0 regressions. Residual live-Neo4j integration + LLM-extraction remain BLOCKED-ENV and
are tracked separately — reported honestly rather than papered over.
