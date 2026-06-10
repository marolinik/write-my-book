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

- runs `pg_dump` hourly,
- uploads compressed backups to MinIO/S3,
- keeps 24 hourly, 7 daily, and 4 weekly backups through `scripts/backup-rotate.sh`.

Verify the backup sidecar after deployment:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs db-backup --tail=100
```

## Restore drill

Before launch, perform a restore drill into a temporary database:

1. Download the latest backup object.
2. Create a disposable PostgreSQL database.
3. Restore with `gunzip -c backup.sql.gz | psql "$RESTORE_DATABASE_URL"`.
4. Run `npx prisma generate` and app smoke checks against the restored DB.
5. Record restore duration and any manual steps.

Do not launch paid production without at least one successful restore drill.
