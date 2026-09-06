# Production Deployment Checklist — 2026-09-06

Operational runbook for taking WriteMyBook to a real, paid-capable release.
Companion to `docs/PRODUCTION-SIGNOFF-2026-09-04.md` (the go/no-go) and
`docs/deployment-topology.md` (the container contract). The code is launch-ready
code; everything below is **ops work** that must be executed by an operator with
access to the target hosting.

Target stack chosen: **Docker-based host** (Render Docker, Fly.io, Railway,
DigitalOcean App Platform, or a plain VM with Docker Compose + Caddy). This fits
the codebase's two-process + six-service topology best.

---

## 0. Prerequisites / accounts

- [ ] Pick a host and create the account. Recommended: **DigitalOcean droplet**
      (2 vCPU / 4 GB at minimum) or **Render** (services: web, worker, plus
      managed Postgres + Redis). If using a single VM: **Docker Compose + Caddy**
      reverse proxy.
- [ ] Own a **domain** (e.g. `writemybook.example`) and a DNS provider where you
      can add an `A`/`CNAME` record.
- [ ] **Clerk** app pointing to the real frontend API (not `clerk.example.test`),
      with production **publishable + secret keys**.
- [ ] **Stripe** live mode enabled with the four founder/indie/pro/publisher price
      IDs, plus a **Stripe webhook** endpoint for `checkout.session.completed`,
      `invoice.paid`, `customer.subscription.updated/deleted`.
- [ ] **S3-compatible object store** (MinIO on the host, or a managed bucket:
      Cloudflare R2 / AWS S3 / Backblaze B2). Backups must land here (off-host).
- [ ] (Recommended) **Qdrant** and **Neo4j** for vector memory + knowledge graph.
- [ ] **OpenAI / Anthropic / OpenRouter** model keys and an `API_KEY_ENCRYPTION_SECRET`.
- [ ] **Sentry** DSN (optional but recommended for error alerting).

---

## 1. Configure secrets on the host

Create `.env` / `.env.docker` with **real** values (no `placeholder`, no
`clerk.example.test`, no `your_...`). Required set:

```
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/writemybook?schema=public
REDIS_URL=redis://:<pass>@<host>:6379
S3_ENDPOINT=<bucket endpoint>
S3_ACCESS_KEY_ID=<key>          # use a SCOPED, non-root backup key for backups
S3_SECRET_ACCESS_KEY=<secret>
S3_BUCKET=wmb-projects
S3_FORCE_PATH_STYLE=true
NEO4J_URI=bolt://<host>:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<real>
QDRANT_URL=http://<host>:6333
QDRANT_API_KEY=<real>
CLERK_SECRET_KEY=sk_live_...      # real, not "sk_test_placeholder"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...   # real, NOT pk_test_*
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_FOUNDER_MONTHLY_PRICE_ID=price_...
STRIPE_INDIE_MONTHLY_PRICE_ID=price_...
STRIPE_INDIE_ANNUAL_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_PUBLISHER_MONTHLY_PRICE_ID=price_...
STRIPE_PUBLISHER_ANNUAL_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
API_KEY_ENCRYPTION_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_APP_URL=https://writemybook.example
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=...
SERPER_API_KEY=...
NEXT_PUBLIC_SENTRY_DSN=...
```

**Hard rules (the env validator flags these):**
- `DEV_AUTH_BYPASS` **must be empty/false** in production (`env.ts` pushes an
  error otherwise).
- `E2E_TEST_SECRET` must be **unset** in production, so the e2e bypass can never
  fire.
- `NEXT_PUBLIC_APP_URL` must be **HTTPS**.
- Backups use a **scoped `wmb-backup` MinIO/S3 key** (write/list, no delete-all),
  never the root credentials.

---

## 2. Terminate TLS and point traffic at the app

- Outside the app, put a TLS reverse proxy in front of internal port `3000`
  (never expose 3000 publicly unless it already has TLS).
  - VM + Caddy: set `writemybook.example` with automatic HTTPS, proxying to
    `127.0.0.1:3000`.
  - Render: enable "Auto-Deployments" + set the service to use the service URL
    or attach a custom domain; TLS is automatic.
- Add a DNS `A`/`CNAME` for `writemybook.example` → host.
- Do **not** expose PostgreSQL, Redis, MinIO, Neo4j, or Qdrant to the Internet —
  bind them to `127.0.0.1` or a private network (the base Compose already binds
  to `127.0.0.1`).

---

## 3. Deploy the application (both processes are mandatory)

The topology doc's golden sequence, with the compose override:

