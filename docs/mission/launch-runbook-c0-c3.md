# Launch Runbook — Clear the Conditional-GO Gates (C0–C3)

**Context.** The production-readiness audit (`docs/mission/production-readiness-audit.md`)
returned **CONDITIONAL GO** with four gates. **C1 is already cleared in code**
(Discuss-finding now routes through the user's provider; merged + tested). The
remaining three — **C0, C2, C3 — are operator actions** requiring prod
credentials / live services. Clear all three → **GO**.

> Do everything below against **staging first** (production-mode runtime with
> *test* Stripe/Clerk keys), then repeat the live-key steps against production.
> Never run C0 against prod without a proven, fresh backup (C2 first).

Current code is at `main` (CI green). Two processes are **both required** in prod:
the **web app** and the **BullMQ worker** (`npm run worker:start`) — see
`docs/deployment-topology.md`.

---

## Order of operations

```
0. Pre-flight (env + config contracts)      ── automated checks, ~5 min
1. C2  Backup + restore drill                ── prove recoverability BEFORE you need it
2. C0  Prod schema push                      ── requires the fresh backup from step 1
3. C3  Live Stripe + Clerk round-trips       ── with real/test-mode keys in the env
4. Post-deploy smoke + DRIFT confirmation    ── the new self-check closes the C0 blind spot
```

---

## 0 — Pre-flight (before touching prod data)

- [ ] Inject **all** prod secrets from `docs/env-vars.md` into the platform. Confirm **no placeholders**.
- [ ] `DEV_AUTH_BYPASS` is empty/false; `NEXT_PUBLIC_APP_URL` is HTTPS.
- [ ] Run the static contract checks in the target environment (they fail closed on placeholders):
  ```bash
  npm run env:check && npm run env:check:worker
  npm run auth:check          # Clerk keys present, no test/live mix, bypass off
  npm run billing:check       # Stripe keys + every plan's Price ID present
  ```
- [ ] Validate the compose topology:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml config >/tmp/wmb-compose.yml
  ```

---

## 1 — C2 · Backup + restore drill  (prove recoverability first)

The backup sidecar (`docker-compose.prod.yml` → `db-backup`) runs `pg_dump` hourly
to MinIO/S3 and rotates via `scripts/backup-rotate.sh`. **It has never been
proven.** Do not rely on it until this drill passes.

- [ ] Bring up the prod stack and confirm the sidecar produces objects:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs db-backup --tail=100
  ```
- [ ] Perform one **full restore drill** into a disposable DB:
  ```bash
  # 1. download the latest backup object from MinIO/S3
  # 2. create a throwaway database, then:
  gunzip -c backup-YYYYMMDD-HHMMSS.sql.gz | psql "$RESTORE_DATABASE_URL"
  npx prisma generate
  # 3. run app smoke checks against the restored DB
  ```
- [ ] **Record** restore duration + any manual steps (paste into this file or an ops log).
- [ ] ✅ Gate clears only after **one successful restore**.

---

## 2 — C0 · Production schema push  (4 pending changes)

The code expects 4 objects the prod DB doesn't have yet: `Book.archivedAt`,
`ContinuityFlag` (table), `FindingReply.role`, `WriterMemory.findingId`. Deploying
without this push → P2021/P2022 500s on **archive / shelves / continuity /
finding-reply** for every user. (Liveness `/api/health` stays green — but the new
DRIFT probe in readiness will now catch it; see step 4.)

- [ ] Take a **fresh** backup (< 2h old) — this is what `DB_BACKUP_CONFIRMED_AT` attests.
- [ ] Push during a maintenance window:
  ```bash
  export NODE_ENV=production
  export DB_DEPLOY_APPROVED=true
  export DB_BACKUP_CONFIRMED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export DB_BACKUP_LOCATION="s3://wmb-projects/backups/hourly/backup-YYYYMMDD-HHMMSS.sql.gz"
  npm run db:push:prod        # runs db:deploy:check → prisma generate → prisma db push
  ```
  `db:deploy:check` refuses to proceed if `DATABASE_URL` is localhost, approval is
  unset, or the backup timestamp is stale (> 2h).
- [ ] ✅ Confirm via the DRIFT probe (step 4) that the 4 objects now exist.

---

## 3 — C3 · Live Stripe + Clerk round-trips

CI validates key **formats** only. A well-formed-but-wrong webhook secret or
mis-scoped instance passes CI and fails only for a paying user. Run the full
checklists (`docs/stripe-billing-verification.md`, `docs/clerk-auth-verification.md`).

**Stripe** — endpoint `POST /api/billing/webhook`; subscribe to
`checkout.session.completed`, `customer.subscription.created|updated|deleted`,
`invoice.payment_failed|succeeded`.
- [ ] Create a checkout session for each purchasable plan/interval.
- [ ] Complete checkout with test card `4242 4242 4242 4242`; confirm the webhook
      creates/updates the local subscription row.
- [ ] Open the billing portal from `/settings/billing`.
- [ ] Cancel in Stripe → app status becomes `canceled`.
- [ ] Simulate `invoice.payment_failed` → status `past_due` per policy.

**Clerk** — endpoint `POST /api/auth/webhook` (Svix-verified); subscribe to
`user.created|updated|deleted`.
- [ ] `/signup` creates a user → `user.created` fires → local `User` row appears.
- [ ] Update name/email in Clerk → local sync.
- [ ] Delete in Clerk → local deletion behavior matches your retention policy.
- [ ] Anonymous `/dashboard` is blocked; `/api/health(.*)` stays reachable.
- [ ] `DEV_AUTH_BYPASS=true` is rejected by prod env validation.

---

## 4 — Post-deploy smoke + DRIFT confirmation

- [ ] HTTP smoke: `npm run smoke:deployment -- https://your-domain.example`
- [ ] Browser smoke: `PLAYWRIGHT_BASE_URL=https://your-domain.example npm run test:deployment-smoke`
      (or wire it into CD by setting the `PLAYWRIGHT_BASE_URL` repo var — `deploy-smoke.yml` is dormant until then).
- [ ] **Readiness / DRIFT probe** — this now proves C0 landed and stays landed:
  ```bash
  curl -fsS https://your-domain.example/api/health/dependencies    # must be 200; 503 = a required dep or SCHEMA object is missing
  ```
  The readiness probe returns **503** if any of PostgreSQL/Redis/S3/worker is down
  **or** if the schema-contract check finds any of the 4 gate objects missing —
  so a stale-schema deploy can no longer pass green.
- [ ] Treat a `worker` failure in the readiness probe as a **page-worthy outage**
      (both web + worker must be supervised).

---

## Done = GO

When C0, C2, C3 all check out and step-4 smoke + readiness are green, the
CONDITIONAL becomes **GO**. Record the sign-off (who/when) below.

| Gate | Owner | Date | Notes |
|------|-------|------|-------|
| C0 prod schema push | agent + operator | 2026-08-26 | **Staging: CLEARED.** All 4 objects verified present (`books.archived_at`, `continuity_flags`, `finding_replies.role`, `writer_memories.finding_id`); `npm run db:push:prod` attested "database is already in sync"; DRIFT probe `ready` / schema dep `ok`. Prod-posture guardrails proven refusing (localhost ban + approval + backup-timestamp). **Prod-host repeat still required** (real `DATABASE_URL`, fresh backup per §2). |
| C2 backup restore drill | agent + operator | 2026-08-26 | **CLEARED.** Direct: `pg_dump` 2.5s (1.34 MB) → restore 3.8s → counts identical (13 users / 117 books / 231 chapters / 228 docs) + 4 gate objects. **Sidecar (real prod path):** `db-backup` produced `backup-20260826-144204.sql.gz` (317 KB) in MinIO → object pulled → gunzip+psql restore 6.4s → identical counts + objects. Rotation script ran without errors. |
| C3 Stripe + Clerk live | agent + operator | 2026-08-26 | **Stripe (test mode): CLEARED.** Real cloud delivery via `stripe listen` (all 200s); hosted checkout completed with 4242 → `indie/active/monthly` row with real `cus_`/`sub_`; founder checkout → `founder_slots` row; annual interval; all 7 price IDs create valid sessions; `deleted`→`canceled`; `payment_failed`→`past_due`; `paid`→`active`; replay dedup (`deduplicated:true`, single event row); forged signature 400; portal URL 200. **Clerk: handler-level CLEARED.** Svix-signed `user.created/updated/deleted` → local `User` sync verified (real HMAC with configured secret); 401 on missing/forged headers; anonymous protected routes fail closed (404, Clerk v6 default); `/api/health(.*)` public; `DEV_AUTH_BYPASS` rejected by prod validation. **Environment-blocked here (sandbox filters Chromium loopback):** browser-driven Clerk signup UI and the Chromium half of `test:deployment-smoke` — `/signup` renders (HTTP 200, Clerk markers); repeat both on the deployed host. |
| Post-deploy smoke + DRIFT green | agent + operator | 2026-08-26 | **HTTP smoke: CLEARED** — `smoke:deployment` PASS (`/api/health` 200, `/api/health/dependencies` 200/`ready`, schema dep ok). Playwright HTTP fixtures 2/2 PASS; Chromium fixtures environment-blocked (see C3 notes). |

### Rollback (if a step fails)
Stop web+worker (or pull from LB) → redeploy previous commit → if schema changed and
isn't backward-compatible, restore the C2 backup → re-check `/api/health/dependencies`
+ smoke → re-enable traffic. (Full sequence: `docs/deployment-topology.md` §Rollback.)
