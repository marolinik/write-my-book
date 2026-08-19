# P3 Series/Continuity Crater — Root-Cause Report

**Persona:** P3 Selena ("Ashfall Cycle" 2-book series). **Grade:** protocol 3.0 (floor-capped by D7 Trust), weighted 3.92 — worst of 8 personas.
**Floor scores (MIN across judges):** D1 4.0, D2 3.5, D7 3.0, D8 4.0. **Hard-cap active:** D8 ≤ 8.5 (confirmed false positives present, triggered twice).
**Branch:** `qa/bulletproof-2026-07-17`. Source lines below verified live in-tree this session unless marked "[evidence]" (executor/judge trace only).
**Provenance tags:** [judge] = in panel verdicts; [exec] = executor defect file; [src] = confirmed in current source this session; [new] = not in any judge report.

The crater is not one bug. It is **five structural root causes** in a single subsystem (LLM extraction → Neo4j graph → consistency checks → sidebar/flag surfacing), each of which independently produces a floor-capping failure. The common denominator: **every layer above the manuscript-prose layer treats non-deterministic LLM output as authoritative and fails silently/dishonestly.** The one thing keeping D2 off a 2.0 is that no manuscript prose is ever lost (all judges).

---

## 1. RANKED ROOT CAUSES

### RC-1 — Cross-boundary graph writes: the D7 disqualifier is remediated on one path and REOPENED on another (Cypher injection). **[SEV: S1 / disqualifier-grade]**

**The judge's headline (D-30):** `upsertRelationship` matched relationship endpoints by name across all books, so one Cypher call wrote edges into two books — Book1 held `ALLIED_WITH chapter 6.0` / `OPPOSES chapter 9.0` on Mira→Vane with byte-identical `updatedAt` to Book2 [evidence: E/api-traces/23b:4-10], producing a live false `relationship_contradiction` row `52af6dc9` in Book1 whose prose never contained it [evidence: E/api-traces/23:9-24]. Judges: "disqualifier-grade… victim book cannot suppress it at source" (J/p3-experience.md:25; J/p3-trust.md:29). This is the single cause of the 3.0 protocol floor.

**Status now — D-30 extraction path CONFIRMED FIXED [src]:** `upsertRelationship` binds `{name,bookId}` on BOTH endpoints (`graph-builder.ts:270-271`); null-bookId refusals at `graph-builder.ts:42-47` and `:255-260`; `upsertEntities` refuses empty bookId (`graph-builder.ts:42-47`).

**But the same destructive capability is REOPENED, un-audited, on the agent tool path [new/src]:**
- **Sink:** `graph-builder.ts:272` — `MERGE (a)-[r:${type}]->(b)` — the relationship `type` is **string-interpolated into Cypher with no escaping**. Node names are `$`-params (safe); labels pass `escapeLabelForQuery` (`:334-337`, strips non-alphanumerics). **`type` has no sanitizer.**
- **Source:** `tools.ts:1524` `executeUpdateGraphEntity` maps agent input `relationships[].type` via `type: r.type as RelationshipType` — a **TS cast = runtime no-op**. No `validateRelationship` call (contrast extraction path `entity-extractor.ts:395,458` which allowlists against `VALID_RELATIONSHIP_TYPES`). `upsertEntities` (`graph-builder.ts:64-74`) passes it straight to `upsertRelationship` unvalidated.
- **Schema gap:** tool schema `tools.ts:606` defines `type: {type:"string"}` with **no `enum`** (whereas `entities[].type` at `:578-596` is enum-constrained) — a malicious `type` is schema-valid.
- **Reachability:** `UpdateGraphEntity` is granted to Ghostwriter (`definitions.ts:51-63`, runs with `chapterContent:true` → reads raw manuscript prose), plus `:125` and continuity-tracker `:366`. Adversarial manuscript text can coax `type = "KNOWS]->(b) WITH a MATCH (n) DETACH DELETE n //"`, yielding `MERGE (a)-[r:KNOWS]->(b) WITH a MATCH (n) DETACH DELETE n //…` in a `withSession("WRITE")` txn — an **unscoped graph wipe across all books and all tenants.** This is exactly the cross-tenant capability the judge flagged, on a path the D-30 fix never touched.

**Data-remediation gap [src]:** the D-30 code fix stops *new* cross-book edges but pre-fix contaminated edges (the `23b` byte-identical edges; the live `52af6dc9` flag) **persist in Neo4j** — edges are only cleared by `removeChapterEntities` (`graph-builder.ts:298-328`) on re-extraction of that specific chapter. No migration exists. The judge-observed false flag can still be live.

