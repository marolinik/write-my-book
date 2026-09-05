# Production Readiness Checklist

This document tracks the remaining steps before public paid production launch.

## 2026-09-04 status — see docs/PRODUCTION-SIGNOFF-2026-09-04.md

All five code-level launch blockers from the 2026-09-03 production review are
**resolved and committed** (`59dd05f`): export resource isolation, accurate
version-gated Undo, concurrent-write enforcement, billing checkout dedup +
webhook reconciliation, and backup failure/alert/restore-proof. Verified:
**218 test files / 1783 unit tests pass and `tsc --noEmit` is clean.**

### Remaining before launch (all verification/operational, no code defects)
1. Deploy `59dd05f` and witness the **browser E2E suite green in an environment
   with working browser networking** (this dev box's browser is machine-blocked —
   `ERR_NAME_NOT_RESOLVED` for every `http://` nav; see docs/HARDENING-2026-09-02.md).
2. Set the `PLAYWRIGHT_BASE_URL` **repository variable** to the deployed HTTPS
   URL and require a **green deploy-smoke** run (the workflow now runs correctly
   and the smoke script honors the variable).
3. Run the **full production journey** with real Clerk/Stripe/worker: signup →
   import → write → AI review → apply → undo → export, including an
   interruption-recovery and a proof restore (`scripts/verify-backup-restore.sh`).
4. Perform the **off-host backup** operator steps (off-site `mc mirror`, MinIO
   versioning/lifecycle, scoped non-root backup key) per
   `docs/database-deploy-backup.md`.

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
- Qdrant (required — `QDRANT_URL` is in the validator's required set)
- Neo4j (required — `NEO4J_URI` is in the validator's required set)

The web app and worker must use the same `DATABASE_URL`, object storage, and
`API_KEY_ENCRYPTION_SECRET`.

### 2. Production environment

- Inject all required variables from `docs/env-vars.md`.
- Confirm `DEV_AUTH_BYPASS` is empty/false.
- Confirm `NEXT_PUBLIC_APP_URL` is HTTPS.
- Hit `/api/health` after deploy and require `status: ok`.

### 3. Database deploy procedure

Current project decision is Prisma `db push` because migration history drifted. The executable procedure is documented in `docs/database-deploy-backup.md` and enforced by `npm run db:deploy:check`.
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

A deployment-only smoke path now exists: `npm run smoke:deployment` for HTTP checks and `npm run test:deployment-smoke` for browser checks against `PLAYWRIGHT_BASE_URL`. Remaining work is to wire it into the deployment pipeline. Smoke coverage:

- Load public landing page
- Login or E2E bypass in non-production test env
- Open dashboard
- Open book overview
- Open editor
- Hit `/api/health`
