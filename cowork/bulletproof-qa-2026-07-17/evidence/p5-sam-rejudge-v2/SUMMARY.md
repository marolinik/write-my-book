# P5 "Sam" — Onboarding / Card-Free On-Ramp — REJUDGE v2 SUMMARY

> Written by team-lead from the capture executor's returned report (harness
> subagent-report guard blocked the executor from writing this file).
> **TEAM-LEAD ID CORRECTION:** the executor's provisional D-96/D-97/D-98 collide
> with the batch-live-honesty cluster already filed under those IDs. Canonical:
> **D-96→D-99** (stale server), **D-97→D-100** (reasoning-model ghost-text),
> **D-98→D-101** (DEV_AUTH_BYPASS). Applied below.

**Run:** 2026-07-20 · LIVE http://localhost:3002 as P5 "Sam" (`user_qa_p5`, `plan:null`
UNSUBSCRIBED, 390×844). One worker (`worker-proof.txt`, leaf PID 61892). Secrets read
from process.env via `--env-file=.env`, never printed. Evidence-only — no `src/` edits.

## Headline
Fixes are CORRECT IN CODE but only PARTIALLY LIVE. **D-95 privacy copy, Free-cap 403,
and export-ungated CONFIRM live.** D-92 (billing + AI-assist) is STILL 500 live — NOT
because the fix is wrong (a fresh process runs it green) but because the WEB SERVER WAS
NEVER RESTARTED (only the worker), so it serves a stale `globalThis`-cached Prisma
client (D-99). Even after a restart, Sam's seeded reasoning model returns empty output
→ 502 (D-100). No-auth 401 control is masked by `DEV_AUTH_BYPASS=true` (D-101).

## Verdicts
| Item | Verdict | Proof |
|---|---|---|
| D-92 billing honesty (GET 200 + snapshot) | STILL-BROKEN LIVE (500); **401-mask FIXED**; green in fresh process | `02-subscription-get.json`, `repro-snapshot.json` |
| D-92 AI-assist (ghost/inline 200) | STILL-BROKEN LIVE (500); 502-empty even post-restart (D-100) | `40/41-*.json`, `repro-ai-assist.json`, `repro-ai-diagnostic.json` |
| D-95 privacy copy | **CONFIRMED-LIVE** | `screenshots/onboarding-step1-privacy_390x844.png`, `ui-capture-v2.json` |
| Free-cap 2nd book → 403 | **CONFIRMED-LIVE (driven)** | `10-create-2nd-book-cap-403.json` |
| Export ungated → 200 real | **CONFIRMED-LIVE (driven)** | `20-export-existing-book.json` (real .docx, 96 words) |
| No-auth → 401 | NOT CONFIRMED — masked by `DEV_AUTH_BYPASS` (D-101) | `30/31/32/33-*.json`, `00-env-flags.json` |
| Editor UI + working-AI | PARTIAL — editor live; working-AI not capturable live (500) | `editor-chapter_390x844.png` |

Status deltas: **billing GET 401 → 500** (still non-200, but now HONEST — the false-auth mask is gone). AI-assist 500 → 500.

## New defects (canonical IDs)
- **D-99 (env, blocks live confirmation)** — fix correct on disk (table shape ✓ `introspect-free-tier-usage.json`, generated client has FreeTierUsage delegate ✓, fresh `getFreeTierSnapshot(sam)` green ✓ `repro-snapshot.json`) but NOT live: web server up 07-18 14:53 predates the fix (07-19) and the `db:push`; only the worker was restarted (07-20 11:04). `db.ts` caches the Prisma client on `globalThis` (HMR reloads routes, not the client). **WEB-SERVER RESTART REQUIRED** to make D-92 (billing 200 + AI-assist) live.
- **D-100 (S2)** — seeded default `qwen/qwen3.6-27b` returns ONLY `thinking`/`redacted_thinking` blocks (no `text`) at 60 AND 400 tokens → the routes' honest D-04/D-38 guard yields **502 "cut off, retryable"**, never a usable suggestion. The metering gate CLEARS (ghost remaining 100, inline 50) and OpenRouter resolves — the failure is reasoning-model × small ghost-text budget. The moat's first taste is an empty-retry loop. Proof: `repro-ai-assist.json`, `repro-ai-diagnostic.json`.
- **D-101 (dev-only, latent S1-if-prod)** — `DEV_AUTH_BYPASS=true` silently authenticates header-less requests as the DEV user (no-auth `GET /api/books` → 200 returning the dev user's books). Gated `NODE_ENV!=="production"`, but a latent S1 if it ever reaches a non-dev deploy; also why the 401 negative control is unprovable here. Proof: `00-env-flags.json`, `31-noauth-books-list-401.json`.

## Confirmed-fixed (held live)
- **D-95** — onboarding renders "Your Writing Stays Yours / stored encrypted at rest and sent only to the AI provider you connect / never use your content to train AI models / keys encrypted"; old false "never stores… on our servers" ABSENT (`hasOldFalseClaim:false`), grep-confirmed gone from `src/`.
- **Free cap** driven: 2nd book → 403 "Free plan includes 1 book. Upgrade to Indie…".
- **Export** driven: 200 real docx (96 words, 1 chapter, ~6 pages) — ungated.
- **Editor** 390×844 renders Sam's prose + "32 words"; live in-page ghost-text fetch returns 500 (what Sam sees TODAY pre-restart).

## Seeded-key disclosure (required)
`user_qa_p5` carries a seeded, validated **OpenRouter** key (`default_model
openrouter-qwen36/sonnet`). Plan-free but NOT key-less; BYOK AI path exercised with real
OpenRouter calls. Key never printed (provider+length only).

## Hygiene
Worker = exactly 1 (`worker-proof.txt`, leaf PID 61892). Secrets never printed
(bundle-wide scan clean). State left: Sam owns exactly 1 book (2nd create rejected 403);
one real `.docx` export in Sam's storage; AI repros read-only. No `src/` edits.