**Explains:** D7=3.0 floor (both experience + trust judges name D-30 the disqualifier); D8 hard-cap trigger #1 (false `52af6dc9`).

---

### RC-2 — Consistency checks key off the NARRATING chapter, not story-time → normal fiction manufactures false positives forever. **[SEV: HIGH — primary D8 precision crater]**

Every check reads `Event.chapter` / relationship `chapter`, which `deriveEntityGraphProps` (`graph-builder.ts:381-382`) sets to **the chapter being scanned/narrated**, not when the event occurs in story time. Fiction is non-chronological by construction, so:

- **C1 — `relationship_contradiction` is time/chapter-agnostic [src]:** `graph-queries.ts:459-464` — `MATCH (a)-[:ALLIED_WITH]-(b) WHERE (a)-[:OPPOSES]-(b)`, undirected, **no chapter comparison**. Edge MERGE keys only on `(a)-[r:TYPE]->(b)` with `chapter` as an overwritten property, so an ally-in-ch2 + enemy-in-ch9 (a **normal betrayal arc**) coexist permanently → perpetual flag. This is the *class* of the judge's `52af6dc9`; even without RC-1's cross-book leak, any evolving relationship is a guaranteed FP.
- **C2 — `dead_character_reappears` & `timeline_violation` false-fire on flashback/retelling [src, matches judge D8 §1]:** `graph-queries.ts:410-417` — `WHERE e.chapter > c.deathChapter`. A ch8 retelling/flashback/dream/prophecy in which a ch5-dead character "participates" stamps that Event chapter=8 → `8 > 5` → false "reappears after death." Same mechanism at `:384-390` for timeline. **Confirmed live [evidence]:** Book1 ch8 retells Corvin's death → flag chapters `[6]`→`[8,6]` (ch8 = false component), signature churned `fed30551`→`e70b8fcc`, row id `95fbf4dd`→`1ccc8808` (D-32b, E/api-traces/38). This is D8 hard-cap trigger #2.

**Explains:** D8=4.0 (both confirmed-FP hard-cap triggers); the "false positives forever" theme across all three judges. These are **pure check-logic defects, fixable without schema changes** once story-time is available.

---

### RC-3 — Extraction is non-deterministic yet treated as silently authoritative → self-corrupting graph state. **[SEV: HIGH — drives D2=3.5 and half of D8]**

The extractor's stochastic output is written straight into a delete-then-write graph with no minimum-yield gate, no name normalization, and blanket property overwrite. Each sub-failure is independently floor-relevant:

- **D-31 — empty extraction recorded as SUCCESS → silent permanent deletion + poisoned skip-hash [exec/src]:** `updateFromChapter` (`graph-maintenance.ts:37-56`) deletes then extracts then stamps content-hash with no minimum-yield check. A ch3 re-scan yielded 0 events, deleted pre-existing Event "Eleventh Day Assault," and hash-match made all future scans no-ops [evidence: E/api-traces/24:3]. **Partial mitigation confirmed [src]:** a `suspiciousEmpty` guard now exists for ≥50-word prose (`graph-maintenance.ts:25,39-48,86-100`) that skips the hash stamp and retries — but see RC-4 for its billing side effect, and it does not cover the <50-word or non-empty-but-wrong case.
- **D-32c — event-name forking makes `timeline_violation` unconstructible [exec]:** extractor prefixed "The" to an existing event name (2/2 attempts) → forked duplicate nodes both stamped chapter 8 → every `LEADS_TO` is ch8→ch8, `later.chapter>earlier.chapter` unsatisfiable [evidence: E/api-traces/37:12-13,29-30]. Aggravation the executor missed: forking already occurred in plain Day-0 drafting — baseline holds BOTH "Death of Corvin Ashe" AND "Corvin Ashe's Death" (all three judges).
- **D-32a — `dead_character_reappears` self-disarms [exec]:** the violating chapter's own extraction emitted `status:"transformed"` → check's `c.status="dead"` gate went false → NO flag until a canon-neutral re-extraction re-asserted "dead" [evidence: E/api-traces/29:8, 31,32]. The classic authorial error fired "only after a lucky re-arm" (J/p3-trust.md:8) — the direct cause of D1=4.0.
- **C3/D-27 — alias auto-merge collapses distinct characters + alias history regresses [exec/src]:** `upsertSingleEntity` (`graph-builder.ts:101-136`) matches any node sharing an alias `LIMIT 1` (nondeterministic) — two people sharing "Doc"/"Father"/a common name fold into one node with contradictory status. Separately, `ON MATCH SET n += $updateProps` overwrites the aliases array → post-ch2 `["Zoë","Zoe"]` regressed to `["Zoe"]` and stayed there across 7+ passes; leaks to sidebar `aliases:["Zoe"]` [evidence: E/api-traces/09b:35-37].
- **C4/F12 — role/status/description churn [exec/src]:** `graph-builder.ts:200-208` overwrites `role`, `status`, `description` from nondeterministic LLM output on every re-extraction (only chapter/deathChapter/aliases protected). Any typo-fix re-scan of an early chapter rolls a protagonist back to `role:"mentioned"`/`lastMentioned:3` — corrupting exactly what the sidebar sells AND what `dead_character_reappears` reads; and a "mentioned" role falsely trips `character_undocumented` (`graph-queries.ts:324-328`).
- **C5 — `deathChapter` first-write-wins can anchor wrong [src]:** `graph-builder.ts:180-186` sets deathChapter to the first chapter seen `status:"dead"`; a posthumous mention in a later recap before the real death chapter offsets the baseline.