```bash
git pull            # to the 01b8180 commit / latest main
docker compose -f docker-compose.yml -f docker-compose.prod.yml config > /tmp/wmb-compose.yml
npx prisma generate
npx prisma db push                # during a maintenance window
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

- **Web process** (`Dockerfile`): `node server.js`, internal port `3000`.
- **Worker process** (`Dockerfile.worker`): `node dist-worker/worker.js`.
  Both **must** run and share `DATABASE_URL`, `REDIS_URL`, S3 config,
  `API_KEY_ENCRYPTION_SECRET`.
- On Render/Railway: add **two services** (one web, one worker) from the two
  Dockerfiles. On a VM: run both containers with the compose override.
- A down worker must be treated as an outage — `/api/health/dependencies`
  returns **503** when no worker is attached.

---

## 4. Backups (off-host — operator action, cannot be done from code)

Follow `docs/database-deploy-backup.md`. Minimum:

- [ ] PostgreSQL hourly dumps, retained with daily/weekly rotation. The current
      `db-backup` container already fails loudly and ignores empty dumps; this
      step is about **scheduling + verifying**, not implementing.
- [ ] **Off-site** copy of every backup to the S3/R2/B2 bucket (the bucket must
      NOT be on the same box as the DB). Use the `wmb-backup` scoped key.
- [ ] MinIO/S3 **versioning + lifecycle** enabled on the bucket (so a bad overwrite
      is recoverable).
- [ ] Object-lock / immutability for the backup bucket if available.
- [ ] **Prove a restore** from a real backup into a throwaway Postgres:
      pair dump + `gunzip -c | psql` (see `scripts/verify-backup-restore.sh`).
- [ ] Alert when a backup is stale (the `db-backup-watchdog` container already
      writes a health marker; wire it to on-call/Sentry).

---

## 5. DNS, HTTPS, and smoke the live deployment

- [ ] `curl -fsS https://writemybook.example/api/health` → `ok`.
- [ ] `curl -fsS https://writemybook.example/api/health/dependencies` → 200 (all
      deps green, worker attached).
- [ ] HTTP smoke: `npm run smoke:deployment -- https://writemybook.example`.
- [ ] **Activate deploy-smoke in CI**: set the Actions **variable**
      `PLAYWRIGHT_BASE_URL` = `https://writemybook.example`
      (Settings → Secrets and variables → Actions → Variables). This turns the
      dormant `deploy-smoke.yml` from a green no-op into a real browser smoke
      against the deployed release; it then fires after every successful CI run
      on `main`.
- [ ] Browser deploy-smoke: `PLAYWRIGHT_BASE_URL=https://writemybook.example npm run test:deployment-smoke`.

---

## 6. Verify the full production journey (the reviewer's explicit requirement)

Manually walk the **one demonstrated production journey** with real credentials:

1. **Sign up** with real Clerk → dashboard renders.
2. **Import / create** a book, write a chapter.
3. **AI review** (dev-edit / line-edit) → findings appear.
4. **Apply** an edit → version increments; **Undo** it → exact reversal.
5. **Export** a manuscript (DOCX/PDF/EPUB) → file downloads, no path leakage.
6. **Billing**: subscribe via the booking page → Stripe checkout completes →
   subscription appears; cancel → remains canceled (webhook reconciliation
   confirmed).
7. **Interruption-recovery**: kill the worker mid-job, then restart it — the
   job must not be silently lost and the readiness probe must have gone red
   while it was down.
8. **Backup restore**: restore the DB from the latest off-site backup into
   throwaway Postgres and confirm the data round-trips.

Log the evidence (run IDs + URLs) in the sign-off.

---

## 7. Confirm the residual gates are closed

Re-run the reviewer's attack scenarios **against the deployed instance**;
they must behave exactly as the unit/CI suite proved:

- [ ] Pandoc `\include{}` / unsafe-image export → blocked (`--sandbox` +
      sanitizer).
- [ ] Delayed `invoice.paid` on a canceled sub → does **not** resurrect it.
- [ ] Two offline tabs editing one chapter → the stale tab cannot clobber the
      newer draft.
- [ ] Backup with a killed DB → `BACKUP FAILED:` logged, no false-green upload.

When these pass on the live host, update `docs/PRODUCTION-SIGNOFF-2026-09-04.md`
from **Conditional GO** to an explicit **GO** and keep the proof URLs.

---

## Rollback (if a release misbehaves)

1. Remove the bad release from load-balancer rotation (stop web + worker).
2. Redeploy the previous image / commit.
3. If schema changed incompatibly, restore the DB from backup; otherwise no.
4. Re-run `/api/health/dependencies` + smoke checks, then re-enable traffic.