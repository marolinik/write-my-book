# P3 "Selena" — Defects (Phase B, series continuity / "the moat")

Register checked fresh 2026-07-18 immediately before filing: D-01..D-16 in use across all
`evidence/*/defects.md` (D-16 claimed by P2 Gerald, duplicate-Document S1). **D-17 is the next
free slot.**

## D-19 — [S1, MOAT-CRITICAL] 3 of 4 continuity-flag checks can never fire: the LLM extraction prompt never asks for the two graph properties (`Event.chapter`, `Character.deathChapter`) those checks require, and nothing in the pipeline derives them

> Renumbered D-17→D-19 by team-lead (D-17/D-18 were already assigned: batch-digest residual, export command-injection). Canonical ID = **D-19**.

**Severity: S1** (not a crash/leak, but "the moat" — the flagship series-continuity safety net —
is silently non-functional for 3 of its 4 advertised failure classes, with zero error, zero log,
zero degraded-mode signal to the user or to us; TEST-PLAN.md §P3 exit criteria explicitly require
"all 4 seeded contradiction classes caught," which is structurally impossible for `location_conflict`
and `timeline_violation` regardless of prose quality, and near-impossible for `dead_character_reappears`).

### Root cause (exact, code-verified, not inferred)

`runConsistencyChecks()` in `src/lib/graph/graph-queries.ts` implements 6 checks. Their exact
Cypher WHERE-clause dependencies:

| Check | Line(s) | Requires | Severity if fired |
|---|---|---|---|
| `location_conflict` | 324-332 | `e1.chapter = e2.chapter` (both `Event` nodes) | major |
| `timeline_violation` | 351-357 | `later.chapter > earlier.chapter` (both `Event` nodes) | critical |
| `dead_character_reappears` | 371-381 | `c.deathChapter IS NOT NULL`, `c.lastMentioned > c.deathChapter`, `e.chapter > c.deathChapter` | critical |
| `relationship_contradiction` | 424-438 | only `ALLIED_WITH` + `OPPOSES` edges between the same two `Character` nodes | major |

`EXTRACTION_GUIDANCE` in `src/lib/graph/entity-extractor.ts:97-102` — the literal prompt text
handed to the LLM, verbatim:

```
- Character: { "role": ..., "description": ..., "status": "alive|dead|unknown|transformed",
  "physicalTraits": "optional", "personality": "optional", "age": "optional" }
- Event: { "significance": ..., "description": ..., "timelinePosition": "relative or absolute
  time reference" }
```

Neither `chapter` (on Event) nor `deathChapter` (on Character) is mentioned anywhere in this
prompt, nor anywhere else in `entity-extractor.ts`. `validateEntity()` (same file) performs zero
derivation, defaulting, or injection of these two fields — properties pass through verbatim from
whatever the LLM emits, filtered only against the guidance's own allow-list. `upsertSingleEntity()`
in `graph-builder.ts` likewise never derives `chapter`/`deathChapter`; the only chapter-shaped
value it ever writes onto an entity is `firstAppearance`/`lastMentioned` (both driven by the
route's own `chapterNumber` query param, not the LLM), which the consistency-check Cypher above
does **not** read.

Cypher semantics make the effect deterministic, not probabilistic, for the first two checks:
`null = null` and `null > null` both evaluate to `NULL` (falsy) in Neo4j's three-valued logic —
so `WHERE e1.chapter = e2.chapter` and `WHERE later.chapter > earlier.chapter` can **never** be
satisfied by any Event node the extraction pipeline itself produces, no matter how blatant the
prose contradiction is. `dead_character_reappears` is not deterministically dead (an LLM could in
principle emit a stray `deathChapter` key despite never being asked for one) but is never-prompted
and therefore unreliable to the point of practical non-function.

Only `relationship_contradiction` is architecturally sound: `ALLIED_WITH`/`OPPOSES` are both
explicitly named in the relationship-types portion of `EXTRACTION_GUIDANCE`, and the `chapter`
property those edges carry is injected by application code in `upsertRelationship()`
(`graph-builder.ts`, `props: { chapter: chapterNumber, ... }`) — not LLM-derived at all, so it is
always present.

### Live proof (this book's own real extraction output, not a synthetic test)

Book 1 "Emberfall QA P3" (`bookId fd60e1d4-37c5-4c11-92a1-586af638224a`), chapter 1, narrates an
explicit in-scene event ("the first assault on the Ashfall Gate") intended by design to produce
Event nodes. Direct Neo4j read post-extraction, `MATCH (e:Event {bookId:$bookId}) RETURN
properties(e)`:

```json
{"name":"First Assault on Ashfall Gate","significance":"major","lastMentioned":1,
 "timelinePosition":"Hour past noon to dusk, Day 10 of siege","description":"...",
 "bookId":"fd60...","firstAppearance":1,"contentHash":"..."}
```

No `chapter` key present on any of the 3 Event nodes chapter 1 produced (`Preparation for
Assault`, `First Assault on Ashfall Gate`, `Corvin's Arm Wounding`) — confirming the theoretical
gap empirically on real qwen3.6 BYOK extraction output, not just by prompt inspection.

### Impact

`GET /api/books/:id/continuity/timeline` (lines 70-88, same file) also reads `e.chapter` for
ordering/filtering — so the timeline view is equally affected; events likely sort/group
incorrectly or get silently excluded from chapter-range queries, though this executor did not
separately verify the timeline endpoint's user-facing symptom (out of P3's mission scope).

