# D-31 fix review: empty LLM extraction no longer stamps content-hash

Worktree: D:\Projects\wmb-pub\.claude\worktrees\agent-a148c9d15826cabd0
Branch: worktree-agent-a148c9d15826cabd0
Commit reviewed: b222b08 on top of qa HEAD 7e1002e
Files changed: src/lib/graph/graph-maintenance.ts (+109/-6), tests/unit/graph-empty-extraction-poison.test.ts (new, 349 lines, 12 tests)

## Verification performed

1. Read full diff (git diff 7e1002e..b222b08) and the complete post-fix graph-maintenance.ts.
2. Traced extractEntities in src/lib/graph/entity-extractor.ts.
Confirmed zero DB/graph side effects (grep for withSession/db./neo4j/prisma in that file returned no hits).
Confirmed its catch block returns an empty entities/relationships result rather than throwing on any failure.
This is exactly the D-31 premise and validates the extraction-is-pure, safe-to-run-before-delete reordering claim.
3. Reproduced the RED/GREEN split empirically, not just by reading.
Temporarily checked out the pre-fix graph-maintenance.ts (git checkout 7e1002e for that one file) with the test file left at HEAD, and ran the new test file directly.
Pre-fix result: exactly 6 failed and 6 passed.
The 6 failures are precisely the D-31-fix-asserting cases: hash-not-stamped, no-delete-on-empty, marker-written, hard-failure-also-no-delete, bible-hash-not-stamped, and one interaction case.
This exactly matches the fixers claim (fixers without apostrophe, deliberately).
Restored the fix commit afterward and confirmed the worktree was clean.
4. Full suite plus typecheck on the fix commit: tsc noEmit returned 0 errors.
Full vitest run returned 599/599 passed across 88/88 files, matching the claimed numbers exactly.
5. D-30 regression check: graph-builder.ts, where the D-30 bookId-binding fix lives, is untouched by this diff.
Confirmed via the diff stat that only graph-maintenance.ts and the new test file changed.
Ran graph-cross-book-isolation.test.ts (5 tests) and continuity-graph-properties.test.ts (14 tests) explicitly: all 19 green. No regression risk.
6. Crash-window analysis. New order is extract, then delete, then upsert, then stamp. Old order was delete, then extract, then upsert, then stamp.
The chapter-data-missing window used to span the entire LLM extraction call (which can take minutes for a dense chapter per an existing code comment), because delete ran first.
In the new order, delete happens only after a known-good extraction result, and delete-to-upsert is two back-to-back Neo4j write transactions with no network or LLM latency in between.
This is a strict improvement, not a regression: the crash window shrinks by orders of magnitude.
Delete and upsert are still two separate withSession calls, not one Cypher transaction, so they are not atomic with each other, but that non-atomicity is pre-existing and not worsened by this fix.
If the process dies between delete and upsert, contentHash is never stamped since it is set last, so the next scan detects a hash mismatch and fully re-extracts and re-populates: self-healing, same recovery mechanism as before.
7. updatedAt/throttle coupling: confirmed shouldExtract() in continuity-flags.ts is a simple recency check, now minus lastExtractedAt >= 90000ms, not an exponential backoff or attempt cap.
Bumping updatedAt on a failed or suspicious-empty extraction therefore cannot permanently starve retries: a chapter scanned at intervals of 90 seconds or more will always be eligible to retry, indefinitely.
This mirrors the pre-existing behavior for successful extractions, which also bump updatedAt via setContentHash.
Grepped all consumers of c.updatedAt and getChapterNodeUpdatedAt: graph-queries.ts, the continuity scan route, and graph-maintenance.ts itself. No other consumers meaning is changed by this fix.
8. Caller audit for the 50-word threshold bounded-retries claim: confirmed exactly two callers of updateFromChapter.
The continuity scan route at src/app/api/books/[id]/continuity/scan/route.ts is explicitly gated by the 90s shouldExtract throttle.
The post-session.ts updateChapterGraph is called once per completed write-chapter or revise agent session: human-cadence, not a loop. Neither is a runaway loop.

## Findings

### MEDIUM: false-positive retry cost has no ceiling for legitimately entity-free content

The post-session.ts caller (updateChapterGraph, called on every write-chapter/revise session completion) has no throttle at all: it relies solely on updateFromChapter's internal content-hash check.
For a genuinely entity-free chapter of 50+ words (an epigraph, a poem, a scene-break/interlude page, all realistic in fiction), every future revise/write-chapter session on that unchanged chapter will re-trigger a full billed LLM extraction, forever.
This happens because the hash is deliberately never stamped for a suspicious-empty result. There is no cap, backoff, or intentionally-empty suppression (the codebase has this pattern elsewhere for continuity flags but not here).
This is bounded by human revision cadence, not machine-loop unbounded, so it is not a blocking issue, but it is a real cost/perf tradeoff introduced by fixing the data-loss bug (pre-fix, such a chapter would hash-stamp once and then be silently, permanently skipped).
Worth a fast-follow ticket, not a blocker for D-31 itself, since correctness (no silent data loss) is rightly prioritized over this bounded cost edge case.

### LOW: sibling-path claim only partially true (updateFromStoryBible)

The story-bible branch correctly skips the hash stamp on a suspicious-empty result (data-loss protection present), but unlike the chapter path it does not call an equivalent marker function: no updatedAt bump, no lastEmptyExtractionAt/emptyExtractionCount.
So the claim that the same fix was applied to updateFromStoryBible() is accurate for the core data-loss fix but not for the observability/marker parity.
Currently low-impact: repo-wide grep confirms updateFromStoryBible has zero live callers anywhere in src/ outside its own definition, the graph/index.ts re-export, and test files, so it is not wired into any story-bible save route today.
Worth tightening for consistency whenever that path gets wired up, not a blocker now.

### LOW: no boundary test at exactly 50 words

SUSPICIOUS_EMPTY_MIN_WORDS = 50 is a well-documented, exported constant (good, not a silent magic number), but the test suite only exercises 120-word substantive and 2-word trivial content, not the >= 50 boundary itself.
Minor test-coverage gap, not a functional concern since the comparison logic is simple and correct by inspection.

### Not a concern (verified, no issue)

- No SQL/Cypher injection risk introduced: all new Cypher uses parameterized queries; the one interpolated piece (escapeLabelForQuery) is pre-existing and untouched by this diff.
- No mutation of shared/external state; countWords and isSuspiciousEmptyExtraction are pure functions.
- Types are explicit on all new exported/module functions (ExtractionResult, Promise<void>, etc.); no any.
- console.warn/console.error usage matches this module's pre-existing, established error-observability pattern (the file already used console.error before this diff), not a new deviation.
- D-30 bookId threading is preserved unchanged, just now running after the suspicious-empty short-circuit instead of before it: behaviorally identical on the success path.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 1     | info   |
| LOW      | 2     | note   |

Verdict: SAFE. Empirically verified, not just read: 6/6 RED tests fail on pre-fix code, 12/12 GREEN on the fix; full suite 599/599; tsc 0 errors; D-30 isolation tests unaffected.
The crash-window reordering is a genuine improvement. The one MEDIUM finding (unbounded-but-human-paced retry cost for legitimately empty 50+-word chapters via the post-session caller) is a real tradeoff worth a fast-follow ticket but does not warrant blocking a fix whose entire purpose is preventing silent, permanent data loss.