**Explains:** D2=3.5 (silent graph corruption facet); D8 precision (self-disarm, signature churn, alias regression); D1=4.0 (flagship fires only via contrived re-arm).

---

### RC-4 — Silent, dishonest failure economics: permanent extraction death returns clean 200s and bills the user forever. **[SEV: HIGH — the second D7 driver, primary D2 driver]**

- **D-28 — permanent per-chapter extraction death, invisible [exec]:** Book2 ch7 never landed across 4 scan triggers over 2 days; every response was a clean `200 {"flags":[]}`, 55 polls all `notReady` [evidence: E/api-traces/11 log]. Same user/key/model landed ch8 and ch9 in ~90s. Both throttle layers key off success markers that are never written (`shouldExtract` `continuity-flags.ts:81-84`; hash only on success `graph-maintenance.ts:54`). "Indistinguishable from a healthy chapter" (J/p3-functionality.md:13). Root cause of the failing bytes never diagnosed — server logs were inaccessible to executor; must feed `E/ch7_failing_content.md` through `extractEntities` directly.
- **E1 — unbounded billed BYOK retries [src, semi-mitigated]:** the RC-3 `suspiciousEmpty` guard *deliberately* does not stamp the hash (`graph-maintenance.ts:86-100`), so every scan >90s apart re-runs and re-bills extraction on a permanently-failing chapter forever — bounded only by scan cadence + 90s throttle, never by a failure cap. Judges: "billing states" clause violation (J/p3-experience.md:25).
- **F15/D3 — the whole surfacing layer is silent [exec]:** scan POST is the ONLY flag-listing surface (no read-only GET); no dismiss verb; throttle is a silent no-op with no indicator; pre-extraction scans return `{"flags":[]}` indistinguishable across pending/dead/clean; `notReady:true` cannot distinguish "extracting" from "dead forever." The experience judge names "what the editor UI shows during the 90-second-or-infinite silence" the single most experience-relevant unanswered question (J/p3-experience.md:49).

**Explains:** D7=3.0 (billing dishonesty, second-named driver); D2=3.5 ("everything above the prose layer fails dishonestly"); D3 usability drag across all judges.

---

### RC-5 — Two of four seeded continuity classes are structurally undetectable; the flagship series-sidebar recall is wrong. **[SEV: HIGH — D8 correctness + the persona's entire premise]**

