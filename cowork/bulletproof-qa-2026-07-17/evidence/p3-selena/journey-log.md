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

### Remaining step-1 work (in progress)

Chapters 2, 3 (death), 4, 5 scans queued one at a time (single-worker discipline). Will confirm:
Corvin Ashe `status` flips to `"dead"` after ch3 extraction (and empirically check whether
`deathChapter` ever appears, expected: no, per D-17); Zoë/Zoe alias-merge (no duplicate node)
after ch2/ch4 (both use the plain "Zoe" spelling in dialogue).

*(continued below as each chapter's extraction lands)*
