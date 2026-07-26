# P1 "Maya" re-judge v2 — blind judge bundle (2026-07-26)

You are re-judging persona **P1 "Maya"** (discuss/memory-loop literary writer) of the wmb-pub bulletproof-QA campaign, after a UI evidence wave on the already-fixed build.

## Baseline (prior verdict)
- `evidence/judging/HELD-REJUDGE-AGGREGATE.md` — P1 section: **6.0**, floor **D3b** (discuss trust), dims D1 7.5 / D2 8.0 / D3 6.5 / D3b 6.0 / D5 6.5 / D7 7.5 / D8 7.5 / D9 7.5 / D10 7.0 / D11 7.0.
- Floor drivers then: D-104 blank/structured-only discuss bubbles, D-107 duplicate pending findings, D-113 stale report metadata — all since FIXED in code: commits 2d715ee (D-104) and cfe622a (D-107 + D-113). Spot-check with git show.

## New evidence (this wave)
- `evidence/p1-maya-rejudge/UI-CAPTURE-2026-07-26.md` — READ FULLY. 42-series screenshots in the same directory; view the PNGs yourself with the Read tool (they are ground truth).
- Key claims to verify against pixels: 3 live discuss turns with 0 blank bubbles + rendered AI Rewrite Comparison card + honest 3-exchange cap (42a/42b); show-tell duplicate cluster stays exactly 3 across a full dev-edit rerun (42c before/after); pre-fix stale report header vs fresh header-less report (42d); populated return-writer dashboard (42e).
- NEW defects surfaced by the capture, registered as **D-157** (REMEMBER control-block leak + silent constraint drop, S2), **D-158** (word-count wrong in report prose, S4), **D-159** (semantic near-duplicate past anchor-exact dedup, S3) — see `evidence/fix-reviews/D-157-D-159-p1-capture-observations.md`.

## Disclosed caveats (do not treat as hidden)
- The exact pre-fix D-104 trigger (prose parsing to empty with only structured fields) did not recur live; fallback text path covered by unit tests only.
- The D-107 suppression gate itself did not observably fire (agent declined to re-create); UI shows the dedup outcome, not the gate.
- The D-113 stamp was a no-op on the fresh report (model wrote it header-less); header behavior is unit-tested; wrong count persists in prose (= D-158).
- OpenRouter outage stalled dev-edit run 1 ~40 min mid-capture (disclosed in doc); billable usage + persona-state changes disclosed in doc.

## Your job
Score every baseline dim 1-10 (0.5 steps) for the persona experience AS EVIDENCED NOW (code truth + on-camera truth; absent evidence caps a dim; disclosed warts are honest but still warts). Overall = floor-bound (MIN across dims governs). Name the floor dim + driver, list any new defects you see in the pixels that the capture doc missed, and state what single next action would most raise the floor.
