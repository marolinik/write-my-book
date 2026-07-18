# P3 "Selena" — Journey Log (series continuity / "the moat")

Persona: fantasy series author drafting book 2 without contradicting book 1. Auth:
`x-e2e-clerk-id: user_qa_p3` (professional plan, validated BYOK qwen3.6 via OpenRouter).
All timestamps 2026-07-18. Worker proof: `worker-proof.txt`.

**Environment note (per team-lead, 2026-07-18):** `user_qa_p3` carries 7 pre-existing empty
leftover series from prior 2026-07-17 harness testing (5x "P3 Legit Series &lt;timestamp&gt;",
2x "Selena Saga" — all TRILOGY, 0 books). These predate this journey; confirmed via independent
read-only recon that no writes were made by this executor or any sibling agent to those series.
Excluded from all "my series" assertions below; not deleted (retained as earlier tier-gate test
evidence per team-lead instruction). This persona's own series/book names ("The Ashfall Cycle",
"Emberfall QA P3", "Cinderwake QA P3") are distinct from all 7 fixture names, so no collision risk.

Resource IDs (see `p3_state.json` in scratchpad for the machine-readable copy):

- Series "The Ashfall Cycle" (TRILOGY): `8d5e94c0-c175-4f50-97f4-29f4e09b9b89`
- Book 1 "Emberfall QA P3": `fd60e1d4-37c5-4c11-92a1-586af638224a`
- Standalone "Standalone QA P3" (step 5a): `34cd7b88-94a7-47e5-8374-f5d4799fa02a`

## Step 1 — Day-0: Book 1 canon (5 chapters)

Created series (TRILOGY) + Book 1 in it. Wrote 5 chapters (~500-700 words each, deliberately
shorter than the 800-1200 target to conserve single-worker LLM extraction budget across the full
6-step mission — no canon element was cut for length) with:

- Named cast: Corvin Ashe (protagonist, rebellion leader), Mira Thorne (scout/second),
  Zoë Rasmussen (healer, alias "Zoe" — used in ch2/ch4 dialogue, deliberate diacritic-drop test),
  Kestrel Vane (antagonist, Ashen Legion commander).
- Locations: Ashfall Gate, Cinder Ward, Salt Docks, Cindermoor Bridge.
- Timeline markers: "tenth day of the siege" (ch2), "eleventh day" / Corvin's death (ch3),
  "two weeks after" (ch4), "one month after" (ch5).
- Unambiguous on-page death: Corvin Ashe dies in chapter 3, explicit cause (spear wound),
  explicit burial at Cindermoor Bridge.
- Relationships: Corvin ALLIED_WITH Mira/Zoë, Kestrel Vane OPPOSES Corvin/the rebellion.

All 5 `POST .../chapters` + `PUT .../content` calls succeeded first try (traces
`api-traces/03_create_ch{1-5}.json`, `04_put_content_ch{1-5}.json`).

### Extraction verification (chapter 1)

`POST .../continuity/scan?chapterNumber=1` → `200 {"flags":[]}` (expected — the same request's
consistency-check reads graph state from *before* the fire-and-forget extraction lands; this is
architectural, not a bug, confirmed by code read of the scan route). Polled Neo4j directly until
entities appeared. Landed correctly:

- **Character** nodes: Corvin Ashe, Mira Thorne, Kestrel Vane, Zoë Rasmussen — all with
  well-formed `role`, `description`, `status`, `personality`, `physicalTraits`,
  `firstAppearance:1`, `lastMentioned:1`.
- **Location** node: Ashfall Gate (`locationType:"building"`).
- **Event** nodes: "Preparation for Assault", "First Assault on Ashfall Gate", "Corvin's Arm
  Wounding" — well-formed `significance`, `description`, `timelinePosition`, `firstAppearance:1`
  — **but no `chapter` property on any Event node.** This is the trigger for filing **D-17**
  (see `defects.md`): `location_conflict` and `timeline_violation` require `Event.chapter`
  numerically, which the extraction prompt never asks the LLM to produce and nothing in the
  pipeline derives — those two checks are structurally incapable of firing regardless of how the
  seeded-contradiction prose in step 3 is written. Confirmed by direct Cypher inspection of
  `runConsistencyChecks()` (`src/lib/graph/graph-queries.ts:324-438`) cross-referenced against
  `EXTRACTION_GUIDANCE` (`src/lib/graph/entity-extractor.ts:97-102`).
