# verify-d73 — D-73 hardening (regression / route-security / poison-contract lens)

**Verdict: APPROVE-WITH-NOTES** (Fable, 2026-07-19)
**Gates:** `npx tsc --noEmit` exit **0** · full `npx vitest run` **894 passed / 118 files** (0 fail) · pinned D-31 `graph-empty-extraction-poison` **12/12 green**.
**Baseline:** uncommitted working tree on `qa/bulletproof-2026-07-17`, HEAD `eea71f6` (909c6d9 + 2 unrelated docs/migration commits). `graph-builder.ts`, `graph-queries.ts`, `entity-extractor.ts` **byte-intact vs 909c6d9** (`git diff 909c6d9 --stat` empty).

Bottom line: no regression found that breaks a previously-working invariant, and no new security hole. The notes below are LOW/informational — none blocks landing.

---

## 1. D-31 poison contract — HOLDS, and for the right reason

Enumerated every Cypher string in the changed file. Exactly **two** writers of `c.contentHash = $hash` exist, both genuine success paths:
- `setContentHash` — `src/lib/graph/graph-maintenance.ts:513-517` (reached only at :302, after non-failed + non-suspicious + successful upsert)
- `setStoryBibleHash` — `graph-maintenance.ts:763-767` (reached only at :451, same preconditions on the bible path)

No failure/marker branch touches `contentHash`:
- `markFailedExtraction` (`graph-maintenance.ts:590-595`) writes ONLY `updatedAt` / `lastFailedExtractionAt` / `failedExtractionCount` (server-side `coalesce(...)+1`) / `lastFailureReason` — no `contentHash` substring anywhere in the query.
- `markSuspiciousEmptyExtraction` (`graph-maintenance.ts:554-561`) binds `$emptyHash` → `lastEmptyHash` only (unchanged contract).
- The new state-read `getExtractionState` (`graph-maintenance.ts:637-640`) is a pure `RETURN` of the two counters; no `contentHash` in its text.

**Why the pinned test stays green (traced, not assumed):** the poison mock (`tests/unit/graph-empty-extraction-poison.test.ts:79-118`) branch-matches on (1) `RETURN c.contentHash AS hash`, (2) `c.contentHash = $hash`, (3) `lastEmptyExtractionAt`, default `{records:[]}`. `getExtractionState`'s query hits none → default → zeroed state → cap logic inert in its ≤2-iteration scenarios; `markFailedExtraction` (writes `lastFailedExtractionAt`, not `lastEmptyExtractionAt`) also falls to default → no chapter-meta write → the hard-throw test's `contentHash undefined` + `removeCalls []` assertions hold against the real control flow. The empty-marker `not.toMatch(/contentHash/)` guard (poison test :238-244) still exercises the real `markSuspiciousEmptyExtraction` string. 12/12 confirmed by direct run.

**Notes (informational, non-blocking):**
- **N1.** The pinned guard does NOT cover the new failed-marker branch (`markFailedExtraction` misses the `lastEmptyExtractionAt` filter). The invariant currently holds **by inspection** (above) and by the economics test's `row()?.contentHash` stays-null assertions — but the economics mock routes `markFailedExtraction` on `c.failedExtractionCount = coalesce` (`graph-extraction-economics.test.ts:159`) **before** its stamp branch (:168), so a hypothetical future poisoned failed-marker containing both substrings would be mis-routed and not caught. Suggested cheap hardening for a later pass: widen the pinned filter to `/lastEmptyExtractionAt|lastFailedExtractionAt/` + keep the `not.toMatch(/contentHash/)` guard.
- **N2.** New `setContentHash` now contains BOTH `c.contentHash = $hash` and `lastEmptyExtractionAt` (the reset). It routes correctly in the poison mock only because branch (2) is checked before branch (3). Order-dependent but fail-SAFE: a future reorder would fail the suite loudly, not pass silently.

## 2. Tenant isolation / owner scoping — INTACT

- Both route diffs are **strictly additive constant-threading** (+2 imports, +2 `deriveExtractionStatus` args each; verified via `git diff` — nothing else changed in either route).
- GET `/continuity`: `requireUser` → `db.book.findFirst({id, userId})` → 404 (`route.ts:71-75`) **before** any graph read; `getChapterExtractionFacts` is read-only, never extracts/bills (`graph-maintenance.ts:680-734`, READ session, no LLM import in the path).
- DELETE: double fence `{id: flagId, bookId}` via `deleteMany` + count→404, transient semantics unchanged (`route.ts:160-163`).
- Scan POST: owner fence at `scan/route.ts:49-50` precedes all graph/doc work.
- `graph-queries.ts` (userGuard) and `graph-builder.ts` byte-intact vs 909c6d9.
- Chapter-0 (bible) facts are unreachable via API: both routes' zod schemas require `.positive()` chapterNumber, so the E7 chapter-0 node can't be probed cross-surface.

## 3. Cypher injection boundary — CLEAN