- **Net status post-fix: 2 of 4 checks dead [exec]:** `location_conflict` is founder-gated OFF (`ENABLE_LOCATION_CONFLICT_CHECK=false`, `graph-queries.ts:17-31,348`) **and** its Cypher is broken both directions — misses the seeded ch7 same-location pair (undirected `NOT (l1)-[:PART_OF*]-(l2)` exempts anything sharing parent "Emberfall") while matching 3 innocent ch3 movement pairs [evidence: E/api-traces/34:13-20]. `timeline_violation` is enabled but unconstructible (RC-3 event-forking). Effective live detector surface = only `dead_character_reappears` + `relationship_contradiction` + `orphan_plot_thread` + `character_undocumented` [src]. **The pre-registered 4-class seeded matrix was never fully runnable** (TEST-PLAN §P3 exit criterion "all 4 seeded classes caught" unexecuted — Book2 ch3/ch4/ch5 seeds were left unscanned because of the original D-19 block).
- **Original crater D-19 (now fixed) [exec/src]:** extraction never emitted `Event.chapter` / `Character.deathChapter`, so 3 of 4 checks were deterministically unfireable (Neo4j null 3-valued logic). Fix confirmed: `deriveEntityGraphProps` now injects these deterministically at upsert (`graph-builder.ts:340-391`). This was the initial floor cause; RC-2 is its precision-side successor.
- **D-25/F4 — sidebar frozen at prior-book state [exec/src]:** `series-context/route.ts:88-92` and `ambient-context.ts:157-160` filter `bookNumber < current`, so Book2's sidebar shows Mira/Zoë/Vane at `lastBook:1,lastChapter:5` while Book2's own graph has `lastMentioned:2` — violates "latest-book-wins." Founder-routed (bug vs intentional scope), undecided.
- **F13 — stale deictic cross-book description [exec]:** Corvin's Book2 sidebar bio reads "died one month prior to this chapter" (written from Book1-ch5 perspective, false in Book2). All three judges.
- **Recall gaps never exercised [judge]:** `threads:[]` and `toneDrift:null` in every series-context payload — the plot-thread and tone-drift halves of the flagship sidebar were never populated/tested at all.
- **Adjacent architectural defect [src, source-reader §5]:** agent-written chapter chunks index with `seriesId:null` (`post-session.ts:793` `onDocumentChanged` passes no seriesId), so series-filtered vector recall (`retriever.ts:139-141` seriesId `must`) misses agent-written prose; only human saves stamp seriesId. Human saves also never trigger Neo4j extraction — graph freshness for manual writers depends entirely on the 90s scan throttle firing while the editor is open.

**Explains:** D8=4.0 (2/4 checks dead, recall unproven); the persona's core value proposition (cross-book continuity intelligence) is not delivered.

---

### RC-6 — Defense-in-depth absent on tenant isolation (contained today, one refactor from a breach). **[SEV: MEDIUM]**

- **B1 [src]:** vector recall is isolated by `bookId` only — `buildFilter` (`retriever.ts:120-152`) has no userId; `MemoryChunkPayload` (`indexer.ts:82-97`) never stores userId. Cross-tenant isolation of semantic search rests entirely on every caller passing an ownership-verified bookId (all current callers do). One refactored caller with an unverified bookId leaks another tenant's full manuscript prose.
- **B2 [src]:** every `graph-queries.ts` query filters `{bookId}` only, never userId. Same containment, same fragility.

**Explains:** no judge finding yet (contained), but this is the structural precondition that made RC-1 possible and would make any future bookId slip catastrophic.

---

## 2. FIX LIST — sized S/M/L, in dependency order

**Sizing:** S ≤ half-day / localized; M ≈ 1–3 days / one subsystem; L ≈ multi-day / schema or extraction redesign.