- **Relationships**: `PART_OF` (locations/factions), `KNOWS`, `OPPOSES`, `ALLIED_WITH`, `OWNS`,
  `LOCATED_AT`, `PARTICIPATES_IN` — all correctly populated with `chapter:1` (this property IS
  reliably present on relationships, injected by application code in `upsertRelationship()`, not
  LLM-derived — the one part of the "chapter" story that works).

### Chapter 2 — alias merge (CONFIRMED PASS)

Chapter 2 (plain "Zoe" spelling in dialogue) extracted cleanly. Direct Neo4j read: exactly **one**
`Zoë Rasmussen` Character node exists, `aliases: ["Zoë", "Zoe"]`. No duplicate node created — the
alias-check-before-create logic in `upsertSingleEntity()` works correctly in practice. Genuine
positive finding for the moat feature.

### Chapter 3 — on-page death (CONFIRMED, D-19 evidence)

Post-extraction direct Neo4j read of Corvin Ashe's node:

```json
{"status":"dead","lastMentioned":3,"firstAppearance":1,"aliases":["Corvin"],
 "name":"Corvin Ashe","role":"supporting", ...}
```

- `status` correctly flipped `"alive"` → `"dead"` after the chapter 3 death scene. **PASS** — this
  part of extraction works.
- **No `deathChapter` property present anywhere on the node.** Empirically confirms D-19's
  prediction for this exact status-transition, not just by code/prompt analysis: the field is
  never written, so `dead_character_reappears` has nothing to compare `c.lastMentioned` against
  even in the one case (an actual death) where the check's premise is most directly satisfied.

### Chapters 4, 5 — landed; NEW FINDING: aliases array regresses (D-27)

Both chapters' extraction confirmed landed via direct Neo4j polling (Monitor timed out on both —
same latency pattern as before, resolved via one-shot follow-up query, not re-arming): all three
main characters at `lastMentioned:4` then `lastMentioned:5`, Corvin's `status:"dead"` persisted
correctly across both.

