# Production Readiness Checklist

This document tracks the remaining steps before public paid production launch.

## Already completed

- `main` has GitHub Actions CI.
- CI verifies dependency installation, Prisma client generation, lint, Next.js
  production build, and worker build.
- Runtime environment validation exists for the web app and worker.
- `/api/health` reports sanitized environment readiness without exposing values.
- Real `.env` files are ignored and not committed.

## Required before launch

### 1. Deployment topology

Choose and document the production target. Baseline topology is now documented in `docs/deployment-topology.md`:

- Web app runtime
- Worker runtime
- PostgreSQL
- Redis
- S3-compatible object storage
- Optional Qdrant
- Optional Neo4j

The web app and worker must use the same `DATABASE_URL`, object storage, and
`API_KEY_ENCRYPTION_SECRET`.

### 2. Production environment

- Inject all required variables from `docs/env-vars.md`.
- Confirm `DEV_AUTH_BYPASS` is empty/false.
- Confirm `NEXT_PUBLIC_APP_URL` is HTTPS.
- Hit `/api/health` after deploy and require `status: ok`.

### 3. Database deploy procedure

Current project decision is Prisma `db push` because migration history drifted.
Before launch:

1. Take a database backup.
2. Run `npx prisma generate`.
3. Run `npx prisma db push` against production during a maintenance window.
4. Run smoke tests.

### 4. Stripe verification

Static contract is documented in `docs/stripe-billing-verification.md` and enforced by `npm run billing:check`. Use Stripe CLI/test cards to verify:

- Checkout session creation
- Webhook signature validation
- Subscription creation/update/cancel
- Billing portal
- Founder/plan price IDs

### 5. Clerk verification

Static contract is documented in `docs/clerk-auth-verification.md` and enforced by `npm run auth:check`. Verify with production Clerk app:

- Signup
- Login
- Webhook user sync
- Protected routes reject anonymous access
- No dev-auth bypass path is active

### 6. Backups and monitoring

- PostgreSQL backups and restore drill
- S3/MinIO object backup policy
- Redis persistence expectations documented
- Sentry or equivalent error alerting configured
- Log retention configured

### 7. E2E smoke tests

Add a CI job or deployment smoke script that starts the app with service
containers and runs a minimal Playwright suite:

- Load public landing page
- Login or E2E bypass in non-production test env
- Open dashboard
- Open book overview
- Open editor
- Hit `/api/health`
