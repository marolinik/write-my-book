# Production Environment Variables

Write My Book validates server-side runtime configuration before opening database
connections and before starting the background worker.

## Validation rules

- `CI=true` may use harmless placeholders for static build verification.
- Real production runtime (`NODE_ENV=production` and `CI!=true`) must not use
  placeholder values such as `placeholder`, `changeme`, `REPLACE_ME`, or
  `ci-placeholder`.
- `DEV_AUTH_BYPASS=true` is rejected in production.
- `NEXT_PUBLIC_APP_URL` must use HTTPS in production unless the host is local.
- `/api/health` returns `503` if required production runtime configuration is invalid.

## Required for the web app

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string for Prisma 7 adapter |
| `API_KEY_ENCRYPTION_SECRET` | Secret used to encrypt stored BYOK provider keys |
| `REDIS_URL` | BullMQ Redis connection string used by API routes |
| `NEXT_PUBLIC_APP_URL` | Canonical public app URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser key |
| `CLERK_SECRET_KEY` | Clerk server key |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook signing secret |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe browser key |
| `S3_ENDPOINT` | S3/MinIO endpoint |
| `S3_ACCESS_KEY_ID` | S3/MinIO access key id |
| `S3_SECRET_ACCESS_KEY` | S3/MinIO secret access key |
| `S3_BUCKET` | S3 bucket name |

## Required for the worker

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `API_KEY_ENCRYPTION_SECRET` | Same encryption secret as web app |
| `REDIS_URL` | BullMQ Redis connection string |
| `S3_ENDPOINT` | S3/MinIO endpoint |
| `S3_ACCESS_KEY_ID` | S3/MinIO access key id |
| `S3_SECRET_ACCESS_KEY` | S3/MinIO secret access key |
| `S3_BUCKET` | S3 bucket name |

## Optional but recommended

| Variable | Purpose |
|---|---|
| `SENTRY_ORG` | Sentry release/source-map integration |
| `SENTRY_PROJECT` | Sentry release/source-map integration |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side error reporting |
| `QDRANT_URL` | Vector memory backend |
| `NEO4J_URI` | Knowledge graph backend |

## Local checks

```bash
npm run env:check
npm run env:check:worker
```

For production-like checks locally, set `NODE_ENV=production` and unset `CI`.
Never commit real values to git; inject them via the deployment platform.

## Deployment smoke check

```bash
SMOKE_BASE_URL=https://your-domain.example npm run smoke:deployment
```

The smoke check verifies `/api/health` and `/api/health/dependencies`.
