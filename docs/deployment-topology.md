# Deployment Topology

Write My Book OK runs as two application processes plus five backing services.

## Runtime processes

| Process | Image/command | Purpose | Required env |
|---|---|---|---|
| Web app | `Dockerfile` / `node server.js` | Next.js UI, API routes, auth, billing, document APIs | Web env from `docs/env-vars.md` |
| Worker | `Dockerfile.worker` / `node dist-worker/worker.js` | BullMQ background agent workflow execution | Worker env from `docs/env-vars.md` |

The web app and worker must share the same PostgreSQL database, Redis queue,
S3 bucket, and `API_KEY_ENCRYPTION_SECRET`.

## Backing services

| Service | Compose name | Required | Persistence | Health check |
|---|---|---:|---|---|
| PostgreSQL 16 | `postgres` | yes | `pgdata` | `pg_isready` |
| Redis 7 | `redis` | yes | `redisdata` | `redis-cli ping` with password |
| MinIO/S3 | `minio` + `minio-init` | yes | `miniodata` | `mc ready local` + bucket init |
| Qdrant | `qdrant` | optional but recommended | `qdrantdata` | TCP port check |
| Neo4j | `neo4j` | optional but recommended | `neo4jdata` | `cypher-shell RETURN 1` |

Qdrant and Neo4j are optional in the readiness endpoint because the core app can
serve UI/auth/documents without them, but they should be enabled for full agent
memory and knowledge graph behavior.

## Health endpoints

| Endpoint | Purpose | Success | Failure |
|---|---|---|---|
| `/api/health` | Process + sanitized env readiness | `200` | `503` if env invalid |
| `/api/health/dependencies` | Deep dependency readiness | `200` | `503` if required dependency fails |

`/api/health/dependencies` checks:

- runtime environment contract
- PostgreSQL `SELECT 1`
- Redis `PING`
- S3 `HeadBucket`
- Qdrant connection when configured
- Neo4j connectivity when configured

No endpoint exposes secret values.

## Docker Compose deployment sequence

1. Create a production `.env.docker` from `docs/env-vars.md`.
2. Ensure all placeholder/changeme values have been replaced.
3. Build images:

   ```bash
   docker compose build app worker
   ```

4. Start backing services:

   ```bash
   docker compose up -d postgres redis minio minio-init qdrant neo4j
   ```

5. Run database sync after a backup:

   ```bash
   docker compose run --rm app npx prisma db push
   ```

6. Start app and worker:

   ```bash
   docker compose up -d app worker
   ```

7. Verify readiness:

   ```bash
   curl -f http://localhost:3000/api/health
   curl -f http://localhost:3000/api/health/dependencies
   SMOKE_BASE_URL=http://localhost:3000 npm run smoke:deployment
   ```

## Rollback sequence

1. Stop the app and worker:

   ```bash
   docker compose stop app worker
   ```

2. Re-deploy the previous known-good image/tag.
3. If a schema sync was applied and must be reverted, restore the verified DB
   backup taken before `prisma db push`.
4. Restart app and worker.
5. Re-run smoke checks.

## Production caveats

- The current Docker Compose defaults include local/dev fallback passwords. Real
  deployment must override them through secrets or deployment environment.
- `DEV_AUTH_BYPASS` must be empty/false; runtime validation rejects `true` in
  production.
- `NEXT_PUBLIC_APP_URL` must be HTTPS for non-local production hosts.
- The worker currently has no HTTP listener, so Compose verifies its startup via
  process health/restart policy and dependency readiness from the web app.
