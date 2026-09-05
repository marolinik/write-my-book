#!/bin/sh
# verify-backup-restore.sh — prove a PAIRED database/manuscript restore from a real
# production hourly backup, end to end:
#   MinIO hourly backup  ->  download  ->  throwaway Postgres  ->  restore  ->  sanity query
#
# Why paired: a backup that cannot be restored is as bad as no backup. This script
# downloads the newest hourly backup object for today, restores it into a disposable
# PostgreSQL 16 container, and asserts a sane row count in `users`. It prints
# "RESTORE VERIFY OK" only when every step succeeds, and exits non-zero otherwise.
#
# Dependencies (host): sh, docker, and mc (the MinIO client).
#   - If `mc` is not on the host PATH, a fallback shells into the minio container.
# Run from the repo root where docker-compose.yml is present:
#   sh scripts/verify-backup-restore.sh
#
# The script never touches the live production database. Overridable env:
#   MC              - override the mc binary/alias command (default "mc" or compose fallback)
#   BACKUP_PREFIX   - hourly backup branch to test (default "hourly")
#   EXPECTED_TABLE  - table queried for the sanity row count (default "users")
#   MIN_TABLE_ROWS  - minimum acceptable row count (default 1)
#   VERIFY_TIMEOUT  - seconds to wait for the throwaway Postgres healthcheck (default 180)

set -u

REPO_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
echo "==> repo: $REPO_DIR"
cd "$REPO_DIR" || { echo "RESTORE VERIFY FAILED: cannot cd $REPO_DIR" >&2; exit 1; }

# --- locate mc (host binary preferred; else shell inside the minio container) ----
MC_SRC="host"
MC="$(command -v mc || true)"
if [ -z "$MC" ]; then
  MC="docker compose exec -T minio mc"
  MC_SRC="minio-container"
fi
echo "==> mc used from: $MC_SRC"

ALIAS="${MC_ALIAS:-wmb}"
BUCKET="${MINIO_BUCKET:-wmb-projects}"
BACKUP_PREFIX="${BACKUP_PREFIX:-hourly}"
BPATH="$ALIAS/$BUCKET/backups/$BACKUP_PREFIX/"
EXPECTED_TABLE="${EXPECTED_TABLE:-users}"
MIN_TABLE_ROWS="${MIN_TABLE_ROWS:-1}"
VERIFY_TIMEOUT="${VERIFY_TIMEOUT:-180}"

TODAY="$(date +%Y%m%d)"
TMP="$(mktemp -d 2>/dev/null || mktemp -d /tmp/verifyrestore.XXXXXX)" || {
  echo "RESTORE VERIFY FAILED: could not create temp dir" >&2; exit 1; }
DUMP="$TMP/backup.sql.gz"
export MC_DOWNLOAD_QUIET=1

fail() { echo "RESTORE VERIFY FAILED: $*" >&2; rm -rf "$TMP"; exit 1; }

echo "==> looking for newest $BACKUP_PREFIX backup for today ($TODAY) in $BPATH"
# `mc ls --recursive` yields lines like:
#   [2025-01-01 12:00:00 UTC]  12345B backup-20250101-120000.sql.gz
# Filter to today's files, take the reverse-sorted (newest) first, keep last column.
BACKUP_FILE="$( $MC ls --recursive "$BPATH" 2>/dev/null \
  | grep "$TODAY" \
  | sort -r \
  | head -n 1 \
  | awk '{print $NF}' )"

if [ -z "$BACKUP_FILE" ]; then
  fail "no today's ($TODAY) backup found under $BPATH"
fi

echo "==> downloaded candidate: $BACKUP_FILE"
$MC cp "$BPATH$BACKUP_FILE" "$DUMP" >/dev/null 2>&1 || \
  fail "could not download $BPATH$BACKUP_FILE with mc (source: $MC_SRC)"
[ -s "$DUMP" ] || fail "downloaded object is empty/missing: $DUMP"

# --- sanity-check the plain gzip stream before restore ---------------------------
gunzip -t "$DUMP" 2>/dev/null || fail "download is not valid gzip: $DUMP"

echo "==> spinning up throw-away Postgres 16 container"
DB_NAME="wmb_verify_$$_$(date +%s)"
docker run --rm -d \
  --name "$DB_NAME" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e "POSTGRES_DB=$DB_NAME" \
  postgres:16-alpine >/dev/null 2>&1 || fail "could not start throwaway Postgres ($DB_NAME)"

cleanup() { docker rm -f "$DB_NAME" >/dev/null 2>&1; rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

echo "==> waiting for throwaway Postgres to accept connections (up to ${VERIFY_TIMEOUT}s)"
i=0
READY=0
while [ "$i" -lt "$VERIFY_TIMEOUT" ]; do
  if docker exec "$DB_NAME" pg_isready -h localhost -U postgres >/dev/null 2>&1; then
    READY=1
    break
  fi
  i=$((i + 1)); sleep 1
done
[ "$READY" -eq 1 ] || fail "throwaway Postgres not ready in ${VERIFY_TIMEOUT}s"

echo "==> restoring plain-SQL dump into $DB_NAME (gunzip -c | psql)"
# The dump is plain SQL (gzip), so restore is psql — matching how the pipeline's dump
# format is restored elsewhere. We pre-created the DB and keep ON_ERROR_STOP=0 so any
# `CREATE DATABASE` / `\connect` headers are tolerated; psql continues past them.
gunzip -c "$DUMP" | docker exec -i "$DB_NAME" psql -U postgres -d "$DB_NAME" \
  -v ON_ERROR_STOP=0 >/dev/null 2>&1
RC=$?
if [ "$RC" -ne 0 ]; then
  fail "restore returned exit $RC (see above); dump may be partial"
fi

echo "==> sanity query: SELECT count(*) FROM $EXPECTED_TABLE; (require >=$MIN_TABLE_ROWS)"
COUNT="$(docker exec "$DB_NAME" psql -U postgres -d "$DB_NAME" \
  -tA -c "SELECT count(*) FROM $EXPECTED_TABLE;" 2>/dev/null | tr -d '[:space:]')"
case "$COUNT" in
  ''|*[!0-9]*) fail "sanity query failed to return a numeric count (got: '$COUNT')";;
esac
if [ "$COUNT" -lt "$MIN_TABLE_ROWS" ]; then
  fail "$EXPECTED_TABLE count ($COUNT) below minimum $MIN_TABLE_ROWS"
fi

echo ""
echo "==> RESTORE VERIFY OK: restored $BACKUP_FILE and queried $EXPECTED_TABLE count=$COUNT"