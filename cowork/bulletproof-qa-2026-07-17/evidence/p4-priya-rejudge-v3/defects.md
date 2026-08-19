# P4 rejudge-v3 — defects & raw observations (LIVE, HEAD b8871ce)

Evidence-only. New defects recorded raw; NOT fixed. IDs marked "TBD" — register
assignment is the judge/orchestrator's call (next free was D-120 per memory).

## Baseline drivers retested (the 4.0 verdict this re-capture must retest)

| ID | Prior | Verdict now | Proof (file) |
|----|-------|-------------|--------------|
| **D-96** live batch poll lies (running always 0 / status queued / spend $0 / halted:false until terminal / startedAt null) | S3, floor driver | **CLOSED** | run1 poll#1 `running:2, status:running, startedAt set`; poll#170 mid-run `spentUsd 0.0235`; spend rose 0.0235→0.0446→0.0729; halt poll#244 `halted:true` 13s pre-terminal; UI dialog "running · $0.09 · 2/3"; terminal==digest==list `spentUsd 0.07291056`. `poll-timelines/run1*.json`, `halt.jsonl`, `screenshots/02–04` |
| **D-97** digest findings over-claim (43 vs 11 superset, skipped child credited) | S3 suspected | **CLOSED (does not reproduce)** | identical input: run1=7 findings, run2=**2** (fewer, not superset); disjoint session ids; 0 foreign findings; each digest==own-session persisted. `api-traces/d97-provenance.json` |
| **D-98** halted batch mislabeled "complete" | S3 | **CLOSED** | halt notif title "Overnight batch halted — budget cap reached", message names halt, priority high; healthy runs titled "complete". `api-traces/d98-new2-halt-notification.json`, `screenshots/05` |
| **NEW-2** sub-cent cap renders "$0.00" | S4 | **CLOSED** | halt message renders "$0.005 cap" (not "$0.00 cap") via `formatCapUsd`. same trace |
| **D-20** chapter-create raw 500 on collision | S2/S3 | **CLOSED** | duplicate chapterNumber → 409 clean envelope, no 500, no phantom (count stayed 3), fresh # still 201. `api-traces/d20-chapter-collision.json` |

## New defects / raw observations (this capture)

### TBD-1 (S4, provisional) — finding `originalText` not byte-exact on hard-wrapped prose (auto-apply risk)
- **Where:** `EditFinding.originalText` (schema comment: "Exact text to find in chapter
  (for auto-apply)"), produced by the line-edit agent.
- **What:** for run1's findings, only 5/12 anchor strings (`originalText`+`anchorQuote`)
  are byte-exact substrings of the chapter markdown; **7/12 collapse the prose's
  hard-wrap newlines to spaces**. Example: prose `"The glass\nwas fogged with brine…"`;
  finding `originalText = "The glass was fogged with brine…"` (space where the doc has a
  newline). One finding even emitted a newline-preserving `originalText` (matches) AND a
  space-normalized `anchorQuote` (doesn't) for the SAME span — proving it's whitespace
  treatment, not fabrication.
- **Impact:** an auto-apply find-and-replace keyed on `originalText` would fail to locate
  the span for hard-wrapped manuscripts (Priya pastes prose from other editors, often
  hard-wrapped). The "Apply" button could silently no-op / error for these findings.
- **NOT a content/honesty defect:** 0 genuine misquotes — every quoted word is truly in
  the prose (positive trust signal). This is a reliability/UX gap.
- **Unconfirmed:** I did not click "Apply", so whether the apply path normalizes
  whitespace before matching is unverified. Recorded honestly. `api-traces/d8-byteverify-run1.json`.

### TBD-2 (S4) — batch LIST route still returns the raw stale row (D-96 sibling gap)
- **Where:** `GET /api/books/:id/batch` (list route) vs `GET /api/books/:id/batch/:batchId`
  (detail route). The D-96 live derivation (`route.ts`) was applied ONLY to the detail
  route.
- **What (observed live):** while run1 was actively running, the SAME batch read as
  `status:"running", spentUsd:0.0446` on the detail route but `status:"queued",
  spentUsd:0` on the list route (`run1-summary.json` `.listRow`). The list route returns
  the raw `BatchRun` columns (written only at digest fan-in).
- **Impact:** minor today — the live UI dialog uses the detail route. But any surface that
  reads the list (e.g. a "recent batches" table) would show the exact "queued / $0"
  lie D-96 fixed, on a sibling endpoint. Same defect class, unpatched neighbour.

### OBS-1 (NOT a defect — honest limitation) — coarse mid-run spend granularity
- `spentUsd` stays $0 until the first child COMPLETES (child cost is recorded at
  completion, ~5 min here for slow line-edit), then jumps. Honest (no committed spend
  yet), but a volume writer watching sees "running · $0.00" for minutes while tokens
  burn. Per-token live streaming would be smoother; current behaviour is truthful, not a
  lie. The baseline D-96 lie ("$0 AFTER a child completed") is genuinely fixed.

### OBS-2 (re-confirm of known NEW-B, S4 doc) — cap overshoot ≈ concurrency × per-child
- Halt drill: $0.051775 spent over a $0.005 cap (~10×), because concurrency-2 admits two
  children (both see spent < cap) before either bills. The halt itself is honest and the
  3rd child was skipped unbilled; the overshoot is inherent to the pre-child guard +
  concurrency, matching the documented NEW-B worst case. No mid-flight cancellation.

## "Suspiciously clean?" — no
Bundle preserves: a real budget halt with 10× overshoot, a genuinely non-deterministic
finding count (7 vs 2 on identical input), byte-level whitespace mismatches (TBD-1), a
live list-vs-detail contradiction (TBD-2), ~5-min dev LLM latencies, and self-filed
provisional defects. Agreement figures are script-computed from independent HTTP + Prisma
sources. Worker-proof double-captured (start + end, same PID). Secrets: clean (the one
audit "hit" is a header-NAME substring false positive; see `api-traces/secrets-audit.json`).
