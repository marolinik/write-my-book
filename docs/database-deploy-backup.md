# Database Deploy and Backup Procedure

The project currently uses Prisma `db push` for schema sync because migration
history drifted earlier in development. Production `db push` must be treated as a
controlled release operation.

## Executable preflight

Run before any production schema sync:

```bash
npm run db:deploy:check
```

In real production (`NODE_ENV=production` and `CI!=true`) this requires:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Target PostgreSQL database; must not be localhost |
| `DB_DEPLOY_APPROVED=true` | Human confirmation after reviewing schema diff/risk |
| `DB_BACKUP_CONFIRMED_AT` | ISO timestamp for a fresh backup, no older than 2 hours |
| `DB_BACKUP_LOCATION` | Backup object/path/location that can be restored |

CI checks only the schema file and database URL contract; it does not require a
real backup.

## Production schema sync command

After a fresh backup is confirmed:

```bash
export NODE_ENV=production
export DB_DEPLOY_APPROVED=true
export DB_BACKUP_CONFIRMED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export DB_BACKUP_LOCATION="s3://wmb-projects/backups/hourly/backup-YYYYMMDD-HHMMSS.sql.gz"
npm run db:push:prod
```

`npm run db:push:prod` runs:

1. `npm run db:deploy:check`
2. `npx prisma generate`
3. `npx prisma db push`

## Backup sidecar

`docker-compose.prod.yml` includes a `db-backup` sidecar that:

- runs `pg_dump` hourly (plain SQL format, gzipped),
- uploads compressed backups to MinIO/S3,
- keeps 24 hourly, 7 daily, and 4 weekly backups through `scripts/backup-rotate.sh`.

### Failure handling (never a silent empty/partial upload)

The dump step does **not** rely on `pipefail` (busybox `ash` in `postgres:16-alpine`
does not support it). Instead it dumps to a temp file first, then explicitly checks:

1. **Empty no-op guard** — if `POSTGRES_PASSWORD` / `POSTGRES_USER` are empty the
   loop logs `BACKUP FAILED: POSTGRES_PASSWORD/POSTGRES_USER is empty` and skips the
   hour (no empty dump produced).
2. **Exit code** — `pg_dump`'s own exit code is captured (`$?`); a non-zero exit logs
   `BACKUP FAILED: pg_dump exit <n>` and skips the hour.
3. **Min-size guard** — the raw dump must be ≥ 1000 bytes (`wc -c`), otherwise it logs
   `BACKUP FAILED: dump suspect (<n> bytes)` and skips the hour.

On any failure the loop also drops a `/tmp/backup-FAILED` marker (removed on the next
success). The searchable `BACKUP FAILED:` line is the durable alert signal; note that
`/tmp` inside the container is ephemeral, so rely on the log line (and the watchdog
below) rather than the marker for long-lived monitoring.

Verify the backup sidecar after deployment:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs db-backup --tail=100
# healthy iteration:
#   Backup completed: <TS>                         (with no preceding BACKUP FAILED line)
# unhealthy iteration (matches on-call search):
#   BACKUP FAILED: ...
```

### Stale-backup watchdog

A second container, `db-backup-watchdog` (image `minio/mc`, no new infrastructure),
alerts when the newest hourly backup is missing or older than `STALE_AFTER`
(default `2h`, tune with `BACKUP_STALE_AFTER`). On staleness it:

- logs a searchable `BACKUP STALE at <ts>: no hourly backup newer than <n> under <path>` line,
- writes `STALE` into a durable marker file mounted at `/var/backup-health/stale-marker`
  (shared `backup-health` volume, readable from the host without entering the container),
- exits non-zero so an external monitor (Docker container state / restart, uptime
  probe, host cron reading the marker file) can alert.

The loop sleeps `WATCHDOG_INTERVAL` (default 3600s) before each check, so a stale
container restarts at most once per hour. Healthy checks log `BACKUP OK at <ts>` and
clear the marker.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs db-backup-watchdog --tail=50
# healthy:   BACKUP OK at ...: newest hourly backup present: backup-<TS>.sql.gz
# stale:     BACKUP STALE at ...: no hourly backup newer than 2h under ...
# marker:    (on host) docker run --rm -v wmb-pub_backup-health:/v alpine cat /v/stale-marker
```

## Single-MinIO risk (currently NOT fully mitigated by code)

The production `db-backup` sidecar uploads to the **same** MinIO instance that stores
manuscripts (`wmb-projects` bucket). The backup objects are only logically separated
under `wmb/wmb-projects/backups/`. A loss of that MinIO volume therefore loses both
manuscripts **and** backups. The code cannot fully remove this risk; operators MUST do
the following:

### REQUIRED-ACTION checklist for operators

- [ ] **(b) Off-host replication / sync.** Schedule an external periodic sync to an
      offsite S3-compatible target. Example using `mc mirror` (run on the host or a
      cron — **outside** the main MinIO stack so it is not lost with it):
      ```bash
      ### env: HOST creds for both endpoints (offsite target must not share the manuscript vault)
      mc alias set backup-primary http://minio:9000   $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
      mc alias set backup-offsite https://s3.eu-west-1.amazonaws.com $WMB_OFFSITE_AK $WMB_OFFSITE_SK
      ### nightly mirror, newest hourly + daily/weekly, from the *primary* (source of truth):
      mc mirror --watch --overwrite --remove \
        backup-primary/wmb-projects/backups/ backup-offsite/wmb-backups/
      ```
      Use `--watch` (continuous) in a daemon, or a cron of a one-shot `mc mirror` for a
      scheduled copy. Keep the offsite bucket **out of region / different account** from
      the primary.
- [ ] **(a) Enable MinIO versioning on the backups bucket** so an overwrite/delete
      inside the hourly/daily/weekly layout is recoverable (retention + rotation still
      delete old objects, but versioning guards against accidental loss of today's copy):
      ```bash
      mc version enable backup-primary/wmb-projects/backups
      ```
- [ ] **(c) S3 lifecycle / archive.** Set a lifecycle to transition old backups to a
      cheaper tier (or object-lock them) so long-term copies survive the hot volume:
      ```bash
      mc ilm add --expiry-days 90 backup-primary/wmb-projects/backups            # tier/expire old objects
      mc object lock enable backup-primary/wmb-projects/backups --mode COMPLIANCE --default-retention 7d 2>/dev/null
      ```
      (Adjust days/mode to your retention policy; object-lock makes retention
      immutable.)
- [ ] **Harden access.** Ensure the `backups` bucket is **not** world-writable with the
      manuscript bucket's credentials. Give the backup writer its own low-privilege
      identity scoped to `backups/*` only, and never expose it to the app tier:
      ```bash
      # 1) create a write-only policy limited to the backups prefix
      cat >/tmp/backups-rw.json <<'EOF'
      { "Version": "2012-10-17", "Statement": [
        { "Effect": "Allow", "Action": ["s3:PutObject","s3:GetObject","s3:ListBucket","s3:DeleteObject"],
          "Resource": ["arn:aws:s3:::wmb-projects/backups/*", "arn:aws:s3:::wmb-projects/backups"] } ] }
      EOF
      mc admin policy create backup-primary backups-rw /tmp/backups-rw.json
      # 2) create a non-root key for backup tooling and attach the scoped policy
      mc admin user add backup-primary wmb-backup "$(openssl rand -base64 32)"
      mc admin policy attach backup-primary backups-rw --user wmb-backup
      # 3) the backup sidecar/watchdog then alias minio with the wmb-backup key, not the root key
      ```
      At minimum, keep the manuscript write credentials separate from anything that
      writes `backups/`, and do not keep using the root key for backups in production.

> **Note:** the `db-backup-watchdog` marker/exit path alerts on *staleness*, not on
> *off-host* copies. The watchdog does not verify that the offsite `mc mirror` target is
> current — a separate mechanism (or the same host cron that runs `mc mirror`) should
> also check the offsite bucket's newest object.

## Restore drill

Before launch, perform a restore drill into a temporary database:

```bash
sh scripts/verify-backup-restore.sh
```

This script **proves a paired restore** end to end (dependency-light: host `sh`,
`docker`, and `mc`; it falls back to shelling into the `minio` container if `mc` is not
on the host):

1. Lists today's hourly backups in MinIO and picks the newest one.
2. Downloads it and verifies it is valid gzip.
3. Spins up a throwaway `postgres:16-alpine` container (never touches the live DB).
4. Restores the plain-SQL dump with `gunzip -c | psql`.
5. Runs a sanity query (`SELECT count(*) FROM users;`) asserting at least 1 row.
6. Prints `RESTORE VERIFY OK` only on full success; exits non-zero and reports
   `RESTORE VERIFY FAILED: <reason>` otherwise.

Manual drill (when a specific point-in-time object is needed):

1. Download the target backup object (`mc cp backup-primary/wmb-projects/backups/hourly/<file> .`).
2. Create a disposable PostgreSQL database.
3. Restore with `gunzip -c backup.gzip.sql | psql "$RESTORE_DATABASE_URL"`.
4. Run `npx prisma generate` and app smoke checks against the restored DB.
5. Record restore duration and any manual steps.

Do not launch paid production without at least one successful `verify-backup-restore.sh`
run (and document the restore duration).
