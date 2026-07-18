# D-30 Fix Review -- cross-book relationship edge contamination

Reviewer: independent gatekeeper (code-reviewer agent)
Target: worktree .claude/worktrees/agent-a3b7b38e02f7965cf, branch worktree-agent-a3b7b38e02f7965cf, base cbc8fd9
Commits reviewed: 060003d (fix), 1164470 (repair script)

## Method

- Read full diff and the complete post-fix source of every touched file: graph-builder.ts, types.ts, entity-extractor.ts, graph-queries.ts, tools.ts.
- Grepped the entire src tree for every constructor of ExtractionResult and every unscoped MATCH pattern (node label with a name-only property map) to confirm fix completeness.
- Traced ctx.bookId back to its origin in the books/[id]/agent/[sessionId]/message route handler to confirm it is server-derived and ownership-checked before use, not client-controllable in a way that could target another tenant's book.
- Logically traced the new regression test's query-text-driven fake Neo4j session against the literal pre-fix query text to confirm it genuinely reproduces cross-tenant edge creation and overwrite, rather than being a tautological or self-fulfilling test.
- Ran tsc --noEmit (0 errors) and vitest run (87 files / 587 tests, all passed) directly in the worktree.

## Findings

### 1. Core fix -- VERIFIED correct

Both `upsertRelationship` endpoint MATCHes now bind `{name: $fromName, bookId: $bookId}` inline in the node pattern (previously joined only by a relative `WHERE a.bookId = b.bookId`).
Previously: `MATCH (a:Label {name: $fromName})` / `MATCH (b:Label {name: $toName})` with only `WHERE a.bookId = b.bookId`, which produced the full cross-product of same-named nodes across every book/tenant whenever a relative-equal pair existed anywhere in the graph.

A defense-in-depth runtime guard (`if (!bookId) { ...; return false; }`) refuses the write entirely if `bookId` is falsy (covers `undefined`, `null`, and `""`).

`upsertEntities` also gained a top-level guard refusing the whole extraction (`if (!result.bookId) { ...; return stats; }`) before entering the write session.

### 2. ExtractionResult.bookId -- VERIFIED required and threaded correctly

`types.ts` now requires `bookId: string` on `ExtractionResult`. Grepped all of `src` for every place an `ExtractionResult` object literal is constructed -- exactly two production call sites exist:

- `src/lib/graph/entity-extractor.ts::extractEntities` -- both return paths (success and the catch-block empty-result fallback) now set `bookId` from the function's own `bookId` parameter.
- `src/lib/agents/tools.ts::executeUpdateGraphEntity` (around line 1457) -- now sets `bookId: ctx.bookId` (previously omitted entirely, so these nodes were created under `bookId: ""` via the old `allProps.bookId ?? ""` fallback in `upsertSingleEntity`).

No other caller constructs `ExtractionResult`, so the required field cannot break any other consumer. `graph-maintenance.ts` only calls `extractEntities`/`upsertEntities`, never constructs the type directly, so it is unaffected.

### 3. ctx.bookId provenance -- VERIFIED authenticated, not user-controllable

`ctx.bookId` in `tools.ts` comes from `options.context.bookId`, set in `orchestrator.ts` from the caller. Traced to the books/[id]/agent/[sessionId]/message API route, which extracts `bookId` from the URL path param and validates it against the authenticated session with a `where: { id: bookId, userId: user.id }` lookup before any tool executes -- a request for a book not owned by the caller is rejected before `ctx.bookId` is ever populated. This is pre-existing route-level auth, unmodified by this fix, and it is sufficient to make `ctx.bookId` trustworthy as a tenant-scoping value.

### 4. upsertSingleEntity alias lookup / MERGE key -- VERIFIED fixed

Pre-fix, both the alias-lookup MATCH and the entity MERGE used a caller-injected `properties.bookId` (frequently absent) with a `?? ""` fallback on the MERGE key -- a null/missing `properties.bookId` silently no-op'd alias dedupe and fell the MERGE key back to the empty string, creating unscoped nodes. Post-fix, every one of these binds the authoritative `bookId` parameter passed down from `ExtractionResult.bookId`, with no fallback path remaining. Confirmed via diff.

### 5. getLocationMap intermediate hop -- VERIFIED bound

The intermediate node in the character-to-location traversal now carries `{bookId: $bookId}` (previously unbound). Grepped the rest of `graph-queries.ts`: every other node pattern in every other query already bound `{bookId: $bookId}` prior to this change, so this was the only gap and it is now closed. No other unscoped `MATCH (label {name: ...})` pattern exists anywhere in `src`.

### 6. New tests -- VERIFIED genuine regression coverage, not tautological

