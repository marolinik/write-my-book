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
   (`offline-autosave` under disk pressure).

---

# Addendum 2026-09-03 — live local-model E2E (Qwen via local gateway)

The e2e suite now runs REAL inference end-to-end for free: the whole app is
pointed at the self-hosted gateway (`WMB_LLM_FORCE_LOCAL=1` →
`local-llm-proxy` → LAN vLLM `Qwen3.8-Flash-Next-NVFP4`), the same model the
dev agents use. What it took:

- **Overlay-aware key validation** (`key-validator.ts`): under FORCE_LOCAL the
  BYOK save-path validates against the OPERATOR's own gateway (key never
  leaves the box), instead of rejecting the dummy keys that provably work in
  this mode. 5 new unit tests pin "never probe a real provider in local mode".
- **Reasoning-off directive to the translator**: ghost-text/inline-edit
  (D-100 quick-assist) now send `reasoning:{enabled:false}` on the `local`
  provider route too; `local-llm-proxy.py` maps it (or Anthropic
  `thinking.disabled`) to upstream `reasoning_effort:"none"`. Without this the
  60-token ghost-text budget died entirely in thinking blocks → honest but
  useless 502. With it: real streaming continuations in ~1s.
- **Overlay publishes the proxy on 127.0.0.1:30400** so a host-side dev
  server (and Playwright) reach the gateway like the in-network containers.
- **New e2e spec** `local-gateway-llm.spec.ts`: BYOK save via gateway
  validation → ghost-text → asserts a non-empty REAL model suggestion. First
  e2e coverage that exercises the LLM client path at all.
- **Runner resilience** (`playwright.config.ts`): IP-literal default base URL,
  direct connections, unsandboxed browser + `--disable-dev-shm-usage` —
  hardened/harness machines where Chromium's sandboxed network service cannot
  open sockets (misreported as `ERR_NAME_NOT_RESOLVED` even for IP literals,
  proven here across Windows and fresh Linux containers) now behave the same
  as normal ones.

**Result (host dev :3001 + overlay, single worker):** request-level suite
(api-health, api-keys, beta-score, documents, editorial, inline-edit,
local-gateway-llm, model-selection, smoke-test 14-step full workflow,
vector-memory) — **68 passed / 1 skipped / 0 failed**, including the real
Qwen round trip. Full unit suite re-greened: 215 files / **1748 tests**.

**Environment caveat:** browser-`page.goto` specs (a11y, dashboard, editor,
mobile, offline/X1/Z-drills) CANNOT run inside the DSH harness shell — the
browser's network process is blocked machine-wide there (diagnosis:
about:/data: and Node fetch work, every http:// navigation fails regardless
of host/container/flags — reproduced identically in the user's own terminal
run, system Chrome, Edge, Playwright chromium and firefox; seccomp, sandbox,
proxy and resolver theories were each tested and ruled out). The page-level
suite therefore needs an environment with sane browser networking — which is
exactly what `.github/workflows/e2e.yml` now provides on every push/PR:
production compose services + real Chromium + the full suite, with the HTML
report uploaded on failure.

**CI red streak (same day, found while landing the e2e job):** the
golden-path gate had been failing on EVERY push since ~Aug 29 — the
"Validate Docker Compose production topology" step interpolates the prod
overlay, which hard-requires six secrets via `${VAR:?}`; `ci.yml` never set
them (local runs passed because docker compose silently loads `.env`).
Everything after that step — lint, tsc, unit suite, build — consequently
NEVER RAN IN CI for weeks. Fixed with validation-only dummies; the local
reproduction of the exact step (empty env file) now exits 0. The unit/tsc/
build claims in this document stand on their own local re-runs.

Note: the `playwright.config.ts` resilience flags help restricted CI
containers but could NOT override the machine-wide browser block on the
development workstation — that one is environment-side and is why the CI
job exists.

---

# Addendum 2026-09-05 — page-level E2E root cause is Clerk, not browser networking

