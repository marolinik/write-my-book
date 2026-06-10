# Deployment Topology

This is the production deployment contract for Write My Book OK.

## Processes

### Web app

- Image: `Dockerfile`
- Runtime command: `node server.js`
- Internal port: `3000`
- Public traffic should terminate TLS at a reverse proxy (Caddy/nginx/load balancer)
  and forward to the app over the private network or localhost.
- Health endpoints:
  - `GET /api/health` — process/config liveness, no dependency probes
  - `GET /api/health/dependencies` — readiness with dependency probes

### Worker

- Image: `Dockerfile.worker`
- Runtime command: `node dist-worker/worker.js`
- Consumes BullMQ jobs from Redis.
- Must use the same `DATABASE_URL`, `REDIS_URL`, S3 config, and
  `API_KEY_ENCRYPTION_SECRET` as the web app.

## Required backing services

| Service | Required | Purpose | Persistence |
|---|---:|---|---|
| PostgreSQL 16 | yes | Primary relational data | volume + backup |
| Redis 7 | yes | BullMQ queues/session streams | volume; can be rebuilt if jobs are disposable |
| S3/MinIO | yes | Document/manuscript/version bodies and backups | object storage backup policy |
| Qdrant | no, recommended | Vector memory retrieval | volume/snapshot |
| Neo4j | no, recommended | Knowledge graph/entity relationships | volume/backup |

The app can compile without optional services, but production feature completeness
requires Qdrant and Neo4j to be configured and healthy.

## Docker Compose topology

Base stack:

```bash
docker compose up -d --build
```

Production host-local override:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The base Compose stack binds ports to `127.0.0.1`; expose only the reverse proxy
publicly. Do not expose PostgreSQL, Redis, MinIO, Neo4j, or Qdrant directly to the
Internet.

## Health and readiness

Use liveness for simple process checks:

```bash
curl -fsS http://127.0.0.1:${APP_PORT:-3000}/api/health
```

Use readiness for deployment gates and load-balancer readiness:

```bash
curl -fsS http://127.0.0.1:${APP_PORT:-3000}/api/health/dependencies
```

Readiness returns `503` if a required dependency fails:

- production env contract invalid
- PostgreSQL query fails
- Redis ping fails
- S3 bucket head fails

Optional dependencies are reported as `degraded`/`skipped` but do not fail the
whole readiness response.

Run the smoke script after every deploy:

```bash
npm run smoke:deployment -- https://your-domain.example
```

or locally:

```bash
SMOKE_BASE_URL=http://127.0.0.1:${APP_PORT:-3000} npm run smoke:deployment
```

## Deployment sequence

1. Pull the target commit.
2. Confirm `.env.docker`/platform secrets are present and contain no placeholders.
3. Run config validation:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml config >/tmp/wmb-compose.yml
   ```

4. Backup PostgreSQL and object storage; follow `docs/database-deploy-backup.md`.
5. Generate Prisma client and sync schema during the release window:

   ```bash
   npx prisma generate
   npx prisma db push
   ```

6. Build and start services:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```

7. Wait for compose health checks.
8. Run deployment smoke checks.
9. Verify Clerk login/signup and Stripe checkout/webhook in the target environment.

## Rollback sequence

1. Stop web and worker or remove the bad release from load balancer rotation.
2. Redeploy the previous image/commit.
3. If schema changes were applied, restore DB backup if backward compatibility is
   not possible.
4. Run `/api/health/dependencies` and smoke checks.
5. Re-enable traffic.

## Backup expectations

- PostgreSQL: hourly backups retained with daily/weekly rotation.
- S3/MinIO: object replication or scheduled bucket backup.
- Qdrant: snapshot or volume backup if vector memory must survive restore.
- Neo4j: dump/volume backup if knowledge graph must survive restore.
