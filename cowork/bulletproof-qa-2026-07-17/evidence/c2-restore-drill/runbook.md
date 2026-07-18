# C2 — Backup/Restore Dress Rehearsal (DEV-scoped)

**Executed by:** p2-gerald · **Date:** 2026-07-17/18 · **Scope:** DEV only
**Target:** `wmb-pub-postgres-1` container, DB `writemybook` (source, untouched) → throwaway DB `wmb_restore_drill` (dropped at end)

**Result: PASS.** Full dump/restore cycle verified: table count matches (32/32), all 8 key-table row
counts reconcile against the source once concurrent-write timing is accounted for (see §3), and a
byte-identical spot check on a real persona book's chapter/document metadata passed exactly.
Throwaway DB dropped, dump files deleted, live dev DB confirmed untouched.

## 0. Constraints honored
- Never dropped/altered the live `writemybook` DB — all CREATE/DROP DATABASE and pg_restore
  calls targeted only `wmb_restore_drill`.
- No `src/` edits, no server/worker restarts, no destructive calls against other personas' data.
- No local `pg_dump`/`pg_restore`/`psql` binaries exist on this Windows host — every command below
  runs via `docker exec` against the running Postgres container, which ships the client tools.

## 1. Commands (exact, reproducible)

```bash
# 1. Dump (full DB, custom/compressed format) to a scratch file
docker exec wmb-pub-postgres-1 pg_dump -U postgres -Fc -d writemybook > c2_writemybook.dump

# 2. Create throwaway DB on the same server
docker exec wmb-pub-postgres-1 psql -U postgres -c "CREATE DATABASE wmb_restore_drill;"

# 3. Restore the dump into the throwaway DB
docker exec -i wmb-pub-postgres-1 pg_restore -U postgres -d wmb_restore_drill < c2_writemybook.dump

# 4. Verify — table count
docker exec wmb-pub-postgres-1 psql -U postgres -d writemybook       -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
docker exec wmb-pub-postgres-1 psql -U postgres -d wmb_restore_drill -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

# 4b. Verify — row counts, 8 key tables (repeat per table, source vs restored)
docker exec wmb-pub-postgres-1 psql -U postgres -d <db> -t -c "SELECT count(*) FROM <table>;"
# tables (Prisma model -> actual table name): User->users, Book->books, Chapter->chapters,
# Document->documents, WriterMemory->writer_memories, EditFinding->edit_findings,
# Subscription->subscriptions, BatchRun->batch_runs

# 5. Timing captured with: T0=$(date +%s.%N) ... T1=$(date +%s.%N); awk -v a="$T0" -v b="$T1" 'BEGIN{printf "%.3f", b-a}'

# 6. Cleanup
docker exec wmb-pub-postgres-1 psql -U postgres -c "DROP DATABASE wmb_restore_drill;"
rm -f c2_writemybook.dump c2_writemybook_2.dump
```

## 2. Timings (RTO evidence)

| Step | Elapsed |
|---|---|
| pg_dump (full DB, custom format, 195,778 B) | 3.789 s |
| CREATE DATABASE (throwaway) | 3.480 s |
| pg_restore into throwaway | 4.833 s |
| **First full dump→restore cycle** | **~12.1 s** |
| Second pg_dump (tight-window re-verify, 199,522 B) | 1.306 s |
| DROP + CREATE + pg_restore (combined, second cycle) | 5.184 s |
| **Second full cycle (dump not included above)** | **~6.5 s** (restore leg only) |
| DROP DATABASE (final cleanup) | 0.882 s |
| Delete both dump files | 0.203 s |

At this dev data volume (~32 tables, ~250 total rows across the 8 key tables, ~196 KB dump), a
complete backup+restore+verify+cleanup cycle costs **under 15 seconds wall-clock**. This is the dev
baseline only — see §5 for what changes at production scale.

## 3. Verification results

**Table count:** source 32 / restored 32 — MATCH.

**Row counts, 8 key tables — first pass** (slow ~43 s verification loop, run against the shared,
actively-written dev DB):

| Table | Source | Restored | |
|---|---|---|---|
| users | 10 | 10 | MATCH |
| books | 42 | 42 | MATCH |
| chapters | 102 | 102 | MATCH |
| documents | 85 | 84 | **apparent mismatch** |
| writer_memories | 2 | 2 | MATCH |
| edit_findings | 83 | 82 | **apparent mismatch** |
| subscriptions | 6 | 6 | MATCH |
| batch_runs | 2 | 2 | MATCH |

Two tables (`documents`, `edit_findings`) looked off by 1 row. This DB is shared and under active,
continuous write load from other QA agents running live journeys concurrently (P3 Selena, P5 Sam,
etc.) — the first verification loop took ~43 s (one `psql` invocation per table), which is more than
enough time for other agents to commit new rows mid-comparison.

**Root-cause isolation (tight-window re-verify):** captured `documents`/`edit_findings` counts
immediately before and immediately after a second, fresh `pg_dump` (1.306 s runtime):

| Table | before_dump | after_dump | drift |
|---|---|---|---|
| documents | 86 | 86 | 0 |
| edit_findings | 83 | 85 | **+2 in 1.3 s** |

`edit_findings` gained 2 rows within the dump's own ~1.3-second runtime — direct proof the source DB
was being written to *during* the dump, not that the dump/restore lost or duplicated anything.

