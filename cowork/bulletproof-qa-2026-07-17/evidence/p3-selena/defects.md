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

## D-27 — [S2, MOAT DATA-INTEGRITY] `Character.aliases` is not cumulative across chapters — a later chapter's own extraction pass can silently overwrite (not union) a previously-merged alias, undermining the "alias-matched" sidebar guarantee

> Next free slot per fresh register check 2026-07-18 (D-01..D-20 in use across all
> `evidence/*/defects.md`). Canonical ID = **D-27**.

**Severity: S2** (data-integrity bug inside the moat's entity-resolution layer — does not create
duplicate nodes, does not crash, but silently loses previously-established alias history, which
directly weakens TEST-PLAN.md §P3's explicit exit requirement that the series-context sidebar be
"alias-matched, diacritic-insensitive").

### Root cause (exact file:line)

`upsertSingleEntity()` in `src/lib/graph/graph-builder.ts` (~lines 67-156) has two different code
paths for `aliases`:

- **Safe path (lines ~82-121, rename detection)**: only runs when the incoming entity's `name`
  differs from an existing node matched via its alias list. Uses an additive Cypher `CASE`:
  `n.aliases = CASE WHEN $newName IN coalesce(n.aliases, []) THEN n.aliases ELSE coalesce(n.aliases, []) + $newName END`
  — this correctly unions, never drops.
- **Unsafe path (lines ~122-156, exact-name MERGE, hit whenever the incoming entity's `name`
  already matches the canonical node name — the normal case for a recurring, consistently-named
  character)**: builds `allProps.aliases = aliases` directly from *this chapter's own* extraction
  output, then `MERGE ... ON MATCH SET n += $updateProps`. Neo4j's `+=` property-map merge
  **overwrites** listed keys wholesale — it does not union arrays. Whatever `aliases` list the
  current chapter's LLM pass happens to emit (or doesn't emit) for that entity **replaces** the
  node's accumulated alias history instead of adding to it.

### Repro (empirical, this persona's Book 1 run)

Entity: `Zoë Rasmussen` (bookId `fd60e1d4-37c5-4c11-92a1-586af638224a`), introduced ch1, "Zoe"
plain-spelling used in ch2/ch4 dialogue only — ch3/ch4/ch5 prose never mentions her by the plain
"Zoe" spelling except ch4's dialogue; ch5 mentions only "Zoë" (diacritic form), zero occurrences
of plain "Zoe".

1. After ch2 scan: direct Neo4j read (journey-log.md, "Chapter 2 — alias merge") — exactly one
   `Zoë Rasmussen` node, `aliases: ["Zoë", "Zoe"]`. Correct, via the safe rename-detection path.
2. After ch5 scan (all of ch1-5 landed): direct Neo4j read (`MATCH (c:Character {bookId}) WHERE
   c.name CONTAINS 'Rasmussen'`, used to route around a shell unicode-escaping issue with the
   literal "Zoë" string) — same single node, but `aliases: ["Zoe"]` only. **"Zoë" has been
   silently dropped from its own node's alias list.**

No duplicate node was created (the critical de-duplication guarantee from D-nothing/ch2's PASS
still holds), but the alias array itself is not durable across chapters — it reflects only
whatever the most recent chapter's own LLM extraction pass happened to (re-)emit, not the union
of everything ever established. Root cause matches the code path exactly: a node matched by exact
canonical name skips the additive branch entirely and falls through to the destructive
`n += $updateProps` merge.

### Fix direction (not applied — no `src/` edits per scope)

In the exact-name MERGE path (lines ~122-156), union `aliases` the same way the rename-detection
branch already does, e.g. compute `updateProps.aliases` as
`Array.from(new Set([...(existingAliases ?? []), ...(aliases ?? [])]))` before the `ON MATCH SET`,
instead of overwriting with the incoming chapter's raw list.

### Status

**Reported, not fixed.** Does not block the rest of this persona's mission (canonical `name`
lookups still resolve correctly); flagged because it directly undercuts the "alias-matched"
half of TEST-PLAN.md §P3's series-context sidebar exit criteria.

