# C2 — Backup/Restore Dress Rehearsal (DEV-scoped)

**Executed by:** p2-gerald · **Date:** 2026-07-17/18 · **Scope:** DEV only
**Target:** `wmb-pub-postgres-1` container, DB `writemybook` (source, untouched) → throwaway DB `wmb_restore_drill` (dropped at end)

**Result: PASS (both legs).** Postgres dump/restore cycle verified: table count matches (32/32), all
8 key-table row counts reconcile against the source once concurrent-write timing is accounted for
(see §3), and a byte-identical spot check on a real persona book's chapter/document metadata passed
exactly. Throwaway DB dropped, dump files deleted, live dev DB confirmed untouched. **§6 closes the
object-storage gap flagged in §4**: the MinIO/S3 bucket holding actual manuscript prose is also
provably backed up and restorable, with object-level checksums confirmed against the live app's
content-serving path. Throwaway bucket deleted, live `wmb-projects` bucket confirmed untouched.

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
  manuscript text sitting in object storage. **Gap closed in §6** — the object-storage leg (C2b) was
  run as a follow-up drill and confirms the bucket side is independently backed up, restorable, and
  byte-verified against the live content-serving path.

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
- **Object storage pairing:** production DR must snapshot/restore the MinIO/S3 bucket holding
  manuscript content as a **consistent pair** with the Postgres restore — see §6 for the drilled
  procedure, timings, and the specific ordering constraint that makes "paired" a hard requirement,
  not a nice-to-have.
- **Automation:** this drill was run by hand step-by-step for evidence purposes. A production
  runbook should wrap steps 1–4 in a single idempotent script with structured logging, alerting on
  non-zero exit codes, and a documented rollback (repoint to the pre-restore instance) if
  post-restore verification fails.

## 6. Object storage (MinIO/S3) leg — C2b

Manuscript prose lives in MinIO (`platform-new-minio-1`), bucket `wmb-projects` (from `S3_BUCKET`),
not Postgres — Postgres only holds `documents.storage_key` pointers. This drill closes that gap:
proves the object side is independently backed up, restorable, and byte-verified against what the
live app actually serves.

**Constraints honored:** read-only against the live bucket (list/GET only, zero writes/deletes to
`wmb-projects`); all destructive operations (mirror target, deletes) scoped to a brand-new throwaway
bucket `wmb-restore-drill-c2b`, created and destroyed entirely within this drill.

**Tooling:** AWS CLI v2 (`aws --endpoint-url http://localhost:9000 ...`) against MinIO's S3-compatible
API, credentials sourced from the app's own `S3_*` env vars (`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/
`S3_ENDPOINT`/`S3_REGION`).

### Commands (reproducible)

```bash
# 1. Enumerate (read-only)
aws --endpoint-url $S3_ENDPOINT s3api list-objects-v2 --bucket wmb-projects

# 2. Create throwaway target + mirror bucket-to-bucket (server-side, no local disk)
aws --endpoint-url $S3_ENDPOINT s3 mb s3://wmb-restore-drill-c2b
aws --endpoint-url $S3_ENDPOINT s3 sync s3://wmb-projects/ s3://wmb-restore-drill-c2b/

# 3. Verify object count + checksums (ETag == MD5 for non-multipart MinIO objects)
aws --endpoint-url $S3_ENDPOINT s3api list-objects-v2 --bucket wmb-restore-drill-c2b
aws --endpoint-url $S3_ENDPOINT s3api head-object --bucket wmb-projects --key <known-key>
aws --endpoint-url $S3_ENDPOINT s3api head-object --bucket wmb-restore-drill-c2b --key <known-key>

# 4. Cleanup
aws --endpoint-url $S3_ENDPOINT s3 rm s3://wmb-restore-drill-c2b --recursive
aws --endpoint-url $S3_ENDPOINT s3 rb s3://wmb-restore-drill-c2b
```

### Timings

| Step | Time |
|---|---|
| List objects (before) | 2.499s |
| Create throwaway bucket (`mb`) | 1.727s |
| Bucket-to-bucket mirror (`sync`, 1766 objects) | 33.547s |
| List objects (after, verification) | 2.280s |
| Cleanup (`rm --recursive` + `rb`) | 14.639s |
| **Combined object-storage cycle (mirror + verify)** | **~40s** |

### Verification results

- **Object count reconciliation:** initial pre-mirror count was 1712; post-mirror throwaway-bucket
  count was 1766. Re-listed the **source** bucket immediately after (same tight-window bracketing
  methodology as the Postgres drill, §3) and got 1766 — exactly matching. **Reconciled**: the
  mismatch was ~37s of concurrent writes from other live QA agents during the mirror+list window, not
  a mirror-fidelity defect.
