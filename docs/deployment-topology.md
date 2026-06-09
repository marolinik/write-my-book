# Production Deployment Topology

This is the baseline production deployment model for Write My Book.

## Required runtime processes

| Process | Image/command | Purpose | Health |
|---|---|---|---|
| Web app | `Dockerfile`, `node server.js` | Next.js UI and API routes | `GET /api/health` for liveness, `GET /api/health/dependencies` for readiness |
| Worker | `Dockerfile.worker`, `node dist-worker/worker.js` | BullMQ background agent jobs | process must start after env validation and Redis/Postgres/S3 are reachable |

The web app and worker must share:

- `DATABASE_URL`
- `REDIS_URL`
- `API_KEY_ENCRYPTION_SECRET`
- S3 endpoint/access key/secret/bucket
- optional Qdrant and Neo4j connection settings

## Required backing services

| Service | Production role | Persistence | Notes |
|---|---|---|---|
| PostgreSQL 16+ | Prisma primary data store | Required | Back up before every schema push/deploy |
| Redis 7+ | BullMQ queue, pub/sub/stream state | Required | Use an authenticated URL in production |
| S3-compatible object storage | Document bodies, versions, imports/exports | Required | AWS S3, R2, or MinIO are acceptable |
| Qdrant | Vector memory | Optional but recommended | Health endpoint marks it optional/degraded if configured but down |
| Neo4j | Knowledge graph | Optional but recommended | Health endpoint marks it optional/degraded if configured but down |

## Health endpoints

### `/api/health`

Fast liveness/config endpoint. It validates runtime environment readiness and returns
sanitized configuration status. It does **not** expose secret values.

Expected healthy response status: `200`.

### `/api/health/dependencies`

Readiness endpoint. It validates runtime environment and checks live dependencies:

- PostgreSQL with `SELECT 1`
- Redis with `PING`
- S3 with `HeadBucket`
- Qdrant with `getCollections()` when configured
- Neo4j with `verifyConnectivity()` when configured

Expected healthy response status: `200`. Required dependency failures return `503`.
Optional dependency failures are reported as `degraded` but do not fail readiness.

## Docker Compose production baseline

The included Compose files model a single-host deployment:

- `app` depends on Postgres, Redis, MinIO bucket init, Neo4j, and Qdrant.
- `worker` depends on the same service stack.
- app healthcheck uses `/api/health/dependencies`.
- named volumes persist Postgres, Redis, MinIO, Neo4j, and Qdrant data.

For a managed/cloud deployment, replace individual services with managed equivalents
but preserve the same contracts and env vars.

## Deploy sequence

1. Build and push app + worker images from a green `main` commit.
2. Provision/verify Postgres, Redis, S3 bucket, and optional Qdrant/Neo4j.
3. Inject production env vars from `docs/env-vars.md`.
4. Confirm `DEV_AUTH_BYPASS` is empty/false.
5. Backup Postgres.
6. Run `npx prisma generate` and `npx prisma db push` against production.
7. Start web app and worker.
8. Run:

```bash
npm run smoke:deployment -- https://your-production-domain.example
```

9. Verify Stripe and Clerk webhooks.
10. Monitor logs and Sentry/error alerts during first user flows.

## Rollback

1. Stop worker first to avoid processing jobs during rollback.
2. Roll web app image back to previous green image.
3. Roll worker image back to matching previous green image.
4. If schema/data changed incompatibly, restore the Postgres backup taken before deploy.
5. Re-run `/api/health/dependencies` and a smoke test.
