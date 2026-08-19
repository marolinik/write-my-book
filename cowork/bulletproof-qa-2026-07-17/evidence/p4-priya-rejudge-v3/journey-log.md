# P4 "Priya" — rejudge-v3 journey log (LIVE capture, 2026-07-20)

Persona: Priya, volume writer. Runs overnight batch editorial passes across many
chapters, trusts the morning digest, watches live progress while a batch runs,
cost-conscious. Drives the LIVE committed product as `user_qa_p4` (pro + seeded
OpenRouter BYOK, model `qwen/qwen3.6-27b`).

## Preflight (mandatory)
- `git rev-parse HEAD` = **b8871ce9753ec7ed85de392ede58266ea718cafa** ✓ (the Wave-A-resolution
  commit; adfa592 batch-honesty fixes are ancestors). Branch `qa/bulletproof-2026-07-17`.
- `/api/health/dependencies` = `ok/ready`, all deps ok (postgres, schema, redis, s3,
  worker, qdrant, neo4j). See `api-traces/00-preflight-health.txt`.
- Worker proof: exactly ONE leaf worker (node `--require preflight ... src/worker.ts`,
  PID 40524). npx/tsx entries are its launcher chain, not separate workers.
  Re-confirmed same PID 40524 at end of capture. See `worker-proof.txt`.

## Fixture (as Priya would paste prose)
- Created a fresh book "Priya v3 Recapture — The Lighthouse Ledger <ts>"
  (`d633f5ae-8b61-4175-bf31-810a41b30b78`). Book-create auto-made Chapter 1.
- Added Chapters 2 & 3; PUT ~180-word real literary prose into all 3 (all 200 OK).
  See `fixture.json` (full prose + chapter ids). Chapters are hard-wrapped
  (newlines inside paragraphs), which turned out to matter for D-8.

## Drill 1 — D-96 (THE floor driver): live batch poll honesty
- **run1**: enqueued `line-edit` × chapters 1–3, budgetCapUsd **$0.50** (non-halting),
  scheduleMode "now" → batch `cmrtoa1i50000280fkryvkm8e`, 3 children.
- Polled the detail route `GET /books/:id/batch/:batchId` every ~1.2s
  (`poll-timelines/run1.jsonl`, 184 + terminal polls). Acceptance:
  - (a) `counts.running > 0` mid-run → **YES**, poll #1 (~2s post-enqueue): `running:2, queued:1`.
  - (b) `spentUsd > 0` after first child completes, pre-terminal → **YES**, poll #170:
    `spentUsd 0.02352354, status running, completed:1`.
  - (c) `status != "queued"` once working → **YES**, "running" from poll #1.
  - (d) `startedAt` non-null mid-run → **YES**, from poll #1 (`2026-07-20T20:23:51.596Z`).
  - Live spend tracked completions: **0.02352354 (1 done) → 0.04463952 (2 done) →
    0.07291056 (3 done)**.
  - (e) terminal poll == digest-reconciled row → **YES**: detail route terminal
    `status:done, spentUsd:0.07291056`; `digest.spentUsd:0.07291056`; list-route row
    `spentUsd:0.07291056`. Four-way agreement intact. (`run1-terminal.json`)
- Latency notes (dev-labeled): enqueue POST ~1.9s; each poll ~100–170ms; each
  `line-edit` child ~3.5–5 min wall (qwen3.6-27b over OpenRouter, dev). The full
  3-child run took ~7.5 min (20:23:51 → 20:31:18).

### D-96 RENDERED (browser, as Priya watches live)
Queued a SECOND batch through the actual UI dialog (`/books/:id/editorial` →
"Batch editorial" → Line Edit, ch 1–3, cap $10, Now → "Queue batch"). Batch
`cmrton5cy0001280fc1mhyurd`. The dialog polls the detail route every 3s.
- ~4s in: dialog badge **"running"** (NOT "queued"), spend **"$0.00 / $10.00"**,
  "0/3 passes done" — honest: no child had committed spend yet.
  (`screenshots/02-batch-running-early-status.png`)
- ~6 min in: **"running · $0.09 / $10.00 · 2/3 passes done"** — the live surface
  renders **spend-so-far**, the exact S2-escalation condition the prior panel
  flagged; it now reads honestly, not "$0.00".
  (`screenshots/03-batch-midrun-running-spend.jpeg`)
- terminal: **"done · $0.12 / $10.00 · 3/3 passes done"**, Cancel button gone.
  Detail route confirmed `status:done spentUsd:0.11880123`.
  (`screenshots/04-batch-terminal-done.jpeg`)

## Drill 2 — D-98 + NEW-2: halted batch honesty
- Enqueued `line-edit` × ch 1–3, budgetCapUsd **$0.005** (sub-cent, API-only — the
  UI cap input has min=1). Batch `cmrtsngpd0002280fzqzaalp4`.
- Polled to terminal (`poll-timelines/halt.jsonl`, 254 polls). Outcome: **halted**,
  `haltReason:"budget_cap"`, `spentUsd 0.051775125`, completed:2 + skipped:1.
  Overshoot $0.0518 over a $0.005 cap ≈ concurrency(2) × per-child (~$0.026) — the
  documented NEW-B worst case, re-confirmed live. The halt is honest; the 3rd child
  was **skipped** (never billed).
- **Live-halt surfaced MID-RUN**: poll #244 (22:31:25) already showed
  `status:running, halted:true, spentUsd:0.0233` — 13s BEFORE the terminal poll #254
  (22:31:38) where it flips to `status:halted`. The poll route reads the live Redis
  `batch:{id}:halted` flag, so the halt is visible before the digest fan-in
  (baseline lie "halted:false until terminal" → CLOSED).