The "machine-wide browser block" hypothesis in the addendum above was the
leading theory for months (and is still tersely named at the bottom of this
file), but it is **wrong for the page-level suite**, and this finding fixes the
actual cause. Recorded here so nobody re-opens the now-litigated browser-
networking / proxy / VPN / WireGuard / Tailscale / Headroom angle again.

## Actually proven (layered, reproduced locally)

1. **The browser CAN reach loopback.** `nginx` on `[::1]:3050` (Docker-published)
   and a bare Node HTTP server on `127.0.0.1:3999` both load in Playwright
   Chromium (`200`). No system proxy (`ProxyEnable=0`, WinHTTP "Direct access"),
   no `HTTP(S)_PROXY`/`NO_PROXY` env vars, and **no "Headroom" application
   installed** — that proxy/router theory was checked registry-wide and ruled out.
2. **The app IS reachable.** With Playwright request logging enabled, the app
   answers the first navigation with `REQ / → RES 307` — the loopback/network
   path to the app is fine.
3. **Clerk then hijacks the navigation.** The `307` is Clerk's middleware, and
   Clerk's own library (`clerkMiddleware`) issues a `dev-browser-missing`
   handshake redirect to `https://clerk.example.test/v1/client/handshake`
   **for a development (`pk_test_`) publishable key, BEFORE the app's user
   `bypass` callback runs** (confirmed by reading the compiled edge middleware:
   `authenticateRequest` → handshake-header check precedes the user callback).
4. `clerk.example.test` is an **intentionally non-existent** frontend API domain
   (the `.env` Clerk key decodes to it). It never resolves → the browser reports
   **`net::ERR_NAME_NOT_RESOLVED` on every `page.goto`** = the 43/127 page
   failures in CI and every local page probe.

## The fix (not the browser, not the networking)

None of `x-e2e-test-secret` header, `NODE_ENV=development`, or a runtime
`DEV_AUTH_BYPASS=true` can stop it — the handshake fires inside Clerk's library
before any of those are consulted, and the middleware handler is chosen at
server/build time. What works:

- Running the e2e app with **`DEV_AUTH_BYPASS=true`** (as an env on the
  `next dev` webServer, which is what Playwright starts). At that env the
  middleware handler is `devBypassMiddleware` — `clerkMiddleware` is not used at
  all, so no handshake, no `clerk.example.test`, no resolver error. Identity
  comes from `auth.ts`'s `DEV_AUTH_BYPASS` + `x-e2e-test-secret` path using
  `DEV_CLERK_ID`/`E2E_TEST_CLERK_ID = user_test_e2e` (the global-setup-seeded
  user).

## Local proof

`next dev` with `DEV_AUTH_BYPASS=true` + `DEV_CLERK_ID=user_test_e2e` against the
compose infra: browser loads `/`, `/dashboard`, `/books`, `/login` all **200**
(page.title present), and the full `smoke-test.spec.ts` 14-step workflow runs
green (17/18 in the batch; the single dashboard flake did not repeat on its own
run). Compare the pre-fix state where every `page.goto` failed
`ERR_NAME_NOT_RESOLVED`.

## Applied to CI

`.github/workflows/e2e.yml` now sets `DEV_AUTH_BYPASS: "true"` and
`DEV_CLERK_ID: "user_test_e2e"` in the workflow env (which the Playwright
`webServer` `next dev` inherits). This is gated to the e2e job's env only —
real production still forbids `DEV_AUTH_BYPASS` (`env.ts` flags it), and node
`next dev` sets `NODE_ENV=development`. The page-level suite can now genuinely
run against the dev server instead of dying at a fake Clerk domain.

**Security note:** the e2e bypass never ships to real production because
`DEV_AUTH_BYPASS` is still forbidden there and `E2E_TEST_SECRET` is a
CI-only value; this change only routes the e2e job's own app through the
intended dev-bypass, not a wider security relaxation.
