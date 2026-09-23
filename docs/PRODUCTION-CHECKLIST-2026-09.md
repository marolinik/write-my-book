# Production checklist — September 2026 release

Everything in code is merged on `main`. What remains has to run **on the production host**, because this machine holds no production credentials. Run the steps in order.

## 1. Back up first

Follow `docs/database-deploy-backup.md`: take a fresh dump and record it in `DB_BACKUP_CONFIRMED_AT` / `DB_BACKUP_LOCATION`. The schema push refuses to run without them.

## 2. Pull the MinIO images from quay.io

MinIO's images **are no longer on Docker Hub**. `minio/minio` and `minio/mc` do not resolve, so a fresh host cannot start storage from the old compose. Both compose files now point at `quay.io/minio/*`.

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull minio minio-init db-backup-watchdog
```

## 3. Schema and database guards

```sh
npm run db:push:prod
```

The push is cumulative: it brings production to the current `prisma/schema.prisma` in one go. New since the last production push:

| Object | Purpose |
|---|---|
| `edit_findings.impact_score`, `rule_conflict`, `triaged_at` | triage |
| `edit_findings.fix_remains`, `fix_checked_at` | did an applied fix hold |
| `edit_findings.dismissed_at` | when the writer dismissed a note |
| `structure_moves.undone_at` | when a structure move was undone |
| `canon_checks` table | cache for the story-bible check |
| **removed:** `book_settings.language` | a second, unused copy of the book's language (default `en`); `books.language` is the only one read |

**Expected data-loss warning:** dropping `book_settings.language` makes Prisma stop and ask for confirmation (or, non-interactively, fail with a hint to use `--accept-data-loss`). The column holds nothing anyone reads, so confirm. If the push runs non-interactively, run `npx prisma db push --accept-data-loss` and then `npm run db:guards`.

`db:push:prod` now ends with `npm run db:guards`. That step installs the triggers that keep `edit_actions` append-only while its book exists, and it is idempotent. After any **manual** `prisma db push`, run `npm run db:guards` yourself.

Verify:

```sql
select tgname from pg_trigger where tgrelid = 'edit_actions'::regclass and not tgisinternal;
-- expect: edit_actions_append_only, edit_actions_no_truncate
```

## 4. Backup sidecar

The sidecar used to download `mc` from dl.min.io at start. That URL now answers **410 Gone**, and locally no backup was taken for 14 days because of it. It now builds from `docker/db-backup/Dockerfile`, with `mc` copied from `quay.io/minio/mc`.

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml build db-backup
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d db-backup db-backup-watchdog
docker logs --tail 20 <project>-db-backup-1          # expect "Backup completed: <timestamp>"
docker logs --tail 5  <project>-db-backup-watchdog-1  # expect "Backup watchdog started"
```

**Check on the host that the watchdog is actually running.** Locally it had never been started, which is why nobody noticed the backups had stopped.

## 5. Environment

Every Jev pass is **off** unless its flag is `1` **and** `TYPESAFE_API_KEY` is set. With the key missing, the product behaves exactly as before.

| Variable | Turns on |
|---|---|
| `TYPESAFE_API_KEY` | required by all of the passes below |
| `BETA_JUDGE_ENABLED=1` | beta-gate verdict judged instead of regex-parsed |
| `FINDING_TRIAGE_ENABLED=1` | Lektura ranked by impact for the reader, after every line-edit / dev-edit |
| `STOCK_PROSE_ENABLED=1` | "look again" note on stock-prose paragraphs, after line-edit |
| `FIX_CHECK_ENABLED=1` | checks whether an applied note's problem is gone (auto-apply and hand edits) |
| `CANON_CHECK_ENABLED=1` | changed paragraphs checked against the story bible on the idle continuity scan |
| `SETUP_FACTS_ENABLED=1` | point of view, tense and a proposed genre read before setup conversations |
| `RULE_DEDUPE_ENABLED=1` | a new rule retires an older rule that says the same thing (deactivates it, never deletes it) |

`.env.example` documents each one, with the measurements behind it.

## 6. Smoke test after deploy

1. Open a book that has chapters, then open Lektura. Expect the page to load and any triaged chapter to open on "What matters most".
2. Run a line-edit on one chapter. Expect new findings, triaged within seconds, with a "look again" prose note possibly among them.
3. Apply a finding that has a replacement. The card should say "Checked" or warn next to Undo.
4. Edit a paragraph in the editor and wait 20 s. The continuity scan should run without errors in the server log (`[CanonCheck]`).
5. Try to dismiss and then undo a finding. `dismissed_at` should be set and then cleared.
6. Confirm a new hourly backup appears in `wmb-projects/backups/hourly/`.

## Known and not blocking

- **The cause of the local `edit_actions` loss** (126 rows, 2026-09-23) was not found. The trigger now prevents a repeat.
- 5 already-decided findings on one local book still point at a chapter number that no longer exists after a restructure.
