# Ops/Founder Report — Gerald's Domains

**Author:** p2-gerald · **Campaign:** bulletproof-qa-2026-07-17 · **Branch:** `qa/bulletproof-2026-07-17`
**Scope:** W5 outbound-egress audit, Sentry Session Replay, C2b object-storage restore drill, money-path items D-17/Z11/Z12.
**Format:** Status / Evidence / Residual risk / Recommended action per section. Recommended-action severity uses Low / Medium / High / Critical (launch-blocking).

---

## 1. W5 — Outbound network egress audit

**Status: PASS.** Both the static code-path audit and two live network captures (pre- and post-restart, the second against real BYOK extraction traffic) confirm the app's only outbound destinations are the three declared LLM provider endpoints plus a small, named, benign set — no undeclared exfiltration path found.

**Evidence:**
- Static claim (routing confined to `api.anthropic.com` / `openrouter.ai` / local LiteLLM proxy; Sentry key-scrubbing; DB ciphertext; no telemetry SDK): `evidence/w5-egress/findings.md`, commit `27bf906`.
- Live capture 1 (connection-level, netstat/`Get-NetTCPConnection`, no TLS payload inspection): inconclusive by design — sampling window missed the LLM traffic burst (root-caused, not a false pass). Live capture 2 (2s polling, spanning a full live "moat re-verify" journey with real qwen3.6 extraction traffic): every external connection from the monitored worker + dev-server processes resolved to `openrouter.ai` or `api.openai.com` (embeddings), plus one transparently-flagged benign exception (`npmjs.org`, dev-mode registry version-check ping, TLS-cert-verified, 2 hits). Both capture windows: raw CSVs + summaries + verdict, commit `cbc8fd9`.

**Residual risk (Low-Medium):** the local LiteLLM proxy hop (used only when a user supplies a direct OpenAI/Gemini/Grok key with no OpenRouter fallback) has its own outbound config living outside this repo — not auditable from here. This is a scope boundary, not a finding of a problem; it just means the 3-endpoint claim is verified up to the proxy boundary, not past it. Separately, the `npmjs.org` ping is dev-mode-only (Turbopack/Next.js registry check) and not reachable from a production build — no code path ships it.

**Recommended action:** (Medium) whoever owns/deploys the LiteLLM proxy config should confirm its outbound allowlist matches the same provider-only expectation, since it is the one hop this audit could not see into. (Low, non-blocking) no action needed on the npmjs.org ping — confirm at prod-build verification time that dev-only telemetry doesn't ship, as a matter of process rather than a specific fix.

---

## 2. Sentry Session Replay — masking verification

**Status: FLAGGED — open, not launch-blocking but wants a same-day check.** This is the one item in W5's scope that could not be verified locally and is the headline open item across both my egress passes.

**Evidence:** `evidence/w5-egress/findings.md` §"Sentry Session Replay". Client Sentry config sets `replaysSessionSampleRate: 0.1` and `replaysOnErrorSampleRate: 1.0` — DOM/UI session recording is live for 10% of all sessions and 100% of error sessions, shipped to Sentry's ingest servers. No explicit `Sentry.replayIntegration({maskAllText, blockAllMedia})` override exists anywhere in the repo (grep: zero matches). `@sentry/nextjs` v10.38.0's documented default behavior is to auto-enable Replay with `maskAllText: true, blockAllMedia: true` when only sample-rate options are set — so manuscript text typed in the editor *should* be masked by default. This is confirmed against Sentry's documented SDK behavior only, not by triggering a real replay and inspecting the captured recording. Locally, Sentry is entirely disabled in dev (`NEXT_PUBLIC_SENTRY_DSN` unset in `.env.docker`/`.env.example`), so a runtime check is not possible in this environment — this is why it stayed open through the whole campaign rather than being resolved.

**Residual risk (High if wrong, currently unverified):** if the SDK-default masking is somehow overridden at the Sentry *project-dashboard* level (a separate surface from the SDK init code, which this audit cannot see), or if a future dependency bump changes the default, session replays could capture raw manuscript text — a direct breach of the "your prose never leaves without your say-so" trust promise this product is built on. No evidence this has happened; the risk is entirely in the unverified gap, not an observed leak.

**Recommended action:** (High priority, low effort) before launch, either (a) have whoever owns the Sentry project dashboard confirm no masking override exists at project-config level, or (b) do a 5-minute runtime check: enable the DSN in a scratch environment, trigger a replay by typing manuscript text and forcing an error, then inspect the captured recording in the Sentry UI to confirm text is masked. Either check closes this permanently; right now it rests on documented-defaults-only evidence.

---

## 3. C2b — Object-storage (MinIO/S3) backup/restore drill

**Status: PASS.** Both legs of a full disaster-recovery drill — Postgres logical backup/restore and MinIO/S3 object mirror/restore — completed cleanly with verified data integrity at current dev scale.

**Evidence:**
- Postgres: full `pg_dump`(custom format, 195,778 B)/`pg_restore` cycle into a throwaway DB, ~12.1s first cycle / ~6.5s warm re-verify cycle, 32/32 tables restored and verified. `evidence/c2-restore-drill/runbook.md` §2, commit `cdcc9f7`.
- Object storage: bucket-to-bucket `s3 sync` mirror of 1,766 objects in 33.5s (~19ms/object), ETag spot-check + a live byte-for-byte `GET` comparison against the app's serving path. `evidence/c2-restore-drill/runbook.md` §6, commit `a6760d6`.
- **CRLF false alarm (methodology note, not a defect):** an initial byte-diff (35,884 vs 35,997 bytes) looked alarming but root-caused to the comparison tooling itself — the curl+jq extraction pipeline introduced CRLF line endings plus a trailing-newline artifact on Windows, versus the S3 object's native LF-only bytes. Zero diff after normalizing line endings on both sides; the live app serves byte-for-byte identical prose to the durably-stored snapshot. No product defect.
- **Combined RTO estimate (dev scale): under 1 minute** for a full DB + object-storage cold restore (~6.5s DB + ~40s object mirror+verify).