**Final restore (from the second, tight-window dump) vs. both baselines:**

| Table | restored | before_dump | after_dump | verdict |
|---|---|---|---|---|
| documents | 86 | 86 | 86 | MATCH |
| edit_findings | 85 | 83 | 85 | MATCH vs after_dump |

The restored `edit_findings` count (85) matches the count taken *after* the dump completed, not
before — exactly what `pg_dump`'s MVCC-consistent-snapshot behavior predicts: the snapshot is
acquired at/near the start of the dump's own transaction, and any commits landing in the small
window between the "before" probe and actual snapshot acquisition (itself a separate `docker exec` +
`psql` round trip with its own process-spawn latency) are legitimately included. **Conclusion: no
restore-fidelity defect.** The two "mismatches" are fully and precisely explained by concurrent write
activity from other live agents on a shared, actively-used dev database, not by any bug in
`pg_dump`/`pg_restore`.

**Byte-identical content spot check** — persona book "Dead Reckoning 31 QA P2"
(`636a1f02-8520-4b66-8e78-08c8e0fee5f0`, 8 real chapters, 8 real Document rows): serialized
`chapters` × `documents` (chapter_number, title, word_count, status, beta_score, beta_gate, type,
current_version, storage_key), ordered by chapter_number, from both source and restored DB.

- Source MD5: `936790d59d6bca1b4417661946782e02` (8 rows)
- Restored MD5: `936790d59d6bca1b4417661946782e02` (8 rows)
- `diff`: empty — **byte-identical**.

## 4. Gotchas encountered

- **No local Postgres client tools on this Windows host.** `pg_dump`/`pg_restore`/`psql` are not on
  PATH; every operation must go through `docker exec` (or `docker exec -i` for piping stdin on
  restore) against `wmb-pub-postgres-1`, which bundles the matching client version (16.10, Alpine).
- **`bc` is not available** in this Git Bash environment for timing math; use `awk`
  (`awk -v a="$T0" -v b="$T1" 'BEGIN{printf "%.3f", b-a}'`) with `date +%s.%N` instead.
- **Live-DB drift during verification is expected, not a bug**, on a shared dev DB with multiple
  concurrent QA agents. Two mitigations for a cleaner verification going forward: (a) capture
  before/after counts as tightly as possible around the dump itself (sub-2s window), or (b) briefly
  quiesce writes (pause other agents' work) before measuring, if a zero-ambiguity comparison is
  required.
- **Prisma model names ≠ table names.** The mapping used here: `User`→`users`, `Book`→`books`,
  `Chapter`→`chapters`, `Document`→`documents`, `WriterMemory`→`writer_memories`,
  `EditFinding`→`edit_findings` (this is the "EditorialFinding" table by another name),
  `Subscription`→`subscriptions`, `BatchRun`→`batch_runs`.
- **Postgres-only backup does not cover everything.** Manuscript prose content lives in MinIO/S3
  object storage (`StorageAdapter`), addressed by `documents.storage_key` — Postgres only stores
  metadata/pointers and version bookkeeping (`DocumentVersion`). This drill's spot check therefore
  verified DB-side metadata identity (chapter/document rows), not prose-byte identity of the actual
  manuscript text sitting in object storage. A real backup/restore procedure needs a paired
  object-storage bucket backup/restore step to be a true DR guarantee — **this is a gap to close
  before a production runbook is considered complete**, not something this DEV-scoped Postgres drill
  could exercise.

## 5. What production needs differently

- **Credentials:** this drill used the dev `.env` `DATABASE_URL` (`postgres`/`postgres` on
  localhost). Production must pull creds from the secrets manager at restore time, never from a
  checked-in or long-lived `.env`, and the restore operator's role should be scoped/audited
  separately from the app's runtime DB role.
- **Size / duration:** this dev DB is ~196 KB compressed, 32 tables, ~250 rows across the 8 key
  tables — the entire cycle finished in under 15 seconds. Production data volume will be orders of
  magnitude larger (real user manuscripts, full version history, editorial findings across the whole
  user base); `pg_dump -Fc` and `pg_restore` both scale roughly linearly with data size and index
  count, so RTO must be re-measured against a realistic prod-sized snapshot (or the most recent prod
  backup restored into a scratch environment) rather than assumed from this dev timing.
- **Downtime window:** a prod restore of this kind (full logical restore into a fresh DB) is not
  something to run against a live, serving database in place — it needs either (a) a maintenance
  window with the app taken out of rotation, or (b) a blue/green cutover restoring into a fresh
  instance and repointing `DATABASE_URL` once verified, which avoids user-facing downtime but adds
  operational complexity (connection draining, cutover verification, rollback plan).
- **Object storage pairing:** production DR must also snapshot/restore the MinIO/S3 bucket holding
  manuscript content, and the restore runbook must verify DB `storage_key` pointers resolve to
  present objects post-restore — this drill did not (and could not, DEV Postgres-only) exercise that
  leg.
- **Automation:** this drill was run by hand step-by-step for evidence purposes. A production
  runbook should wrap steps 1–4 in a single idempotent script with structured logging, alerting on
  non-zero exit codes, and a documented rollback (repoint to the pre-restore instance) if
  post-restore verification fails.
