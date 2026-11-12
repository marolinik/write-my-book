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
| `API_KEY_ENCRYPTION_SECRET_PREVIOUS` | Optional. During a rotation, set it to the old secret: rows written under it still decrypt, and each is re-encrypted with the new secret when the writer saves it again. Remove it once no row needs it. |
| `NEO4J_PASSWORD` / `QDRANT_API_KEY` | Required in production when `NEO4J_URI` / `QDRANT_URL` is set; the dev defaults in this repo are refused at boot. |
| `HEALTH_TOKEN` | Optional. A caller sending it as a bearer token gets the full dependency detail from the health endpoint. |
| `TRUSTED_PROXY_HOPS` | Optional, default 1. How many reverse proxies in front of the app append to `x-forwarded-for`; the share-link rate limit takes the client address that many entries from the right. |
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
| `STRIPE_AUTOMATIC_TAX` | `1` turns on Stripe Tax at checkout (VAT inside the tax-inclusive price, address and VAT-id collection). Only after Stripe Tax is active; `npm run billing:check` then fails on any price that is not tax-inclusive |

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

## Local fleet models (LAN gateway installs)

`WMB_DEFAULT_MODEL`, `WMB_LOCAL_FALLBACK`, `WMB_LLM_FORCE_LOCAL`, `WMB_LOCAL_PROXY_URL`,
`WMB_ALLOW_PRIVATE_MODEL_HOSTS` and the `LOCAL_LLM_*` proxy variables are documented
in [local-fleet-models.md](./local-fleet-models.md). `WMB_LOCAL_FALLBACK` and
`WMB_ALLOW_PRIVATE_MODEL_HOSTS` must stay unset in production.