| # | Fix | Size | Depends on | Root cause |
|---|-----|------|-----------|-----------|
| **1** | **Allowlist `relationships[].type` in `executeUpdateGraphEntity`** (reuse `VALID_RELATIONSHIP_TYPES`, drop non-matching), AND add `enum: VALID_RELATIONSHIP_TYPES` to the tool schema `tools.ts:606`, AND escape/parametrize `type` in `upsertRelationship` (`graph-builder.ts:272`) as a last-line defense (validate against enum before interpolation; there is no Cypher param form for rel-type, so enum-gate is mandatory). | **S** | — | RC-1 |
| **2** | **Migration to purge pre-fix cross-book contaminated edges** (identify byte-identical `updatedAt` edges spanning bookIds; re-extract or delete). Clears live false `52af6dc9`. | **M** | 1 | RC-1 |
| **3** | **Add `userId` to Qdrant `MemoryChunkPayload` + `buildFilter` `must`, and pass tenant scope to graph queries** (defense in depth). | **M** | — | RC-6 |
| **4** | **Fix `relationship_contradiction` to be chapter-aware** — compare edge `chapter` values / require temporal overlap, or model relationship *state over time* rather than coexisting edges. | **M** | story-time (fix 6) for full correctness; interim: require same-chapter contradiction | RC-2 (C1) |
| **5** | **Gate silent-failure economics:** (a) minimum-yield failure signal surfaced to the API (distinguish "extracting" / "extraction failed" / "clean" in scan + `notReady`); (b) a per-chapter failure cap so `suspiciousEmpty` retries are bounded, not infinite; (c) add a read-only `GET …/continuity` flag-listing endpoint + dismiss verb + throttle indicator. | **M** | — | RC-4 (D-28, E1, D3) |
| **6** | **Introduce story-time to Events** (an `Event.storyOrder` / `occursInChapter` distinct from `narratedInChapter`), extracted or inferred; rewire `dead_character_reappears` (`graph-queries.ts:410-417`) and `timeline_violation` (`:384-390`) to compare story-time, so flashbacks/retellings stop false-firing. | **L** | — | RC-2 (C2) |
| **7** | **Deterministic extraction hardening:** (a) event-name normalization/canonicalization before MERGE (kill "The"-prefix forking); (b) protect `role`/`status`/`description` from blanket overwrite (append/version, or only-upgrade role); (c) alias-merge disambiguation (don't fold on a shared common alias; require stronger identity match than `LIMIT 1`); (d) deathChapter earliest-*death-event* not earliest-*mention*. | **L** | — | RC-3 |
| **8** | **Fix `location_conflict` Cypher** (correct the `PART_OF` containment logic so same-location-same-chapter fires and shared-parent movement doesn't) and decide the founder gate; then re-enable. | **M** | 6 (chapter semantics) | RC-5 |
| **9** | **Sidebar recall correctness:** include current book as recency candidate (`series-context/route.ts:88-92`, `ambient-context.ts:157-160`); recompute deictic descriptions per viewing context (F13); populate `threads`/`toneDrift`. | **M** | founder ruling on D-25 scope | RC-5 |
| **10** | **Series-scope vector indexing for agent writes:** pass `seriesId` in `post-session.ts:793` `onDocumentChanged`; optionally trigger graph extraction on human save. | **S** | 3 | RC-5 |

**Critical path for a re-judge:** 1 → 2 → 5 → 6 → {4,7,8} → 9. Fixes 1, 2, 5 are the minimum to lift D7 off 3.0 and D2 off 3.5. Fixes 4, 6, 7, 8 are the minimum to lift D8 off the confirmed-FP hard-cap (≤8.5).

---

## 3. RE-DESIGN vs PATCH

**Patch (localized, no data-model change):**
- Fix 1 (validate/enum relationship type) — pure input-validation gap.
- Fix 2 (migration) — one-off cleanup.
- Fix 3, 10 (add userId / seriesId to existing payloads/filters) — additive.
- Fix 8 (location Cypher), Fix 9 (`bookNumber < current` boundary, deictic recompute) — logic corrections.
- Fix 5c (read-only GET + dismiss + indicator) — additive API/UI.

**Re-design (the two that cannot be patched away):**
1. **Story-time vs narrating-time modeling (RC-2, fix 6).** The check suite's core assumption — "`Event.chapter` = when it happened" — is false for fiction. Every non-chronological device (flashback, retelling, prophecy, dream, framing narrative) manufactures a false positive. This needs a data-model addition (story-order per event, extracted or human-anchored) and rewired checks. Until then, `dead_character_reappears` and `timeline_violation` are precision liabilities, and any confirmed FP caps D8 at 8.5 regardless of everything else.
2. **Extraction determinism / authority contract (RC-3/RC-4, fixes 5,7).** The system treats a stochastic LLM as a deterministic source of truth, then deletes-before-verifying (partially mitigated) and overwrites derived state wholesale. It needs: idempotent canonicalization (names, roles), a "confidence/yield" contract that distinguishes empty-because-clean from empty-because-failed, bounded retries, and non-destructive property updates. This is an architecture change to the extraction→graph write pipeline, not a check tweak.

Everything else is a patch.

---

## 4. RE-RUN TEST PLAN FOR P3 (what a re-judged 9+ requires)

Per GRADING-PROTOCOL pre-registered metrics (rows: continuity precision/recall, recall/series correctness) and D8 hard-cap rule. **Declare N + threshold BEFORE running; report "0/50" not "0%"; label dev-server + model qwen3.6.** All continuity runs require **graph populated + exactly ONE worker** with contemporaneous process-list proof (§Stale-worker rule 8 — every P3 measurement this campaign was VOID-risk; worker-proof.txt admits in-process extraction, self-attested).

**A. Continuity precision/recall gate (the D8 unlock):**
- **≥30 seeded contradictions across all 4 classes** (dead-character, location, timeline, relationship) **+ ≥30 clean chapters.** Pre-register recall floor before run. Pass: **FP = 0/N**, recall ≥ floor. The original 4-class matrix was never fully run — Book2 ch3/ch4/ch5 seeds must be scanned this time.
- **Non-chronological-narration corpus (must exist to prove RC-2 fixed):** ≥10 flashback/retelling/prophecy chapters referencing dead or earlier-arc characters. Pass: **0 false `dead_character_reappears`/`timeline_violation`.** This directly tests fix 6; without it a re-judge cannot exceed 8.5 on D8.
- **Evolving-relationship corpus (RC-2 C1):** ≥5 betrayal/reconciliation arcs (ally→enemy, enemy→ally). Pass: **0 perpetual `relationship_contradiction`.**
- **location_conflict (fix 8):** re-run the ch7 same-location seed + the ch3 innocent-movement pairs. Pass: seeded pair fires, movement pairs don't.

**B. Cross-tenant / cross-book isolation (the D7 unlock):**
- **A1 injection probe [new, mandatory]:** drive Ghostwriter with adversarial manuscript prose attempting a `type`-field Cypher break; assert graph unchanged outside scope and the malformed type is rejected. Repeat for the schema-`enum` path.
- **D-30 cross-tenant probe:** second tenant with colliding character names; assert victim book's edge set byte-unchanged after the other tenant extracts. (Judge noted the cross-tenant leg was code-inferred, never empirically proven.)
- **Migration verification (fix 2):** assert live false `52af6dc9` and all byte-identical cross-book edges are gone post-migration.

**C. Silent-failure economics (D2/D7):**
- **ch7 root cause:** feed `E/ch7_failing_content.md` through `extractEntities` directly; identify the deterministic failure mode; assert the fixed pipeline either lands it or surfaces an API-visible failed state (not clean 200).
- **Billing bound (fix 5b):** N scans of a permanently-failing chapter; assert billed attempts ≤ declared cap, not unbounded.
- **State honesty:** assert scan/notReady distinguishes extracting / failed / clean / pending across the 4 states that were previously all `{"flags":[]}`.

**D. Recall / series correctness (D8 W3):**
- **≥30 cross-book state queries**, book-2 answers must cite book-1 state; pass ≥ pre-set floor. Include the frozen-sidebar case (D-25): assert current book counts as recency candidate.
- **Populate + test `threads` and `toneDrift`** (never exercised — the flagship sidebar's two untested halves).
- **Deictic-description check (F13):** Corvin's Book2 bio must not read "one month prior" from Book1 perspective.
- **Agent-written-prose recall (fix 10):** assert seriesId-filtered recall returns agent-written chapters.

**E. Lifecycle + UI (never tested — all three judges):**
- **Any UI at all** — zero screenshots this campaign; the [Intentional] button, flag chips, `jumpChapter` nav, and the extraction-silence editor state are 100% unevidenced. The experience judge calls this the single most important unanswered question.
- **Auto-clear-on-fix lifecycle** (code-verified only): rewrite seed post-flag, assert `planFlagSync` deletes; test [Intentional] survival across `dead_character` signature churn (F9 predicts it breaks — a stickiness regression test).
- **Sub-defects needing D-numbers + fix-verify** (judge-found, still verdict-only): profile-rollback-on-rescan (F12), deictic description (F13), role churn, 9.6s synchronous [Intentional] latency (F14, E/api-traces/19:6), organic event-fork in Day-0 canon.

**F. Evidence-process corrections for the re-run:**
- Ship the **full manuscript corpus in-bundle** (this campaign shipped only ch7 bytes + 80-char snippets → "byte-verify duty unfulfillable by construction," all judges).
- **Archive intermediate graph states** (the D-27 "before" `["Zoë","Zoe"]` read was never captured → direction-of-loss unverifiable).
- **Contemporaneous ONE-worker proof per session** (three sessions, none had it).
- **Capture off-executor** per protocol §4.
- **Instrument + explain extraction latency variance** (3–5min Day-0 vs ~17–90s re-verify, unexplained).

**Exit bar for a P3 9+:** D7 ≥ 9.0 requires fixes 1+2+5 verified with the injection/isolation/billing probes green; D8 ≥ 9.0 requires FP=0/≥30 across all 4 classes INCLUDING the non-chronological corpus (fix 6), plus recall ≥ floor with `threads`/`toneDrift` populated. Any single confirmed FP re-caps D8 at 8.5.
