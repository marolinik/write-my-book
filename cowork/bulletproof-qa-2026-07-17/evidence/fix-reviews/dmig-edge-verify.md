# verify-dmig — edge-purge migration adversarial review

**Verdict:** APPROVE-WITH-NOTES (Fable adversarial verifier, 2026-07-19)
**Artifact:** `scripts/migrate-purge-contaminated-edges.ts` + test + `evidence/edge-purge-census.md`
**Gate:** own tests 15/15 green; `tsc --noEmit` exit 0 (whole tree — d5's `getEmptyExtractionState` red lane already cleared). Census claim verified from code: 0 crossDeletes + 0 mergePlans + 0 unbackfillable → the only `--execute` write is 340 additive `SET r.userId` (script :643-651), zero deletes.

## 8 checks — all PASS
1. Owner resolution — never guesses; cross-user/ghost-book → unbackfillable (pinned by test :63-67).
2. Series exemption — same-owner same-non-null-seriesId never auto-deleted; two NULL seriesIds NOT treated as same series (test :98-105).
3. Cross-tenant delete — different owners → `delete_cross_user`; same edge independently unbackfillable; no path stamps a cross-user edge.
4. Merge safety — exactly one canonical edge survives, props folded latest-updatedAt-wins; no relationship dropped (tests :130-168).
5. Injection boundary — ONE interpolation site `:605` guarded by `assertSafeType` (`/^[A-Za-z0-9_]+$/`); real `sanitizeRelationshipType` reused, not weakened; all else `$param`-bound.
6. Idempotence + gating — dry-run writes nothing; `--execute` sole write path; order c→b→a with removed-id skips; re-run is a no-op.
7. Exit codes — dry-run exits 1 on any contamination; execute exits 1 iff review items remain.
8. **Node-userId (BLOCKER) — CONFIRMED.** `userGuard` (graph-queries.ts:336-337) is null-safe `userId IS NULL OR userId = $userId`; with 310/310 nodes null the guard passes EVERY node for EVERY tenant — allow-all, not just "off". Edge stamping alone does NOT restore isolation. **Node backfill is mandatory before RC-6 is real** → tracked as **D-71** (dispatched to d-mig).

## Hardenings to fold BEFORE landing (latent — unreachable on today's 0-merge census, but this script may run on prod data with real merge groups)
- **H1 (finding 6 single-pass):** in the CREATE-canonical branch (`:602-608`), also `SET r.userId` from `bookMeta.get(plan.bookId)`. Without it, a merge that CREATEs a fresh canonical edge whose variants carried no userId leaves 1 un-stamped edge that the pre-scanned backfill list misses → needs a 2nd `--execute` pass. Fold → single-pass convergence.
- **H2 (finding 4 determinism):** comparator (`:278-280`) never returns 0 → identical/null `updatedAt` members get engine-order winner. Add an `edgeId` tiebreak for strict determinism (harmless today; winner/loser are dupes).
- **H3 (blind-spot count):** edges with a NULL-bookId endpoint are excluded from all three scans (`:408,:416,:430`) — never remediated NOR counted. Add an informational census count so the report is complete (no behavior change).

## Operational SOP for the gated `--execute` run (runbook, not code)
- **Quiesce the app** before any run where `crossDeletes>0` (Neo4j recycles relationship ids after deletes; a captured `id(r)` could redirect a write to a recycled id). Today's payload is additive-only SET → worst case is stamping an already-stamped fresh edge (harmless), but make quiescing the standing rule.
- Take a graph backup first.
- Run edge + node (D-71) backfills together as ONE remediation — edge-only restores zero isolation.
- Cosmetic: early-throw on Neo4j-unreachable (`:383-387`) skips `finally` closeNeo4j — process may linger on infra failure.

## Landing plan
Fold H1/H2/H3 → re-run the 15 tests + tsc → land edge + node scripts + this review in one migration commit → THEN the gated, backed-up, quiesced `--execute`. Rename `migrate-purge-contaminated-edges.ts` (drop "contaminated", echoes D-30) via `git mv` at commit time.