**Residual risk (Medium):**
1. **No automated `storage_key`↔S3 reconciliation job.** Nothing currently detects drift between a Book/Document's `storage_key` in Postgres and what actually exists in the S3 bucket (orphaned objects, or DB rows pointing at missing objects) outside of this one-off manual drill.
2. **Same-instant DB/object backup pairing needed for the live-key path.** The two backup legs (DB dump, object mirror) were taken at different times in this drill; at dev scale that's immaterial, but a production restore needs both legs pinned to the same instant, since a document's *current* content pointer lives in Postgres while its bytes live in S3 — restoring mismatched snapshots could resurrect a DB row pointing at a stale or missing object. Note: versioned document snapshots (`.versions/<id>/vN.md`) are write-once and therefore safe by construction; this risk is specific to the live/current-key path only.
3. Dev-scale timings (**196 KB DB dump, 1,766 objects) are not a production RTO estimate** — both legs scale with data/object volume and must be re-measured against a realistic prod-sized snapshot before this PASS is treated as a production SLA number.

**Recommended action:** (Medium, pre-launch-nice-to-have not blocking) add a scheduled reconciliation job that diffs `storage_key` references against actual S3 object listings and alerts on orphans/mismatches. (Medium, should precede any real production DR drill) define and script a same-instant paired backup procedure (e.g., a single orchestrated job that dumps Postgres and mirrors S3 back-to-back inside one maintenance window, or snapshots both from a consistent point via storage-level snapshotting) before relying on this drill's PASS as a production recovery plan. (Low) re-run this drill against a prod-sized synthetic dataset once available to get a real RTO number.

---

## 4. Money-path ops — D-17, Z11, Z12

**Status: D-17 fixed and live-verified. Z11 fixed and unit-verified (residual noted). Z12 remains an open ops item.**

**Evidence:**
- **D-17** (commit `1884847`) — the overnight-batch "complete" notification was reading the raw (pre-fallback) Redis ledger value instead of the already-computed `effectiveSpent`, so it could tell a writer "$0.00 spent" on a batch that genuinely cost money. Fixed and **live-verified** this session: an isolated 2-chapter batch run (exclusive worker slot, no concurrent traffic) produced a `BookNotification` reading "$0.03 / $10.00 cap", cross-checked against `BatchRun.spentUsd` (0.03205431), the persisted `digest.spentUsd` (0.03205431), and a direct read-only `redis-cli GET` of the raw ledger key (0.03205431) — all four sources agree exactly. Evidence: `evidence/p2-gerald/api-traces/priya-d17z11-*`, commit `168998c`.
- **Z11** (commit `c9e99e7`) — `readBatchLedger` previously returned hard zeros on any Redis read failure, which the digest then persisted as `BatchRun.spentUsd`/`digest.spentUsd`, potentially mislabeling a breaker-halted batch as cleanly "done" at $0 spent. Fixed to fall back to a DB-side sum of `actualCostUsd` across child sessions when the ledger read fails. Verified GREEN at the unit level this session (`tests/unit/batch-digest-notification-spend.test.ts` 1/1, `tests/unit/batch-lifecycle.test.ts` 9/9 including the named Z11 case — both exercise the exact `readBatchLedger` catch path and the `effectiveSpent` computation with mocked Redis rejection). **Not live-reproduced**: forcing a real Redis connection failure on the shared `platform-new-redis-1` instance mid-digest would disrupt every persona/agent using the QA environment concurrently — this is exactly the class of destructive shared-infra action this campaign intentionally routes to a human decision rather than an agent doing it unilaterally. Team-lead ruling: unit-level coverage accepted as sufficient; live-outage repro is optional, not required.
- **Z12** (documented `evidence/money-path-Z8-Z12.md`) — no `litellm` service is declared in either `docker-compose.yml` or `docker-compose.prod.yml`; a user with a direct OpenAI/Gemini/Grok key and no OpenRouter fallback key would hit a dead local proxy. Confirmed **not a money-correctness bug** (a failed connection spends $0 — it fails before reaching any provider), purely an availability/config gap. Not touched this session; still open.

**Residual risk:**
- Z11 (Low): the DB-fallback branch is proven correct in isolation but has not been observed end-to-end against a genuine Redis outage in the live stack. Given the unit test exercises the identical code path the live digest job runs, this is a process/coverage-completeness gap, not an unverified fix.
- Z12 (Medium, availability): any writer relying solely on a direct OpenAI/Gemini/Grok key (no OpenRouter key on file) currently gets a hard connection-refused failure with no working fallback, until the proxy is wired into the deploy.

**Recommended action:** (Optional, Low priority) if the team wants a live Z11 repro before launch, it should be scheduled as a dedicated maintenance-window drill (isolated environment or an explicit "everyone pause" window), not run opportunistically during active QA traffic — added to the founder/ops follow-up list rather than blocking this campaign. (Medium, should precede launch if direct-provider-key BYOK is an advertised path) either add a `litellm` service to the compose stack and wire `LITELLM_BASE_URL` for the `app`+`worker` services, or explicitly document that direct OpenAI/Gemini/Grok BYOK requires an OpenRouter key as the routing fallback and validate that constraint at key-save time so users don't discover the gap at batch-run time.
