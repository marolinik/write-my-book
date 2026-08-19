# Gate 6 (W12) — Golden-path regression as an ENFORCED CI gate

**Status move:** PARTIAL → gate now **defined + triggering** (final MET confirmed by first CI run — see honesty note).
**Lane:** `.github/workflows/ci.yml` only (+ this evidence file). No `src/` or `tests/` touched. **NOT committed** (tree left dirty for team-lead to land by pathspec).
**Date:** 2026-07-20

---

## Problem (why W12 was PARTIAL)

The full unit suite passes locally (1078 tests / 133 files at HEAD), but:
1. **CI did not trigger on the campaign branch.** `on:` was `push: [main]` + `pull_request: [main]` — the branch `qa/bulletproof-2026-07-17` was never CI-gated.
2. **The #1 campaign invariant `tsc --noEmit` was absent from CI entirely.** The single job ran `npm run test:unit`, lint, build, worker:build, and the env/auth/db/billing/docker contracts — but never a standalone typecheck.

## Fix (additive + trigger-widening, no step removed)

Three surgical edits to `.github/workflows/ci.yml`:

1. **Widen triggers** — add the `qa/**` push glob so campaign branches are gated; keep main push + PRs targeting main.
2. **Formalize the golden-path gate** — rename the existing suite-running job `verify` → `golden-path-gate` (it already ran the full unit suite; formalized rather than duplicated, per instruction). Every existing check (env/auth/db/billing/docker/lint/build/worker) is retained unchanged.
3. **Wire the missing typecheck** — add a `Typecheck (tsc --noEmit)` step between Lint and the unit suite. No `typecheck` npm script exists (only `tsc` inside `worker:build`), so per the task's fallback the step runs `npx tsc --noEmit` (picks up `tsconfig.json`, which already sets `noEmit: true`; `typescript@^5` is a devDependency).

Node version (22), `cache: npm`, and `npm ci` install are unchanged — the gate reuses the existing job's setup verbatim.

### `on:` triggers — BEFORE / AFTER

```yaml
# BEFORE
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# AFTER
on:
  push:
    branches: [main, "qa/**"]     # campaign branches now gated
  pull_request:
    branches: [main]              # unchanged
```

Parser-confirmed effective value:
`on={"push":{"branches":["main","qa/**"]},"pull_request":{"branches":["main"]}}`

### Golden-path job definition (after)

```yaml
jobs:
  golden-path-gate:
    name: Golden-path gate (unit suite + typecheck + build)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - Checkout (actions/checkout@v4)
      - Setup Node (actions/setup-node@v4, node 22, cache npm)
      - Install dependencies         → npm ci
      - Generate Prisma client       → npx prisma generate
      - Check web env contract       → npm run env:check
      - Check worker env contract    → npm run env:check:worker
      - Check Clerk auth contract    → npm run auth:check
      - Check db deploy preflight    → npm run db:deploy:check
      - Check Stripe billing         → npm run billing:check
      - Validate Docker Compose      → docker compose ... config
      - Lint                         → npm run lint
      - Typecheck (tsc --noEmit)     → npx tsc --noEmit        # NEW — #1 invariant
      - Run unit tests               → npm run test:unit       # golden-path regression
      - Build Next.js app            → npm run build
      - Build worker                 → npm run worker:build
```

### Unified diff

```diff
 on:
   push:
-    branches: [main]
+    branches: [main, "qa/**"]
   pull_request:
     branches: [main]
@@ jobs:
-  verify:
-    name: Verify app
+  golden-path-gate:
+    name: Golden-path gate (unit suite + typecheck + build)
     runs-on: ubuntu-latest
     timeout-minutes: 20
@@
       - name: Lint
         run: npm run lint
+
+      - name: Typecheck (tsc --noEmit)
+        run: npx tsc --noEmit

       - name: Run unit tests
         run: npm run test:unit
```

---

## Validation (performed here; GitHub Actions itself cannot run from this environment)

### 1. YAML well-formed — PARSE PASS

Parsed with `js-yaml@4.1.1` (already in project `node_modules`, no network). Decisive output:

```
YAML_PARSE_OK
workflow_name=CI
on={"push":{"branches":["main","qa/**"]},"pull_request":{"branches":["main"]}}
jobs=["golden-path-gate"]
job_name=Golden-path gate (unit suite + typecheck + build)
```

The full 15-step list rendered without error (Checkout … Typecheck … Run unit tests … Build worker), confirming the typecheck step is wired between Lint and the unit suite and no existing step was dropped.

> actionlint was **not** run (Go binary, not available offline here). The js-yaml parse + full structural render is the decisive well-formedness proof available in this environment.

### 2. Every referenced `npm run` script exists in package.json — 9/9 PASS

Extracted every `npm run <script>` from the workflow and checked against `package.json.scripts`:

```
OK   npm run env:check         =>  tsx scripts/check-env.ts web
OK   npm run env:check:worker  =>  tsx scripts/check-env.ts worker
OK   npm run auth:check        =>  tsx scripts/check-clerk-config.ts
OK   npm run db:deploy:check   =>  tsx scripts/check-db-deploy.ts
OK   npm run billing:check     =>  tsx scripts/check-stripe-config.ts
OK   npm run lint              =>  eslint
OK   npm run test:unit         =>  vitest run
OK   npm run build             =>  next build
OK   npm run worker:build      =>  tsc --project tsconfig.worker.json && tsc-alias --project tsconfig.worker.json
ALL_NPM_SCRIPTS_EXIST=true
```

Non-`npm run` commands referenced are also backed: `npx prisma generate` (`prisma@^7.3.0` dependency), `npx tsc --noEmit` (`typescript@^5` devDependency; `tsconfig.json` has `noEmit:true`), `npm ci`, `docker compose … config`.

### 3. Branch glob syntax valid

`qa/**` is valid GitHub Actions branch-filter syntax — `**` matches any character including `/`, so `qa/**` matches `qa/bulletproof-2026-07-17` (same documented form as `releases/**`). It parses as a plain YAML scalar (quoted for safety).

---

## Honesty note (campaign's defining rule — cf. D-45)

**I cannot prove "green in CI" from here.** GitHub Actions runs only after a push, and this environment cannot execute the pipeline. Claiming green would be a fabricated PASS.

**What is proven now:** the gate is **defined, the YAML is valid, the campaign branch now triggers it, the typecheck invariant is wired, and every referenced script exists.** That is the honest state that moves W12 from PARTIAL toward MET. **Final MET is confirmed by the first actual CI run** on the next push to `qa/**` (or a PR to main).

### Maintainer follow-up (branch protection — disclose, do not skip)

The job id/name changed `verify` / "Verify app" → `golden-path-gate` / "Golden-path gate (unit suite + typecheck + build)". GitHub matches required status checks by the job **name**. If `main` branch protection currently requires the check named **"Verify app"**, that rule must be re-pointed to **"Golden-path gate (unit suite + typecheck + build)"**. This fails **closed** (a stale required-check name leaves PRs blocked-pending, never auto-merged), so it cannot silently let bad code through — but the maintainer should update the branch-protection rule after this lands. `deploy-smoke.yml` is unaffected: it keys off the workflow **name** `"CI"` (unchanged), not the job.
