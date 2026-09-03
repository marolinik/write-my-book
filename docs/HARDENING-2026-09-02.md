# Production Hardening — 2026-09-02

Independent security audit pass (3-lane agent pool: security/authz, deploy-infra,
reliability) over the tree at `72f679e`, followed by the fixes below. Companion
to `docs/LAUNCH-REVIEW-2026-08-31.md`; supersedes its open items where marked.

## Verdict after this pass: APPROVE FOR PRODUCTION (conditions in §Residual)

## Findings fixed in this wave

### Critical — SSRF (audit C1 + C2)
- **New `src/lib/ssrf-guard.ts`**: shared URL policy for every server-side
  fetch of a user/LLM-supplied URL. Protocol/credential checks, full DNS
  resolution (every address), IPv4+IPv6 range policy including IPv4-mapped,
  6to4 and Teredo carriers, manual redirect following with per-hop
  re-validation (max 3), and `readCappedText` streaming byte ceilings.
  - Cloud metadata/link-local (`169.254.0.0/16`, `fe80::/10`), multicast and
    reserved ranges: **blocked unconditionally**.
  - Private LAN ranges: blocked by default; self-hosted single-tenant LAN
    vLLM support preserved via `WMB_ALLOW_PRIVATE_MODEL_HOSTS=1`
    (`.env.example`, `docker-compose.local-llm.yml`; prod compose documents
    the NEVER-set rule).
- `POST /api/settings/custom-providers` discovery fetch now goes through the
  guard, with neutral error messages (the old "Could not reach X vs answered
  {status}" difference was an internal port-scan oracle).
- `FetchWebPage` agent tool (user/LLM-supplied URLs whose BODY was returned
  into model context — full-read SSRF) now: always-strict guard, 2 MB
  streaming cap, HTML/text content-type gate.
- Call-path note: saved provider `baseURL` is consumed ONLY by save-time
  discovery; inference routes through the env-configured local proxy —
  verified, so no per-call rebinding surface.

### High
- **H1 document IDOR** — `DocumentService.read/readPinned/update/delete/
  restoreVersion/getVersions/getVersionContent` now enforce a tenant fence
  (`id` must belong to the service's book/series AND that parent to the
  service's user). Three GET surfaces that passed foreign doc ids straight
  through now structurally cannot (cross-tenant Document row leak: titles,
  chapter numbers, storageKeys, bookId).
- **H2 security headers** — `next.config.ts` `headers()`:
  nosniff / DENY-framing / strict-origin referrer / camera-mic-geo perms in
  all envs; production adds HSTS (1y includeSubDomains) and a CSP fencing
  script/frame/form-action to self+Clerk+Stripe+Sentry, `frame-ancestors
  'none'`, `object-src 'none'`, `upgrade-insecure-requests`. Known
  limitation: script-src keeps `'unsafe-inline'` for App-Router RSC flight
  payloads; nonce migration is a tracked follow-up.
- **H3 health endpoints** — `/api/health` production response no longer
  names which secrets are missing (liveness verdict only). `/api/health/
  dependencies`: 15 s cache + in-flight collapse (was ~6 outbound probes per
  anonymous hit), production message sanitization (no host:port echoes), and
  trust tiers — container loopback healthchecks unchanged, `HEALTH_TOKEN`
  (compose passthrough + `smoke-deployment.ts` header) unlocks full detail,
  anonymous public gets verdict+names only.
- **H4 Stripe webhook event loss** — claim-then-process-then-release: a
  mid-handler throw deletes the claim row and returns 500, so Stripe retries
  re-process instead of being deduped against the dead delivery (pre-fix a
  single transient failure permanently lost the entitlement event).
  Regression tests: P2002 dedupe, failure releases claim.

### Medium
- **M1 approval gate binding** — pending approval records now stamp the
  owning `sessionId` (both worker write paths); the approve route requires
  `parsed.sessionId === url sessionId`. A leaked approvalId can no longer
  resolve another tenant's destructive-operation gate.
- **M3 JSON body ceiling** — `parseJsonBody` rejects >5 MB by declared
  length AND during the streamed read (413 via `BodyTooLargeError`);
  previously one huge POST reached the heap before Zod ever ran.
- **M4 founder-count public route** — added to the middleware public list;
  the pricing-page live Founder counter works for anonymous visitors again.

### Low
- **L3** Gemini key validation moved from `?key=` query string to the
  `x-goog-api-key` header (no more secret in provider access logs).

### Also in this wave
- **D-203 hydration mismatch fixed** (`src/components/ui/command.tsx`): the
  sr-only `DialogHeader` (Radix `useId`) moved inside `DialogContent`, so it
  is not server-rendered while closed — kills the console-error the Z13
  data-safety drill caught.
- **Landing truthfulness (launch-review P0)**: fabricated counts removed
  ("2,500+ writers trust", "50,000+ chapters processed", "TRUSTED BY WRITERS
  FROM Publishing Houses") → audience framing + verifiable product facts;
  fabricated testimonials (`testimonials.tsx` deleted) replaced by
  `PlatformPromise` — three commitments the code actually enforces (BYOK no
  markup, export never gated, card-free Indie/Pro trial — all verified in
  `checkout/route.ts`).

## Verification
- `tsc --noEmit`: clean. `eslint src`: 0 errors (188 pre-existing warnings).
- `vitest run`: **214 files, 1743/1743 green** (8 new tests: SSRF policy ×6,
  webhook dedupe/release ×2). `next build`: see CI run.
- Infra spot-checks: Dockerfile non-root + standalone ✓; compose binds every
  port to 127.0.0.1 ✓; CI golden path covers env/auth/billing/db gates →
  lint → tsc → unit → build → worker ✓; prod compose required-secrets ✓.

## Residual risks (accepted for launch, tracked)
1. **No rate limiting (audit M2)** — per-user token buckets on
   LLM-triggering routes and per-IP on webhooks/health. BYOK economics +
   free-tier caps bound the blast radius; queue abuse still possible.
   Highest-value next iteration.
2. DNS-rebinding TOCTOU on private-opt-in hosts only (metadata stays
   blocked); full closure = undici Connector IP pinning.
3. CSP script-src `'unsafe-inline'` (RSC constraint) — nonce migration.
4. L5 founder-slot count-then-claim race (>200 sold under a burst —
   goodwill/refund issue, not security).
5. Onboarding gate trusts a client cookie (product gate, not security
   boundary; all APIs independently `requireUser` — audit confirmed 90/90).
6. E2e suite last witnessed 122/2/2 with D-203 (fixed here, needs a re-run
   against the rebuilt container) + 1 environmental flake
   (`offline-autosave` under disk saturation).