`tests/unit/graph-cross-book-isolation.test.ts` (5 tests): the fake Neo4j session emulation is query-text-driven -- it inspects the actual generated Cypher (does the property map include `bookId: $bookId`, and does a relative `WHERE a.bookId = b.bookId` clause exist) to decide whether to filter node candidates by book. I hand-traced this emulation against the literal pre-fix query shape: with a same-named pair seeded in a second tenant book, the emulation does NOT filter candidates by bookId (map text lacks `bookId: $bookId`), producing the full 2x2 cross-product; the relative WHERE then only requires the two candidate bookIds to equal each other, which the (bookB, bookB) pair also satisfies. This concretely reproduces both an unwanted edge creation in book B (test 3) and an in-place overwrite of book B's pre-existing edge properties (test 4). This is a real RED-before-fix test, not a tautology.

`tests/unit/repair-cross-book-edges.test.ts` (13 tests) exercise the pure classifyEdges/flagsTouchedByDeletions functions directly -- covers the exact empirical D-30 shape (byte-identical timestamp twins across books), float-chapter normalization, chapter-0 (story bible) always-legit, no-Postgres-chapters-at-all book gives anomaly, null-chapter gives anomaly, ambiguous multi-in-range twins, and continuity-flag review listing (including status "intentional" flags, so suppression does not silently swallow contamination review).

Pre-existing `continuity-alias-union.test.ts` and `continuity-graph-properties.test.ts` (D-19/D-27 regression suites) were touched only to add the newly-required `bookId: "b1"` field to their ExtractionResult fixtures -- no assertion logic changed, and both still pass. Confirms the D-19 (chapter/deathChapter stable-coalesce) and D-27 (alias union-not-replace) fixes are not disturbed by this change.

### 7. Repair script (scripts/repair-cross-book-edges.ts) -- VERIFIED safe defaults

Dry-run by default (`execute = process.argv.includes("--execute")`); nothing is written unless `--execute` is passed.

Deletion set is exactly the "contaminated" bucket: r.chapter not in (book's Postgres chapters union {0}). Chapter 0 (story bible) is unconditionally treated as legitimate for every book -- correctly matches the extractEntities(content, bookId, 0, ...) story-bible convention used elsewhere in the pipeline.

Ambiguous (in-range twins spanning multiple in-range books) and anomaly (book has zero Postgres chapters at all, or edge has no r.chapter, or cross-book-endpoint edges) are listed only, never included in the deletion set -- confirmed by reading the execute branch, which only operates on the contaminated array.

A book that legitimately has zero chapters yet (e.g. story-bible-only, no chapters written) would have its chapter-0 edges classified anomaly rather than contaminated (since the book has no entry in the Postgres chapter map at all) -- fails toward manual review, not deletion. No off-by-one or false-delete path found.

Exit code is non-zero whenever anything needs manual review, in both dry-run and execute mode, so a silent no-op run cannot be mistaken for a clean pass.

Minor, non-blocking note: deletion targets Neo4j's internal id(r) captured at read time; if relationship ids were reused between the read and the --execute write (theoretically possible in some Neo4j versions after concurrent deletes), a delete could target the wrong edge. This is a low-probability, operator-run-once script scenario and the script already self-reports via a deleteFailures count if fewer edges were deleted than expected -- acceptable as-is.

### 8. Residual gap (non-blocking, worth tracking)

Nodes created under the legacy bookId "" bug (from the pre-fix executeUpdateGraphEntity) are not cleaned up by anything in this change. The repair script only scans relationship edges via a MATCH (a)-[r]->(b) pattern, so orphaned bookId "" nodes with no relationships are invisible to it and remain in Neo4j. This is inert clutter, not a security or leakage risk -- every read query in graph-queries.ts filters by the real authenticated bookId, and no real book ever has bookId "" (the new guards refuse that value on all future writes), so these orphans can never surface in any tenant's results. Recommend a follow-up ticket to detach-delete bookId "" nodes, but it does not block this fix.

## Build/test verification (run directly in the worktree)

npx tsc --noEmit        -> 0 errors
npx vitest run          -> Test Files 87 passed (87), Tests 587 passed (587)

## Verdict

SAFE

Summary: Both upsertRelationship endpoint MATCHes now correctly bind the authoritative bookId, with defense-in-depth guards at both upsertEntities and upsertRelationship. ExtractionResult.bookId is required and correctly threaded from both extractEntities return paths and from executeUpdateGraphEntity (using route-authenticated ctx.bookId, verified not user-controllable). upsertSingleEntity and getLocationMap close the remaining alias-lookup and traversal gaps. No other unscoped Cypher pattern exists in the codebase. New tests (5 isolation + 13 repair-heuristic) are genuine, non-tautological regression coverage; existing D-19/D-27 tests are undisturbed. The repair script is read-only by default, deletes only provably out-of-range edges, and fails safe (never auto-deletes ambiguous/anomalous data). tsc and the full 587-test vitest suite pass. One non-blocking residual gap (orphaned legacy bookId "" nodes not cleaned up) is inert and recommended as a follow-up, not a blocker.