Every new/changed query in `graph-maintenance.ts` (`getExtractionState` :636, `markFailedExtraction` :589, `getChapterExtractionFacts` :685, updated `setContentHash`/`setStoryBibleHash`/`markSuspiciousEmptyExtraction`) uses the **static** `:Chapter` label and `$param` bindings exclusively — zero template interpolation of labels/reltypes (no `${` inside any query string in the file). `escapeLabelForQuery`/`sanitizeRelationshipType` (D-63) live in `graph-builder.ts:385/:426` — untouched, still applied at all interpolation sites (:107/:123/:256/:321-322).

## 4. Concurrency / TOCTOU — LOW, not worsened

- Counter writes are **atomic server-side** (`coalesce(...)+1` :594; `CASE WHEN c.lastEmptyHash = $emptyHash` :558-560) — concurrent marks cannot lose updates or corrupt a counter.
- Check-then-spend window: N concurrent `updateFromChapter` calls can each read `failedCount=4` and each bill one extraction → cap overshoot by N-1 attempts. Same read-then-act shape RC-4 already had for the empty cap; the route-level 90s throttle read (`getChapterNodeUpdatedAt`) has the identical pre-existing race. Single-digit overshoot bound, single-worker in practice → **LOW, pre-existing, accept**.
- Backoff semantics honestly stated: after the failed cap, a **permanent** outage is bounded in RATE (1 probe / 30 min / chapter, and only when a scan actually fires), not in total count. For the E6 post-spend class each probe bills a full extraction — ~2/hr worst case vs pre-fix every-90s unbounded. Documented design (`graph-maintenance.ts:58-71`), fine.
- Fail-open edge: `failedCount >= 5` with unparseable `lastFailedAt` (`toDate` → null, :657-661) disables the cap entirely. Only reachable if Neo4j `datetime()` serialization stops parsing in `new Date(String(raw))` — same pattern RC-4 already used for `updatedAt`, UTC `Z` suffix parses in V8. Informational.

## 5. Route response honesty — HOLDS, one LOW note

- Facts fetch is `withTimeout(5000)`-wrapped in both routes; the catch leaves `extraction = null` and the response proceeds (`route.ts:124-127`, `scan/route.ts:116-118`) — cannot 500. Degraded check path still returns `{flags:[], degraded:true, extraction}` with the honest state attached.
- Capped/failed states can never read as clean: every failure envelope carries `failed`/`suspiciousEmpty`/`failureKind`, and the derive layer (`extraction-status.ts:163-172`) maps any live marker to `state:"failed"`. Route test pins `kind:"failed"` + `reason` + numeric `retryEligibleAt` surfacing.
- **N3 (LOW).** `failureReason` is a RAW `error.message` (entity-extractor.ts:315; E6 catch `graph-maintenance.ts:331`), truncated to 300 chars (:600) and surfaced to the client as `reason`. Not PII and owner-scoped only, but infra details can leak (e.g. a Neo4j driver message embedding a `bolt://host:port` URI on the E6 path). The task brief asked for a category, not a raw dump. Recommend a later pass mapping to categories (or allowlisting) at the route boundary. Not blocking: exposure is owner-only, no secrets/key material appears in these messages, and the no-key message ("Add a key in Settings > API Keys") is deliberately user-actionable.
- **N4 (LOW, pre-existing).** POST /scan reports `state:"extracting"` (justTriggered wins) even when the fire-and-forget `updateFromChapter` will immediately no-op on a cap it discovers internally. One optimistic response; the next GET reads the durable facts honestly. Shape predates D-73 (cap moved inside `updateFromChapter` at RC-4).
- **N5 (nit).** `post-session.ts:797-802` logs "edit the chapter to retry" for ANY capped outcome — wrong recovery advice for a failed-kind (backoff) cap. Console-only, never user-facing; handoff already flags the logging as deliberately unenriched.

## 6. Type / contract drift — NONE

- `ExtractionStatusView` change is additive (`kind`, `reason` new; `retryEligibleAt`/`capped`/`attempts` pre-existed). `DeriveExtractionStatusInput` gained two REQUIRED fields — compile-breaking by design; both callers (the two routes) updated, tsc exit 0 proves no stragglers.
- Grep confirms **no UI consumer** reads `extraction.*` fields yet (routes + lib only), matching the handoff's "UI wiring deferred".
- `updateFromChapter`/`updateFromStoryBible` gained a trailing defaulted `now` param; the two existing call sites (`post-session.ts:784`, `scan/route.ts:81`) pass ≤6 args — unaffected. `post-session` consumes only `capped`/`suspiciousEmpty`/`failed`/`lowYield`/`attempts`, all still present with unchanged meaning.
- `src/lib/graph/index.ts:13` re-exports unchanged names.

---

## Disposition
- **Blocking findings:** none.
- **Follow-ups (fold into a later hardening pass, not this land):** N1 (widen pinned poison filter to the failed marker), N3 (categorize `failureReason` at the boundary), N5 (post-session cap log wording).
