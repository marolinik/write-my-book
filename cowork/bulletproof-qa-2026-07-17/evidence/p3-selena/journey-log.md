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

### Chapters 4, 5 — landed; NEW FINDING: aliases array regresses (D-21)

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
property. Filed as **D-21** (`defects.md`) — genuine data-integrity gap in the moat's alias
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

**New finding (D-22, possibly-intentional design gap):** Direct Neo4j query of Book 2's OWN
graph shows Mira/Zoë/Vane already have `lastMentioned:2` (fresher, independently-extracted Book 2
state) — yet the sidebar reports `lastBook:1, lastChapter:5` for all three, sourcing exclusively
from Book 1. Traced to `series-context/route.ts` querying `priorBooks` as strictly `bookNumber <
current`, and `ambient-context.ts`'s `buildAmbientContext` filtering `prior` the same way — the
current book is never a "last-known state" candidate, even when its own graph already has more
current data. Filed as **D-22**, flagged (not asserted) as a bug given TEST-PLAN's literal
"latest-book-wins" / "last-known state" wording could reasonably be read either way.

*(continued below as each chapter's extraction lands)*