- **Checksum spot check:** picked chapter storage_keys from the "Dead Reckoning 31 QA P2" book
  (queried `documents.storage_key` directly rather than assuming a naming convention — chapter_number
  does not map 1:1 to `chapter-0N.md` for this book, e.g. chapter_number=1's real key is
  `manuscript/act-1/chapter-02.md`). ETags (= MD5 for single-part MinIO uploads) matched exactly
  between source and throwaway-bucket copies for all objects checked, confirming byte-identical
  mirroring.
- **Backed-up bytes vs. live GET `/content` response:** the GET route (`.../chapters/[chapterId]/content`)
  calls `DocumentService.readPinned()`, which reads the **versioned snapshot** at
  `.versions/<documentId>/v<version>.md`, not the plain `storageKey` object — confirmed by code read
  of `document-service.ts` / `storage-keys.ts`. Fetched that exact snapshot object directly from S3
  (`v22.md` for chapter 1, MD5 `55f050a883357b89ba09031b7d255d53`) and compared against the API's
  JSON `markdown` field. Initial byte-level diff looked alarming (35884 vs 35997 bytes, near-full-file
  diff hunk) — root-caused to **my own comparison tooling**, not a serving-path defect: the API
  response had picked up CRLF line terminators through the curl+jq JSON-extraction pipeline on
  Windows, versus the S3 object's native LF-only bytes, plus one trailing blank line added by `jq`'s
  raw-string extraction. After normalizing line endings on both sides, the diff is **zero** — the live
  app serves byte-for-byte identical prose to the durably-stored version snapshot. No defect filed.
- **Restore-into-throwaway-bucket drill:** the bucket-to-bucket `s3 sync` (step above) **is** the
  restore drill — MinIO/S3 has no separate "restore" primitive distinct from a mirror/copy operation;
  syncing into a fresh bucket and verifying checksums against the source **is** the object-storage
  restore procedure, timed at 33.5s for 1766 objects (~19ms/object at this volume).

### Combined DB + object RTO and the ordering constraint

- **Combined cold-start RTO estimate (dev-scale):** Postgres restore (~6.5s warm-cycle, §2) +
  object-storage restore (~40s mirror+verify) ≈ **under 1 minute** at current dev data volume. Both
  legs scale independently with data size (Postgres with row/index count, S3 with object count/size)
  and must be re-measured together against realistic prod volume — see §5.
- **Ordering constraint (the DR-critical part):** Postgres `documents.storage_key` /
  `DocumentVersion` rows and S3 objects must be restored **as a single consistent pair**, not
  independently, because the DB is the pointer and the bucket is the payload. Restoring the DB to a
  point-in-time snapshot without restoring the bucket to the **same** point-in-time (or vice versa)
  produces one of two failure modes: (a) DB points to a `storage_key`/version that doesn't exist in
  the restored bucket (404 on read), or (b) the bucket has objects with no corresponding DB pointer
  (orphaned, unreachable via the app — a storage leak, not a correctness bug, but wasted spend and a
  latent GDPR-deletion gap since app-level delete only removes what the DB knows about). A production
  restore runbook must pick a **single consistent backup timestamp** and restore both legs from
  snapshots taken at (or before) that same timestamp — the versioned-snapshot design
  (`.versions/<id>/v<n>.md`, immutable once written) helps here: as long as the object-storage backup
  is taken at or after the DB backup's timestamp, every version the DB can reference is guaranteed to
  already exist in the object backup, because snapshots are write-once and never deleted. The
  live-key (mutable) path does not have this guarantee and needs same-instant pairing.

### Prod gaps (object-storage leg)

- **Windows MAX_PATH is a sandbox artifact, not relevant to prod:** an initial local-disk
  `aws s3 sync` attempt hit `[WinError 206]` on deeply-nested `.versions/<uuid>/vN.md` keys due to
  Windows' 260-char path limit combined with this drill's already-deep scratchpad temp path. Not a
  MinIO or product defect — worked around (and arguably improved the drill) by switching to a direct
  bucket-to-bucket server-side mirror, which never touches a local filesystem and is closer to a real
  production DR pattern (cross-bucket/cross-region replication) than local-disk staging would be.
- **No automated pairing check exists today.** Nothing in the codebase verifies, at restore time or
  on a schedule, that every `documents.storage_key` the DB references actually resolves to a present
  S3 object (or flags orphaned objects). Production should add a periodic reconciliation job
  (list bucket keys, diff against `SELECT DISTINCT storage_key FROM documents`) as a standing
  integrity check independent of the restore path.
- **Credentials/automation gaps mirror §5** (secrets manager, non-manual runbook, re-measurement at
  prod scale) — apply identically to the object-storage leg.
