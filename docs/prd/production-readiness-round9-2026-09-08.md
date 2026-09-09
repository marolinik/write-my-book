# Production readiness — Release notes (round 8–9 consolidated)

**Date:** 2026-09-08 · **Branch:** `main` · **HEAD:** `ecf3713`

## Status summary

Everything shipped in rounds 8–9 is verified and pushed. The working tree is clean.
The production deploy should run through the **CI-published build**, exactly as the
existing deploy pipeline does (CI deploys with real Clerk/secret env supplied from
GitHub Secrets, and its golden-path gate runs `scripts/check-all-app-numbers.ts`
= unit suite + typecheck + build).

### Verification matrix (final HEAD `ecf3713`)
| Check | Result |
|-------|--------|
| Unit suite | ✅ **223 files / 1836 passed** |
| TypeScript (`tsc --noEmit --incremental false`) | ✅ clean (0 errors) |
| ESLint (all changed files) | ✅ 0 errors |
| DB preflight (`db:deploy:check`) | ✅ OK |
| Prisma (`generate` + `db push`) | ✅ DB in sync (BOOK_PLAN enum, Series.coverUrl, Book.coverUrl/backCoverUrl present) |
| CI (golden-path gate + build + typecheck + unit) | ✅ green on `ecf3713` (run `34286601420`) |
| Playwright E2E | ✅ green on `ecf3713` (run `34286601379`, 128 passed / 3 skipped / 0 failed) |

## The `next build` note (important for any local run)

`npm run build` locally compiles successfully (TypeScript + `runAfterProductionCompile`
pass), but **fails during Next.js "collecting page data"** because the local
`.env` contains Clerk **placeholders** (`CLERK_SECRET_KEY=sk_test_placeholder`,
`CLERK_WEBHOOK_SECRET=whsec_placeholder`). Clerk's runtime deliberately rejects
"Placeholder value ... in production runtime". This is **not a code defect** — it is
the expected pre-existeting local-env state, and it happens regardless of any code
change to any round. The authoritative production build is the CI build (which is
green, with real secrets). To run a full local `next build`, replace the two Clerk
placeholder values with real development secrets.

## What shipped since `3a1a7a8` (round-8) → `ecf3713`

- **Round 8:** back-cover binding in exports (Book.backCoverUrl + upload route +
  settings UI; also threaded Book.coverUrl through the export route, fixing the
  previously-dead front-cover S3 binding); persisted whole-book plan as BOOK_PLAN
  (new DocumentType + WriteDocument gate kept honest for empty budgets).
- **Round 9:** working series/omnibus export (new `exportSeriesOmnibus()` multi-book
  assembly — previously the omnibus branch was dead code), Series.coverUrl + series
  cover upload, series export/download routes, and a printable whole-series report.

## Deploy checklist
1. `DATABASE_URL` reachable; run `npm run db:push:prod` (already in sync — enum/columns
   are additive and non-breaking).
2. Supply real `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` via secrets in the deploy
   environment (placeholders reject production builds).
3. Optional infra: S3/MinIO, Qdrant, Neo4j, Redis + BullMQ per existing env config.
4. Deploy the tree at `ecf3713` (or a later green HEAD). No migrations directory is
   used — this project deploys with `prisma db push` by design.