While re-checking Zoë Rasmussen's node (`WHERE c.name CONTAINS 'Rasmussen'`, routing around a
shell/unicode escaping issue with the literal diacritic string), found her `aliases` array had
regressed from `["Zoë", "Zoe"]` (confirmed after ch2, above) to **`["Zoe"]` only** — "Zoë" itself
silently dropped. Neither ch3 nor ch4 nor ch5's prose re-uses the plain "Zoe" spelling except
ch4's dialogue; ch5 uses only "Zoë". Traced to `upsertSingleEntity()` in `graph-builder.ts`: the
safe additive alias-union path only fires on a *rename* (incoming name differs from the matched
node's canonical name); a recurring, consistently-named character instead falls through to the
exact-name `MERGE ... ON MATCH SET n += $updateProps` path, where `updateProps.aliases` is built
fresh from *that chapter's own* extraction and Neo4j's `+=` overwrites (does not union) the
property. Filed as **D-27** (`defects.md`) — genuine data-integrity gap in the moat's alias
tracking, distinct from D-19/D-20. The original ch2 no-duplicate-node PASS still stands; this is
narrower (array contents, not node identity).

### Series-context sidebar architecture (resolves an open question, not a defect)

`GET /api/books/{book2Id}/series-context?chapterNumber=1` initially returned
`{"characters":[],"threads":[],"toneDrift":null,"meta":{"notReady":true,...}}` despite Book 1
already having 4 richly-populated Character nodes. Traced via `src/lib/series/ambient-sources.ts`:
`getOnStageNames(bookId, chapterNumber)` calls `getChapterEntities(bookId, chapterNumber)` — it
reads the **current book's own** extraction for that chapter to determine who is on stage, and
only *then* enriches each on-stage name with prior-book history via `getPriorCharacters`. Book 2
chapter 1 had not yet been scanned at the time of that call, so the on-stage set was empty and
nothing could be enriched — `notReady:true` is the route correctly reporting "current chapter not
yet extracted," not a bug in prior-book character surfacing. Re-checking after Book 2 ch1 is
scanned is the correct next step, not a workaround.

## Step 2 — Book 2 sidebar accuracy (post-scan)

Book 2 chapters 1-2 scanned (extraction landed, direct Neo4j poll). Re-queried
`GET /api/books/{book2Id}/series-context?chapterNumber=2`:

```json
{"series":{"title":"The Ashfall Cycle","seriesType":"TRILOGY","currentBookNumber":2},
 "characters":[
   {"name":"Mira Thorne","matchedFrom":null,"lastBook":1,"lastChapter":5,"role":"protagonist","status":"alive",...},
   {"name":"Zoë Rasmussen","matchedFrom":null,"lastBook":1,"lastChapter":5,"role":"supporting","status":"alive",...},
   {"name":"Kestrel Vane","matchedFrom":null,"lastBook":1,"lastChapter":5,"role":"antagonist","status":"alive",...},
   {"name":"Corvin Ashe","matchedFrom":"Corvin","lastBook":1,"lastChapter":5,"role":"mentioned","status":"dead",
    "description":"Late defender of Ashfall Gate, died one month prior to this chapter",...}
 ],"threads":[],"toneDrift":null,"meta":{"notReady":false,...}}
```

**Positives, confirmed PASS:**
- `notReady` correctly flips `true` -> `false` once Book 2's own chapter is extracted.
- role · status · last-seen (`lastBook`/`lastChapter`) present for every on-stage character.
- Alias-matching works cross-book: `matchedFrom:"Corvin"` proves Book 2's text used the alias
  "Corvin" and correctly resolved it to canonical "Corvin Ashe" from Book 1's graph.
- Diacritic byte-integrity confirmed: raw trace file (`api-traces/09b_...json`) has correct
  `"Zoë Rasmussen"` UTF-8; a garbled "Zo�" seen in one terminal `print()` was a Windows console
  codepage rendering artifact on my end, NOT a real API/data bug — verified by reading the file
  directly rather than trusting console output.

**New finding (D-25, possibly-intentional design gap):** Direct Neo4j query of Book 2's OWN
graph shows Mira/Zoë/Vane already have `lastMentioned:2` (fresher, independently-extracted Book 2
state) — yet the sidebar reports `lastBook:1, lastChapter:5` for all three, sourcing exclusively
from Book 1. Traced to `series-context/route.ts` querying `priorBooks` as strictly `bookNumber <
current`, and `ambient-context.ts`'s `buildAmbientContext` filtering `prior` the same way — the
current book is never a "last-known state" candidate, even when its own graph already has more
current data. Filed as **D-25**, flagged (not asserted) as a bug given TEST-PLAN's literal
"latest-book-wins" / "last-known state" wording could reasonably be read either way.

*(continued below as each chapter's extraction lands)*

## Step 4 — Resumed-executor session (2026-07-18, second executor): fix-independent set A/B/C

Prior executor died mid-step-3; this session resumed from journey-log + traces + p3_state.json.
Scope per team-lead: ONLY the fix-independent verification set — (A) relationship_contradiction
lifecycle (the one architecturally-live check), (B) false-positive control, (C) re-scan throttle.
The three `Event.chapter`/`deathChapter`-dependent checks stay untested pending the D-19 fix apply
window (ch3/ch4/ch5 seeds deliberately left unscanned so their content stays OUT of the graph until
then). No direct Neo4j access this run — API surfaces only. No `src/` edits.

### State reconstruction (traces existed beyond the journey log's last entry)

api-traces showed the predecessor got further than logged: content PUT into all 9 Book 2 chapters
(`08_put_book2_content_ch{3-9}`), scans triggered on ch6 (x2) and ch7 (x2 — the second,
`scan_book2_ch7_flagcheck.json`, written 07:46:21Z today as their final act before standing down).
Read back all 9 chapters via `GET .../content` (response field is `markdown`): ch3/4/5 = the three
structurally-dead-check seeds (unscanned, correct), ch6 = explicit Mira Thorne ALLIED_WITH Kestrel
Vane, ch7 = explicit OPPOSES betrayal ("you and I are enemies again"), ch8/ch9 = clean controls.
Read-only probes (series-context, traces `10a`/`10b`): ch6 extraction LANDED (`notReady:false`,
on-stage Mira+Vane); ch7 extraction NEVER LANDED (`notReady:true`) — matching team-lead's handoff
intel (no OPPOSES edge in graph, characters still `lastMentioned:6`).

### A. relationship_contradiction — fire

- Trace `10` (07:56:45Z): POST scan ch7 → `200 {"flags":[]}` (pre-extraction read, expected);
  this was ch7 extraction trigger #3 overall. Polled read-only via series-context ~20 min
  (`11_poll_ch7_extraction.log`) → never landed.
- Trace `11` (08:07Z): retrigger (#4) after concluding #3 silently failed. 40 polls x 30s → never
  landed (08:27:50 last).
- Discriminator: trace `12` scan ch8 (benign, never-extracted) → its extraction landed in ~90s
  (`12_poll_ch8_extraction.log`, `12b` probe). Pipeline healthy ⇒ ch7's failure is
  chapter-specific. Filed as NEW DEFECT (ID pending team-lead — see defects.md, last entry);
  ch7's exact failing bytes preserved at `../ch7_failing_content.md` (974 chars, plain UTF-8,
  only non-ASCII is em dash E2 80 94, which sibling chapters that extract fine also use).
- Route-around: ch9 (clean-control seat, expendable per team-lead — B needs only one of ch8/9)
  rewritten with FRESH unambiguous OPPOSES prose (trace `15`, PUT v2: Mira declares Vane "the
  enemy of this city", Emberfall "declared open war on Kestrel Vane"; wording deliberately
  different from ch7's to further discriminate content-triggered extractor death). Trigger scan
  trace `16`; extraction landed ~90s (`16_poll`, `16b` probe, on-stage Mira+Vane).
- **Trace `17` — THE FLAG FIRED**: `type:relationship_contradiction`, `severity:major`,
  `entities:["Mira Thorne","Kestrel Vane"]`, `chapterNumber:0` (book-level),
  `jumpChapter`/`anchor` null, description exact ("marked as both ALLIED_WITH and OPPOSES each
  other simultaneously"). Signature `e687d7d1…` independently recomputed locally from the
  documented scheme `sha1("relationship_contradiction|Kestrel Vane,Mira Thorne|")` —
  byte-identical. **PASS.** The contradiction pair spans ch6 (ALLIED_WITH) + ch9 (OPPOSES), both
  edges produced by real qwen3.6 BYOK extraction, not seeded via Cypher.

### A. lifecycle — [Intentional] suppress + stickiness

- No "dismiss" route exists under `continuity/`; the only lifecycle verbs are **[Intentional]**
  (`POST .../continuity/intentional {flagId}`) and **fix-the-text** (`planFlagSync` deletes
  active flags no longer detected). Also NO read-only GET flags surface exists — the scan POST is
  the only way to list flags (UI hook `use-continuity-scan.ts` does the same). Design note, not
  filed as a defect.
- Trace `19`: intentional `{flagId:de0cc075…}` → `200 {"ok":true}`.
- Trace `20a`: re-scan ch9 unchanged → `{"flags":[]}` — suppressed despite both contradictory
  edges still present in the graph.
- Trace `20b`: scan ch6 (DIFFERENT chapter; checks are book-wide, so a non-sticky suppression
  would resurrect here) → `{"flags":[]}` — no resurrection. **Sticky suppression PASS.**
- Auto-clear-on-fix NOT exercised empirically (would require rewriting the seed chapters
  post-suppression; ch6/ch7 rewrites prohibited by team-lead, and the intentional row is by
  design outside the delete path). Code-verified only: `flag-sync.ts` `planFlagSync` deletes
  active-but-no-longer-detected flags; intentional signatures are filtered before sync so they
  are never deleted nor re-created.

### B. False-positive control

Benign ch8 (predecessor's clean control, canon-consistent infirmary scene): trigger scan trace
`12`, extraction landed 09:00:05Z (~90s), verdict scan trace `14` → `{"flags":[]}` with ch8's
content in the graph. ZERO false positives. (The graph at that moment also contained ch6's
ALLIED_WITH edge — still zero flags, correctly: the contradiction requires BOTH edge types.)
**PASS.**

### C. Re-scan throttle / dedup

- Weak form (no active flag), traces `13a`/`13b`: back-to-back scans of unchanged, extracted ch6
  ~1s apart: 200/200, both `{"flags":[]}`, 188/219 ms. No 429.
- Strong form (ACTIVE flag present), traces `18a`/`18b`: back-to-back scans of unchanged ch9:
  both return the SAME single flag with the SAME row id `de0cc075…` (row identity preserved —
  not delete/recreate), zero duplicates. No 429.
- Observed throttle behavior: **silent no-op, not 429** — the response carries no "throttled"
  indicator. Two protection layers (code-read: `scan/route.ts:18,44-45` +
  `graph-maintenance.ts:29-34`): 90s Chapter-node timestamp throttle, then content-hash skip
  inside `updateFromChapter`. For unchanged content this held (no observable re-extraction).
  CAVEAT → see the new defect: for a chapter whose extraction NEVER SUCCEEDS, both layers key off
  success markers that never get written, so every scan re-fires a billed LLM attempt — the
  throttle structurally cannot engage there.
- Duplicate flags on unchanged content: NONE observed (and structurally prevented: sha1 signature
  upsert + `bookId_signature` unique constraint).

### Step-4 verdict (this session's scope)

**A PASS** (fire + suppress + sticky on real BYOK extraction output; routed around ch7) ·
**B PASS** (0 false positives) · **C PASS** (idempotent, no dupes, no 429; silent-skip UX noted) —
with ONE new S2 defect (silent per-chapter extraction death + unbounded billed retries, ID
pending team-lead) and the standing D-19 structural condition unchanged (3 of 4 flag types remain
dead until the fix applies).

## MOAT RE-VERIFY (post-D-19/D-27 apply) — 2026-07-18, third executor

Fix commit under test: `d581ce8` (Event.chapter + Character.deathChapter stamped
deterministically ON CREATE + coalesce-preserved ON MATCH; dead_character check requires real
PARTICIPATES_IN; alias union on exact-name MERGE). All extraction = real qwen3.6 BYOK via the
live scan route; all graph reads = read-only cypher-shell against `wmb-pub-neo4j-1`. Book 1
"Emberfall QA P3" only; new chapters 6/7/8 created (ids in p3_state.json). Traces 21-38.

Pre-test baseline (trace `21`): all 17 Event nodes `chapter:NULL`, Corvin `deathChapter:NULL`
(status dead), Zoë aliases regressed `["Zoe"]` — exactly the documented pre-fix state.
IMPORTANT CODE-READ FACT the test plan had to absorb: the shipped fix DISABLES
`location_conflict` outright (`ENABLE_LOCATION_CONFLICT_CHECK = false`, founder-decision D-19)
and annotates `timeline_violation` as known-limited. So "3 revived checks" is really: 1 revived
(dead_character_reappears), 1 gated off, 1 enabled-but-limited. Tested all three anyway.

### T1 — deathChapter stamping: **PASS** (on attempt 2; attempt 1 = new S2 defect)

- Attempt 1 (traces `22`/`23`/`24`): canon-neutral tweak → scan → extraction "succeeded" EMPTY at
  10:29:13Z (hash stamped, ZERO nodes written, Corvin untouched) — and `removeChapterEntities`
  had already deleted the ch3-only event "Eleventh Day Assault". Permanent silent data loss +
  poisoned skip-hash. Filed (ID pending, #2). Transient flake, not content-determined:
- Attempt 2 (second tweak, trace `24` cont.): landed in ~17s. Trace `25`: Corvin
  `deathChapter:3.0` stamped on the PRE-FIX node via ON MATCH coalesce, `status:"dead"`
  retained, 4 events recreated with `chapter:3.0`. Verdict scan (trace `26`): no new flags.

### T2 — dead_character_reappears: **PASS (fires end-to-end)** — with a self-disarm caveat

- ch6 seed: Corvin actively leads the "Defense of the Western Wall" (fights/speaks/commands),
  prose explicitly keeps him dead-and-buried. Extraction landed ~50s (traces `27`/`28`).
- First verdict (traces `29`/`30`): graph PERFECT for the check (deathChapter 3 preserved,
  PARTICIPATES_IN → chapter-6 event) but NO flag — ch6's own extraction emitted
  `status:"transformed"` and `ON MATCH += updateProps` overwrote "dead" → the `c.status="dead"`
  gate self-disarmed. THE chapter that constitutes the error un-arms the check for it.
- Re-arm (legitimate author sequence — typo-fix an early chapter): third canon-neutral ch3 tweak
  → re-extraction re-affirmed `status:"dead"` (trace `31`, 10:56:15Z), ch6 edge persisted →
  **`dead_character_reappears` FIRED** (trace `32`): critical, "dies in chapter 3 but
  participates in events in chapters 6", chapterNumber 6, jumpChapter 3, anchor "Corvin Ashe".
  First-ever fire of this check on real LLM extraction output.
- Final scan (trace `38`): flag persists but its chapters grew to "8, 6" — ch8's death-RETELLING
  produced a PARTICIPATES_IN to a forked retelling-event stamped chapter 8 (FP component), and
  the signature (sha1 of type|entities|CHAPTERS) churned → new row id, meaning [Intentional]
  suppression would NOT survive graph evolution for this flag type.

### T3 — location_conflict: **NOT FIRED — disabled by founder-decision; and the Cypher itself is broken both ways**

- ch7 seed landed exactly as designed (traces `33`/`34`): Mira PARTICIPATES_IN "Grain Unloading
  at the Salt Docks" AND "Cinder Ward Raid", both `chapter:7`, LOCATED_AT Salt Docks / Cinder
  Ward. Scan (trace `35`): no location_conflict — expected, check is code-gated OFF.
- Ran the check's verbatim Cypher read-only: it MISSES the seeded impossible pair — the
  `NOT (l1)-[:PART_OF*]-(l2)` clause is UNDIRECTED, and both locations are PART_OF "Emberfall",
  so the shared-parent path exempts them (proof: `["Salt Docks","Emberfall","Cinder Ward"]`).
  Meanwhile it DOES match 3 innocent ch3 pairs (death at Ashfall Gate / burial at Cindermoor
  Bridge — normal sequential movement) only because Cindermoor Bridge lacks PART_OF edges.
  Empirically vindicates the founder gate AND shows re-enabling as-is would be worthless:
  false-positives on orphan-location pairs, false-negatives on same-city conflicts.

### T4 — timeline_violation: **NOT FIRED (2 honest attempts) — structurally unfireable with current entity resolution**

- Both attempts wrote an explicit effect-precedes-cause claim ("the Midnight Bargain led directly
  to <earlier event named VERBATIM>"). Both extractions landed fine and emitted the LEADS_TO —
  but both times the extractor prefixed the earlier event with "The" ("The Defense of the Western
  Wall", "The Death of Corvin Ashe"), missing the exact-name MERGE and FORKING a duplicate node
  stamped chapter 8 → edge is ch8→ch8, `later.chapter > earlier.chapter` unsatisfiable, verbatim
  Cypher zero rows (traces `36`/`37`/`38`). Systematic article-prefix normalization, 2/2.
  Cross-chapter LEADS_TO can only fire if the LLM reproduces the earlier event's stored name
  byte-exactly; Events have no working alias resolution, so name variance forks instead of
  matching. Matches the code comment's own honesty; now empirically proven.

### T5 — alias union durability (D-27): **PASS (no-shrink proven; union-add not exercised by LLM)**

- Regressed baseline `["Zoe"]` survived SEVEN extraction passes (ch3 ×3, ch6 with BOTH spellings,
  ch7 Zoë-only, ch8 ×2) byte-identical — pre-fix, each pass overwrote the array wholesale, so
  any of these would have wiped it. Raw-file verified (traces `25`/`29`/`34`/`37`).
- The union-ADD path (aliases gaining "Zoë") did not exercise: the extractor always emitted the
  canonical "Zoë Rasmussen" as the entity name (diacritic intact end-to-end), never as an alias
  of a differently-spelled name, so there was nothing new to union. No duplicate node created.

### T6 — FP control: **PASS**

Complete flag list recorded at every one of the 8 scans. Across all benign content (canon-neutral
tweaks ×3, ch6/ch7/ch8 benign portions, 7 landed extractions) the three revived types produced
ZERO spurious flags; the only unexpected flag all session was the pre-existing
relationship_contradiction in Book 1 — which is NOT a checker FP but real contaminated graph
state: **cross-book edge write** (new S1-candidate defect, #1): `upsertRelationship()` binds no
bookId, so Book 2's ch6 ALLIED_WITH + ch9 OPPOSES seeds also landed on Book 1's Mira/Vane pair
(byte-identical `r.updatedAt` on both books' edges — one Cypher call wrote both; trace `23b`).
Book 1 now shows a contradiction its author never wrote, and Book 2's [Intentional] suppression
does not cover it (flag rows are book-scoped).

### Verdict on "the moat's 4 advertised checks", post-fix

| Check | Status after this run |
|---|---|
| relationship_contradiction | ALIVE (was already) — but cross-book contamination can make it fire falsely in sibling books |
| dead_character_reappears | **GENUINELY ALIVE end-to-end** (deathChapter stamping + real-participation gate work) — fragile: same-chapter status overwrite self-disarms it; retelling-events add FP chapters; signature churn breaks suppression stickiness |
| location_conflict | DEAD by founder gate (correctly so — verbatim Cypher shown empirically broken in both directions) |
| timeline_violation | ENABLED but effectively DEAD — event-name forking makes the required cross-chapter LEADS_TO unconstructible in practice (2/2 attempts) |

Net: the D-19 fix does what it claims mechanically (both stamps verified on real extraction;
coalesce preservation verified across 7 passes) and D-27 no-shrink holds. 1 of the 3 previously
dead checks is now truly live; the other two remain non-functional for structural reasons the
fix never claimed to solve. New defects this session: cross-book edge contamination (S1
candidate), empty-extraction-success data loss (S2), plus the fragility findings folded into
defect #3 (IDs pending team-lead).