### Fix direction (not applied — no `src/` edits per scope)

1. Add `chapter` to the `Event` entry in `EXTRACTION_GUIDANCE`, or (more robust) stop relying on
   the LLM for it entirely and derive it the same way `firstAppearance` already is — inject the
   calling `chapterNumber` onto every `Event` node at upsert time in `upsertSingleEntity()`.
2. For `deathChapter`: derive it automatically when `status` transitions to `"dead"` during a
   given chapter's extraction (`ON CREATE`/`ON MATCH` logic in `upsertSingleEntity()` already has
   the chapter number in scope) rather than depending on the LLM to invent an unprompted field.
3. Add a regression test asserting `runConsistencyChecks` can actually produce a
   `location_conflict`/`timeline_violation`/`dead_character_reappears` flag end-to-end from a
   realistic extraction payload — none of the 4 flag types currently appear to have such coverage,
   or this gap would have been caught before reaching QA.

### Status

**Reported, not fixed.** This is the single highest-priority finding from the P3 "moat" persona —
recommend routing to team-lead as a P0 before any "series continuity" marketing claim ships,
independent of this campaign's grading. Empirical confirmation that `location_conflict` and
`timeline_violation` fail to fire despite deliberately seeded, unambiguous contradictions is
still pending (in progress — see journey-log.md step 3), but is now understood to be an expected
negative result per the Cypher/prompt analysis above, not evidence of a scan-timing or throttle
issue.

## D-20 — [S2, ERROR HYGIENE] `POST /api/books/:id/chapters` raw-500s on a chapter-number collision instead of a clean 409/400; compounded by an undocumented inconsistency where `POST /api/books` silently auto-creates chapter 1 while `POST /api/series/:id/books` does not

> Renumbered D-18→D-20 by team-lead (D-18 = export command-injection). Canonical ID = **D-20**.

**Severity: S2** (journey-blocking, generic/undiagnostic error masking the real cause — not a
security or data-loss issue). Confirmed **not** already covered by P2's Z6 error-hygiene sweep
(`evidence/z6-error-hygiene/defects.md` — D-13/14/15 cover `chapters/reorder`, wiki, and
style-lens routes; this exact route/scenario is untouched).

### Root cause (exact file:line)

- `src/app/api/books/route.ts` (~lines 107-112), `POST` handler: unconditionally does
  `db.chapter.create({ data: { bookId: book.id, actNumber: 1, chapterNumber: 1, title: null } })`
  and returns `firstChapterId` in the response — every book created via this endpoint already has
  a `chapterNumber: 1` row.
- `src/app/api/series/[id]/books/route.ts`, `POST` (create-new-book-in-series path): does **not**
  auto-create a first chapter. Confirmed via this persona's own Book 1 creation (in-series,
  Day-0 setup) — no `firstChapterId` in the response, and the first explicit
  `POST .../chapters {chapterNumber:1}` call succeeded cleanly.
- `src/app/api/books/[id]/chapters/route.ts`, `POST` handler (lines 40-88): wraps
  `db.chapter.create()` in a try/catch that only special-cases `Unauthorized` and `ZodError`;
  falls through to a generic handler on Prisma's unique-constraint violation
  (`bookId`+`chapterNumber`), logging via `console.error` and returning bare
  `500 {"error":"Failed to create chapter"}` — no Prisma error-code branch, no 409.

### Repro (this persona's own step-5a edge-case run)

1. `POST /api/books {"name":"Standalone QA P3","genre":"fantasy"}` → `201`, response includes
   `firstChapterId` (chapter 1 already exists). Trace: `api-traces/05a_create_standalone_book.json`.
2. `POST /api/books/{id}/chapters {"actNumber":1,"chapterNumber":1,"title":"Ch1"}` (the natural
   next step for anyone following "create book, then create its first chapter") →
   **500** `{"error":"Failed to create chapter"}`. Trace:
   `api-traces/05a_create_standalone_ch1.json`.

The 500 gives no indication a chapter 1 already exists, no `existingChapterId`, nothing
actionable — a client has to guess or separately `GET /api/books/{id}/chapters` to discover why.

### Fix direction (not applied — no `src/` edits per scope)

1. In `chapters/route.ts` POST, catch Prisma `P2002` (unique constraint) specifically and return
   `409 {"error":"Chapter number already exists","chapterNumber":N}`.
2. Reconcile the two book-creation paths: either have `POST /api/series/:id/books` also
   auto-create chapter 1 (for consistency with plain `POST /api/books`), or document/return a flag
   so API consumers know not to assume chapter 1 exists either way.

### Status

**Reported, not fixed.** Non-blocking for the rest of this persona's mission — routed around by
using `chapterNumber:2` for the standalone-book edge case instead of colliding with the
auto-created chapter 1.