## D-25 — [S2, MOAT DESIGN GAP, possibly intentional] Series-context sidebar's "last-known state" for an on-stage character NEVER considers the current book's own already-extracted state — only strictly-prior books are candidates, so the sidebar goes permanently stale re: the book you're actively writing

> Renumbered D-22→D-25→**D-25** by team-lead (D-22 = create-race sweep in commit f427822 body; D-25/D-24 = P5 Sam's W4 immersive-corruption + crash-loss defects, filed concurrently). Canonical ID = **D-25**. Classification: PRODUCT-CLARIFICATION (product intent on "latest-book-wins" scope — the sidebar's job may deliberately be prior-book canon only, with the current book's own state shown by the in-book continuity net; not clearly a bug). Route to founder for intent, like [[D-08]].

**Severity: S2** (probably-real gap in the moat's core value proposition — "series sidebar
surfaces each on-stage character's last-known state," per TEST-PLAN.md §P3 — but flagged as
*possibly intentional scoping* rather than an outright bug; see discussion below).

### Root cause (exact file:line)

- `src/app/api/books/[id]/series-context/route.ts:88-92` — `priorBooks` is queried with
  `bookNumber: { lt: book.bookNumber }` (strictly BEFORE the current book).
- `src/lib/series/ambient-sources.ts:17-23` (`getOnStageNames`) uses the CURRENT book's own
  extraction only to get a raw name list (`getChapterEntities(bookId, chapterNumber).characters`)
  — it discards everything else on those nodes (role/status/lastMentioned).
- `src/lib/series/ambient-context.ts:157-160` (`buildAmbientContext`) — `const prior =
  (input.priorBookCharacters ?? []).filter((c) => c.bookNumber < input.currentBookNumber)` — even
  if some future caller passed current-book data through, this filter would still strip it. The
  `isLater()` tie-break inside `matchCharacters()` (referenced above) exists specifically to pick
  the most recent state *among candidates already restricted to strictly-prior books* — it never
  gets a chance to compare against the current book because the current book is never a candidate.

### Repro (empirical, this persona's Book 2 run)

Direct Neo4j query of Book 2's own (bookId-scoped, separate-from-Book1) subgraph after Book 2
chapters 1-2 were scanned:

```
Mira Thorne    role:protagonist status:alive lastMentioned:2
Kestrel Vane   role:antagonist  status:alive lastMentioned:2
Zoë Rasmussen  role:supporting  status:alive lastMentioned:2
```

`GET /api/books/{book2Id}/series-context?chapterNumber=2` for the SAME three characters returned:

```json
{"name":"Mira Thorne","lastBook":1,"lastChapter":5,...}
{"name":"Zoë Rasmussen","lastBook":1,"lastChapter":5,...}
{"name":"Kestrel Vane","lastBook":1,"lastChapter":5,...}
```

Every one of them reports `lastBook:1, lastChapter:5` (Book 1's final state) even though Book 2's
own graph already has independently-extracted, strictly-more-current data (`lastMentioned:2`) for
the exact same characters. No matter how many further chapters get written and scanned in Book 2,
this sidebar's `lastBook`/`lastChapter`/`role`/`status` for these characters will never advance
past Book 1 — the route structurally cannot see Book 2's own state for on-stage characters.

### Is this a bug?

Genuinely ambiguous, flagged rather than asserted:

- **Case for bug**: TEST-PLAN.md §P3 names the requirement "**latest-book-wins**" without
  qualifying it as "latest-*prior*-book-wins," and separately requires "last-known state" —
  the plain reading of both phrases is "the most current information I have established
  anywhere," which an author would reasonably expect to include their own already-written
  chapters of the very book they're currently extending.
- **Case for intentional scoping**: "series context" could be read narrowly as "reminders from
  *other* books" specifically — the author presumably already remembers what they wrote two
  chapters ago in the SAME book without needing a sidebar nudge, so cross-referencing only prior
  *books* (not prior chapters of the current book) is a defensible product scope.

Either way, the current behavior is worth surfacing: a multi-chapter drafting session in Book 2
gets a sidebar that never updates past Book 1's ending state, for the full duration of writing
Book 2 — which is a materially different (weaker) guarantee than "last-known state" implies at
face value.

### Fix direction (not applied — no `src/` edits per scope)

If the current-book-inclusive reading is correct: pass the current book's own `getBookCharacterStates(book.id)` into the same `matchCharacters()`/`isLater()` comparison the prior-books path already uses, treating the current book as the highest-recency candidate. If the narrower reading is correct: no fix needed, but TEST-PLAN.md's "latest-book-wins" wording should be clarified to "latest-*prior*-book-wins" to avoid this exact ambiguity in future grading passes.

### Status

**Reported, not fixed, verdict deliberately left open** (bug vs. intentional scope) for team-lead /
product judgment — unlike D-19/D-20/D-27, this one hinges on interpreting an ambiguous exit
criterion rather than a clear-cut implementation defect.

## D-28 — [S2, MOAT RELIABILITY + COST LEAK] A chapter can enter a state where graph extraction silently fails on EVERY attempt — zero API-visible error, zero degraded-mode signal, and unbounded billed retries, because both extraction-throttle layers key off success markers that a failing extraction never writes

> Filed 2026-07-18 by the resumed P3 executor. Per campaign discipline this executor does NOT
> self-assign an ID (highest known in-use at time of writing: D-27).

**Severity: S2** (no crash, no data loss — but two compounding harms inside the moat's input
pipeline: a silent integrity hole and a per-scan money leak on the user's own BYOK key).

### Evidence (Book 2 "Cinderwake QA P3", bookId `2c9af2e0-dc6e-417c-948e-7ffe9f0a2d90`, chapter 7)

- **4 independent extraction triggers across 2 days, 0 landings**: predecessor's
  `scan_book2_ch7_first` (2026-07-17) and `scan_book2_ch7_flagcheck` (07:46:21Z 2026-07-18, their
  final act), plus this session's traces `10_scan_book2_ch7_trigger` (07:56:45Z) and
  `11_scan_book2_ch7_retrigger` (08:07Z). Every response a clean `200 {"flags":[]}`.
- Landing polled read-only (series-context `meta.notReady`, log
  `api-traces/11_poll_ch7_extraction.log`): continuously `true` 07:57→08:27:50; predecessor's
  independent Neo4j check the day before showed characters still `lastMentioned:6`, no OPPOSES edge.
- **Discriminators, same user/key/model/book, same session**: ch8 extraction landed in ~90s
  (`12_poll_ch8_extraction.log`), ch9 extraction landed in ~90s (`16_poll_ch9_extraction.log`).
  The pipeline is healthy; the failure is specific to ch7's content/state.
- ch7's exact failing bytes preserved at `../ch7_failing_content.md` (974 chars, valid UTF-8; only
  non-ASCII is the em dash E2 80 94, which sibling chapters that extract fine also use). Root cause
  not determinable from API surfaces (server console inaccessible to this executor): the scan route
  swallows extraction failures with `console.error` only (`scan/route.ts:69-71,74-76`) and
  `updateFromChapter` catch-alls to `{updated:false}` (`graph-maintenance.ts:57-64`).

### Why S2 — two distinct harms

1. **Moat integrity**: a never-extracted chapter is invisible to EVERY continuity check — its
   events/relationships simply do not exist in the graph — while the product gives no
   "incomplete graph" signal of any kind. The scan returns `{"flags":[]}`, indistinguishable from
   a genuinely clean chapter. TEST-PLAN §P3's edge criterion "partial graph → NO false confidence
   (labeled incomplete)" is violated in the worst direction: the user's seeded contradiction
   (ch7's OPPOSES betrayal, written precisely to be caught) produced zero flags for two days and
   would have shipped silently. This session's A-mission was only rescuable because a DIFFERENT
   chapter could carry the OPPOSES edge.
2. **Cost leak**: `shouldExtract()` returns `true` whenever the Chapter node's timestamp is absent
   (`continuity-flags.ts:81-84`), and the Chapter node + `contentHash` are only written on SUCCESS
   (`graph-maintenance.ts:54`, `setContentHash`). A permanently-failing chapter therefore re-fires
   a fresh billed BYOK LLM extraction attempt on EVERY scan — editor visits, re-scans, forever —
   with no backoff, no attempt cap, no user-visible spend signal. The 90s throttle structurally
   cannot engage for exactly the chapters that need it most.

### Fix direction (not applied — no `src/` edits per scope)

1. Persist failure state (e.g. `lastAttemptAt`/`failureCount` on the Chapter node or a Postgres
   column) in the catch path, and make `shouldExtract` respect it — retry with backoff and a cap
   instead of unconditionally.
2. Surface it: the scan response already has a `degraded:true` pattern for check-timeouts — extend
   it with per-chapter `extractionFailed`, and make series-context `meta` distinguish "not yet
   extracted" from "extraction failing repeatedly".
3. Log the provider error + chapter id at error level to something durable (currently
   `console.error` only, lost in dev-server scroll).
4. Repro asset: feed `ch7_failing_content.md` through `extractEntities` directly to identify the
   deterministic failure mode (LLM refusal? malformed JSON past the jsonrepair fallback? provider
   4xx?).

### Status

**Reported, not fixed. Canonical ID = D-28 (assigned by team-lead 2026-07-18).**

## NEW (ID pending team-lead, #1 of this session) — [S1 candidate, CROSS-BOOK/CROSS-TENANT GRAPH WRITE] `upsertRelationship()` binds no `bookId`: one book's extraction writes relationship edges into EVERY book (any user) containing same-named characters, producing false continuity flags in books the author never touched

> Filed 2026-07-18 by the moat re-verify executor. Highest known assigned ID at time of writing:
> D-29. This executor does not self-assign.

**Severity: S1 candidate** — this is a WRITE across book (and structurally tenant) boundaries into
the moat's graph, and it has already produced a false `relationship_contradiction` flag in a book
whose prose contains no contradiction. `bookId` is a UUID but character `name` is author-chosen
free text ("Sarah", "the Captain", "John Miller" are inevitable collisions across users).

### Root cause (exact, code-verified)

`upsertRelationship()` in `src/lib/graph/graph-builder.ts` (~lines 230-243):

```cypher
MATCH (a:<FromLabel> {name: $fromName})
MATCH (b:<ToLabel> {name: $toName})
WHERE a.bookId = b.bookId
MERGE (a)-[r:<TYPE>]->(b)
```

No `bookId` parameter is bound at all — the only constraint is that the two endpoints share *some*
bookId. Cypher produces the full cross-product of same-named node pairs across ALL books, and the
`MERGE` then creates/updates the edge **on every pair**. Every entity query elsewhere in the file
correctly binds `{bookId: $bookId}`; this is the single query that forgot.

### Empirical proof (trace `23b_neo4j_crossbook_edge_contamination.txt`)

Book 1 "Emberfall QA P3" (`fd60e1d4…`, chapters 1-5 ONLY) holds:

```
"ALLIED_WITH", chapter 6.0, r.updatedAt 2026-07-18T02:54:33.420Z   (Mira Thorne -> Kestrel Vane)
"OPPOSES",     chapter 9.0, r.updatedAt 2026-07-18T09:04:06.482Z   (Mira Thorne -> Kestrel Vane)
```

Book 1 has no chapter 6 or 9. Book 2 "Cinderwake QA P3" (`2c9af2e0…`) holds the SAME two edges
with **byte-identical `r.updatedAt` values** (02:54:33.420Z / 09:04:06.482Z) — one
`upsertRelationship` call during Book 2's ch6/ch9 extractions wrote both books' edges in a single
Cypher execution. Book 2's ch6 (ALLIED_WITH seed) and ch9 (OPPOSES seed) are the resumed
executor's step-4 relationship_contradiction fixture.

Consequence, observed live (trace `23_scan_ch3_t1_trigger.json`): Book 1's scan now returns an
active `relationship_contradiction` flag (row `52af6dc9…`, same signature `e687d7d1…` as Book 2's)
for a contradiction the author of Book 1 never wrote. Book 2's [Intentional] suppression does NOT
carry over (flag rows are book-scoped even though the contaminating edges are not), so the false
flag surfaces on every Book 1 scan.

### Impact

1. **Cross-tenant**: nothing in the query restricts to the current user's books — two different
   users with same-named character pairs will write edges into each other's graphs on every
   extraction that emits a character-character relationship. Silent corruption of another tenant's
   moat + false flags on their scans.
2. **Same-user cross-book**: series books SHARE character names by design (the entire premise of
   the moat) — so this fires constantly in exactly the flagship use case: book 2 of a series
   pollutes book 1's graph with book 2's relationship states.
3. Flag suppression does not follow the contamination (book-scoped rows), so the victim book gets
   an unsuppressable-at-source recurring false flag.

### Fix direction (not applied — no `src/` edits per scope)

Bind bookId on both MATCHes: `MATCH (a:… {name: $fromName, bookId: $bookId})` (the caller
`upsertEntities` already has `result.entities[].properties.bookId`; pass bookId into
`upsertRelationship` alongside `chapterNumber`). Add a regression test: extract into book A while
book B holds same-named characters; assert B's edge set unchanged. A data-repair pass is also
needed: existing cross-contaminated edges (identifiable as `r.chapter` values outside the book's
real chapter range, or by shared-timestamp forensics) should be audited/removed.

## NEW (ID pending team-lead, #2 of this session) — [S2, MOAT DATA LOSS + POISONED SUCCESS] An LLM extraction that returns an EMPTY result is recorded as SUCCESS: the chapter's previous graph contribution is already deleted (`removeChapterEntities`) and the content-hash is stamped, so the loss is permanent and no re-scan will ever retry

> Filed 2026-07-18 by the moat re-verify executor. Sibling of D-28 but the OPPOSITE failure
> polarity: D-28 = extraction that never succeeds → unbounded billed retries; this = extraction
> that "succeeds" empty → zero retries, prior graph data destroyed.

**Severity: S2** (silent data loss inside the moat + permanently poisoned skip-cache for the
affected chapter; recovery requires the user to EDIT the chapter's text).

### Empirical evidence (Book 1 ch3 re-extraction, this session, trace `24_poll_ch3_reextraction.log`)

- 10:26Z: ch3 content tweaked (canon-neutral sentence, content v2) → hash changed. Scan triggered
  (trace `23`).
- 10:29:13Z: Chapter-3 node's `contentHash`/`updatedAt` stamped = the SUCCESS path ran
  (`setContentHash` is only reached after `extractEntities` + `upsertEntities` return).
- Graph delta from that "successful" extraction: **zero nodes created or updated** (no node in the
  book carries `updatedAt` > 10:28 except the Chapter meta node; Corvin's `lastMentioned` still 5;
  zero Events with `chapter=3`).
- Destructive part: the pre-existing ch3-only Event node "Eleventh Day Assault" (present in the
  10:21Z baseline, trace `21`) was DELETED by `removeChapterEntities()` (graph-maintenance.ts runs
  it BEFORE extraction) and never recreated. Its PARTICIPATES_IN edges died with it.
- Because the hash now matches the current content, every subsequent scan of ch3 is a silent no-op
  — the empty state is permanent until the user edits the text again (attempt 2 with a second
  tweaked sentence at 10:40Z re-extracted successfully in ~17s and restored 4 ch3 events,
  confirming the emptiness was a transient LLM/provider flake, not content-determined).

### Root cause (code-verified)

`updateFromChapter()` (src/lib/graph/graph-maintenance.ts:37-56) does
delete-then-extract-then-stamp with no minimum-yield check: `upsertEntities()` with
`entities.length === 0` returns `{nodesCreated:0,...}` without error, and `setContentHash()` runs
unconditionally afterward. An empty-but-parseable LLM response (or a response whose every entity
fails validation) is indistinguishable from a genuinely successful extraction.

### Fix direction (not applied)

1. Treat `entities.length === 0` on non-trivial content (existing prior graph contribution and/or
   word count above a floor) as a FAILED extraction: skip `setContentHash`, keep D-28's retry
   semantics.
2. Make the flow transactional: snapshot/restore or defer `removeChapterEntities` until the new
   extraction has produced a non-empty validated result (delete-then-fail currently loses data
   even in the D-28 never-succeeds case — every failing re-attempt after a content edit re-deletes
   whatever survived).
3. Log an explicit warning with entity/relationship counts on every extraction completion.

### Status

**Reported, not fixed. ID pending team-lead.**

## NEW (ID pending team-lead, #3 of this session) — [S2, MOAT RESIDUAL after D-19 fix] The one genuinely-revived check (`dead_character_reappears`) is fragile in three specific, reproducible ways; `timeline_violation` remains effectively dead despite being enabled

> Filed 2026-07-18 by the moat re-verify executor. Not a regression of the D-19 fix — the fix's
> own mechanics verified correct (stamping + coalesce preservation + real-participation gate all
> work; the check FIRED end-to-end on real extraction, trace `32`). These are residual design
> gaps between deterministic Cypher checks and nondeterministic LLM extraction, found while
> proving the fix.

### (a) Self-disarm: the violating chapter's own extraction overwrites `status` away from "dead"

Empirical (traces `29`/`30`): ch6 (dead Corvin actively fighting) extracted him as
`status:"transformed"`; `ON MATCH SET n += $updateProps` replaced "dead" → the `c.status="dead"`
gate went false and the flag did NOT fire, even though `deathChapter:3` and the post-death
PARTICIPATES_IN edge were both present and correct. An author who writes the classic error
(forgot the character died, writes them alive) will get `status:"alive"` from extraction — same
disarm. The check only fired after an unrelated ch3 re-extraction re-asserted "dead"
(trace `32`). Fix direction: make `status` transition-aware like `deathChapter` (e.g. once
deathChapter is set, require an explicit resurrection signal to leave "dead"; or have the check
key on `deathChapter IS NOT NULL` alone, dropping the live-status gate).

### (b) Retelling-events create FP chapters and churn the flag's identity

Empirical (trace `38`): ch8 merely RETELLS the death; the extractor emitted a
`PARTICIPATES_IN` edge from Corvin to the retelling-event, which the D-19 stamp (correctly, by
its own rules) labels `chapter:8` → the flag's chapters grew to "8, 6", where 8 is a false
component (no on-page action in ch8). Because `continuityIssueSignature()` includes sorted
chapters, the signature changed (`fed30551…` → `e70b8fcc…`) and the row was delete/recreated
with a new id — so a previous [Intentional] suppression of this flag would silently stop
applying whenever the chapter set evolves. (Contrast: `relationship_contradiction` has
`chapters:[]` and stayed id-stable all session.) Fix direction: exclude chapters from the
signature for this type (entities + deathChapter suffice), and/or teach extraction to
distinguish participation from being-the-subject-of-a-retelling.

### (c) `timeline_violation` is enabled but unconstructible: event-name forking

Empirical (traces `36`/`37`/`38`, 2/2 attempts): prose asserting "the Midnight Bargain led
directly to the Death of Corvin Ashe" (existing node, named verbatim) produced LEADS_TO edges —
but the extractor emitted the target as "The Death of Corvin Ashe" (article prefixed), which
missed the exact-name MERGE and forked a duplicate Event node stamped with the CURRENT chapter.
Result: every cross-chapter causal edge degenerates to same-chapter (8→8) and
`later.chapter > earlier.chapter` can never hold. Events have no effective alias resolution
(the LLM never emits aliases for events), so any name variance forks instead of matching.
Bonus finding while verifying T3: the disabled `location_conflict` Cypher is ALSO broken in both
directions — its undirected `NOT (l1)-[:PART_OF*]-(l2)` exempts any two locations sharing a
parent (all same-city conflicts, proof path `["Salt Docks","Emberfall","Cinder Ward"]`) while
matching innocent sequential movement between locations that merely lack PART_OF links (3 such
rows in ch3). Fix direction: normalize event names on upsert (case/article-strip fuzzy MERGE),
or match events by (chapter, normalized-name) with an alias list like Characters have; rework
the PART_OF clause to directed ancestry with a same-parent conflict still counting as a
conflict.

### Status

**Reported, not fixed. ID pending team-lead.**