- **Notification (`api-traces/d98-new2-halt-notification.json`)**:
  - title = **"Overnight batch halted — budget cap reached"** (NOT "complete").
  - message = **"2/3 passes · 1 skipped · halted at budget cap · $0.05 / $0.005 cap"**
    — names the halt AND renders the cap as **"$0.005"**, not "$0.00" (NEW-2 fixed via
    `formatCapUsd`). priority = **high**.
  - Contrast: the two healthy runs' notifications read **"Overnight batch complete"**
    ("$0.12 / $10.00 cap", "$0.07 / $0.50 cap"), priority normal.
- **Rendered**: the dashboard (`/dashboard`) alert feed shows the unread digest
  titles verbatim, including "Overnight batch halted — budget cap reached" alongside
  the "complete" ones. (`screenshots/05-dashboard-halt-notification.jpeg`)

## Drill 3 — D-97 live re-probe (source says not-a-bug; this decides it)
- Two batches, IDENTICAL input (line-edit × ch 1–3): run1 (`cmrtoa1i5…`, cap $0.50)
  and run2 (`cmrton5cy…`, the browser batch, cap $10 — cap is the only setting diff
  and neither halts, so it does not affect findings provenance).
- Prisma dump per run (`api-traces/d97-provenance.json`):
  - run1: **7** findings persisted, per-chapter {1:3, 2:3, 3:1}; digest total **7** (==).
  - run2: **2** findings persisted, per-chapter {1:1, 3:1}; digest total **2** (==).
  - session ids **disjoint** between runs (0 shared); **0 foreign findings** in either
    (every finding.sessionId ∈ its own run's childIds); skipped-child credit 0.
  - run2 has FEWER findings than run1 (2 < 7) on identical input — LLM non-determinism.
    A cumulative/superset counter could only go UP, so this **definitively refutes**
    the prior panel's "43 vs 11 superset, skipped child credited 2" symptom. **D-97
    does not reproduce on fixed HEAD** — the source audit (findings scoped to this
    batch's sessions) holds live.

## Drill 4 — D-8 byte-verify (finding anchors vs prose)
- Pulled every run1 finding's `originalText` + `anchorQuote` and byte-compared against
  the live chapter markdown (`api-traces/d8-byteverify-run1.json`).
- **0 genuine misquotes** — after whitespace normalization, 12/12 anchor strings'
  words are present, in order, in the prose the finding points at. The model is NOT
  inventing text to quote (positive trust signal). Findings render in the UI with
  those verbatim quotes ("The glass was fogged with brine", "When she was a girl.").
- BUT byte-EXACT: only 5/12 anchors are exact substrings; **7/12 normalize the prose's
  hard-wrap newlines to spaces**. Since `originalText` is schema-documented as "Exact
  text to find in chapter (for auto-apply)", an auto-apply find-and-replace keyed on
  `originalText` would fail to locate the span on hard-wrapped manuscripts. → recorded
  as a provisional reliability defect (D-8 content fidelity itself is clean). I did not
  exercise the "Apply" button, so whether the apply path tolerates whitespace is
  unconfirmed — recorded honestly.

## Drill 5 — D-20 spot-check (chapter-number collision)
- POST `chapterNumber:1` (auto-created) and `chapterNumber:2` (fixture) →
  **both 409** with envelope `{"error":"A chapter with that number already exists in
  this book"}`. No 500, no silent auto-create (chapter count stayed 3). A fresh number
  (9) still returns **201**. (`api-traces/d20-chapter-collision.json`) D-20 CLOSED.

## Value sweep (D3 / D5 / D11) — Priya's loop: enqueue → watch live → morning digest → open flagged chapters
- **D5 (queue / live honesty — the floor):** now honest end-to-end. One POST kicks a
  batch; the detail poll route and the UI dialog both report running count, live
  spend-so-far, live halt, and startedAt at read time; terminal reconciles to the
  digest with four-way spend agreement. This was the P4 floor at 4.0; the lie is gone.
- **D3 (usability):** the one-POST kick + honest live dialog is good. Two frictions:
  (1) the batch **LIST** route `GET /books/:id/batch` still returns the RAW BatchRun
  row (queued/$0) for a running batch — the D-96 live derivation was applied only to
  the DETAIL route; a "recent batches" list surface would still show the old lie
  (recorded). (2) mid-run spend is coarse: it stays $0 until the first child COMPLETES
  (~5 min here), then jumps — honest (no committed spend), but a volume writer stares
  at "$0.00 running" for minutes.
- **D11 (competitive edge):** honest per-batch money accounting through a real halt,
  BYOK, a working budget cap, and morning digests that truthfully distinguish
  "halted — budget cap reached" from "complete" — a real edge over a generic tool +
  manual passes. Findings are actionable (categorized, chapter-anchored, with verbatim
  quotes and Apply/Dismiss/Discuss). A cost-conscious volume writer would plausibly
  switch and pay, provided the auto-apply anchor issue (D-8 whitespace) doesn't bite on
  their hard-wrapped manuscripts.

## Honest limitations of this capture
- All batches were 3 tiny 151–180-word chapters, not Priya's real 30-chapter shape
  (scale untested). LLM non-determinism gave run2 only 2 findings.
- Browser evidence captured under `DEV_AUTH_BYPASS` (DEV_CLERK_ID=user_qa_p4). The
  ~10 browser console "errors" are all `clerk.example.test` script 404s — expected in
  bypass mode, not product faults; the page renders correctly as Priya.
- Did not exercise: the "Apply" button (so D-8 auto-apply tolerance unconfirmed),
  cancel-mid-run, worker-crash recovery, concurrent-batch collision, Redis-outage
  digest live.
