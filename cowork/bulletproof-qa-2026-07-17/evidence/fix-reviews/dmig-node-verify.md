# verify-dmig — D-71 node-userId backfill adversarial review

**Verdict:** APPROVE-WITH-NOTES (Fable, 2026-07-19)
**Artifact:** `scripts/migrate-backfill-node-userid.ts` + test (6/6) + `evidence/node-userid-census.md` (310 total, 310 unstamped, 310 backfillable, 0 anomaly)
**Gate:** own tests 6/6 (VITEST_EXIT=0); `tsc --noEmit` exit 0.

## 8 checks — all PASS
1. Owner resolution — owner = ownerByBook.get(node.bookId); undefined → anomaly, never guessed. Book.userId single non-null column → always unambiguous. No backfill without a resolved book (tests :50-59, :82-85).
2. Never-overwrite / TOCTOU — read filter `n.userId IS NULL` (:180) + write re-assert `AND n.userId IS NULL` on id(n) (:257): a node stamped between read and write is skipped, not clobbered; re-run no-op. `already_stamped` pinned twice.
3. Scope — only `n.bookId IS NOT NULL` nodes read; global/no-bookId nodes never stamped nor counted anomaly.
4. **Mis-stamp = leak — NO PATH FOUND.** userId travels with nodeId in one row ({nodeId,userId}); no positional coupling; owner from node's OWN bookId; malformed bookId → map miss → anomaly (fail-safe). Only residual = Neo4j id-recycle window → mitigated by quiesce SOP.
5. Injection — single write `$rows`-bound; both reads zero interpolation; doesn't even import graph-builder/graph-queries; boundary untouched.
6. Gating + exit — write inside `if (execute && backfillable.length>0)`; dry-run READ + census file only; exit 1 on unstamped-found / anomalies-remain.
7. **Isolation restored — monotonically safening.** userGuard `(userId IS NULL OR userId = $userId)`: after 310 stamps another tenant's node (non-null != $userId) is excluded; correct-owner stamp only shrinks visibility, never routes to wrong tenant. Residual (i): guard stays null-safe → a FUTURE unstamped-write regression silently bypasses it → **D-72** (flip to strict `= $userId` after backfill universal). Residual (ii): a hypothetical pre-existing wrong stamp is preserved by never-overwrite — moot (310/310 NULL today).
8. Census sanity — reconciles with edge census (same books, same single owner uuid; "orphaned Milan" unfounded — book 137412c3 resolved to owner 4611e6b9 in BOTH). 0 anomaly plausible for a dev DB with one active writer.

## Ordering
Node vs edge backfill are ORDER-INDEPENDENT (additive SET on disjoint props n.userId vs r.userId; neither reads the other's stamps). Practical: run nodes first (node stamps make the guard real).

## Non-blocking notes
- Quiesce the app during `--execute` (id-recycle window).
- **D-72:** after both backfills run + post-fix writes confirmed stamping, harden userGuard null-safe → strict `= $userId` (closes the finding-7 regression bypass).
- Cosmetic: closeNeo4j skipped on the early Neo4j-unreachable throw (before try/finally) — same as edge script.

## Landing
Node script needs NO further change. Lands with the hardened edge script + both reviews in ONE migration commit; `--execute` gated (backup + quiesce; nodes-first).
