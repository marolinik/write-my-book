# P4 re-judge v4 — blind judge bundle (2026-07-27)

You are re-judging persona **P4** (overnight/batch power user) of the wmb-pub bulletproof-QA campaign.

## Baseline (prior verdict)
`evidence/judging/P4-REJUDGE-V3-AGGREGATE.md` (workflow wf_64037713-2be, 2026-07-21): **6.0 unanimous**, floor D10 6.0 + D8/D3b/D9 6.0. D-96/D-97/D-98/NEW-2/D-20 all CLOSED live browser-rendered under one-worker proof. Registered then: D-120..D-126 (`evidence/fix-reviews/D-120-D-126-p4-rejudge-v3.md`).

## Since then (spot-check all commits with git show; read the fix-review docs)
- **D-120 FIXED `e73dc51`:** batch LIST route served stored stale rows (queued/$0.00 mid-run) while the D-96-fixed detail route derived truth. Fix: shared pure module `src/lib/batch/live-batch-view.ts` (isBatchTerminal / deriveLiveBatchFields) used by BOTH routes — they can no longer diverge; terminal rows verbatim; spend floored by stored value; zero extra queries for all-terminal lists. In-lane: LIST route had no startedAt in its select at all (added).
- **D-122 FIXED `1d0cadd`:** overnight digest counted auto-rejected duplicate findings (7 vs 5). Fix: digest selects status, aggregates split visible vs gate-rejected; all breakdowns from visible set; discarded count NOT silently dropped — notification now reads "5 findings (2 discarded as invalid)"; all-rejected run reads "0 findings (N discarded as invalid)". Doc: `evidence/fix-reviews/D-120-D-122-batch-list-digest-counts.md` (+6 tests; suite green).
- **Product-wide context landed since v3** (judge as you see fit): discuss surface now streams (`eeb1fd8` first-text-gate SSE) and is billed (`e75996e`); setup-surface truth overhaul (`6233c44`/`921cb90`); D-157 parser hardening (`d625d51`). Suite 1551/1551 at `eeb1fd8`.

## Still open / disclosed (do not treat as hidden)
- **D-121** (anchor whitespace on hard-wrapped prose — Apply probe never exercised), **D-123 S3** (halted-digest 0-findings inverse-D-97 unprobed), **D-124** (mixed halt signals ~13s), **D-125** (cap input min=$1), **D-126** (7→2→0 variance dedupe hypothesis — NOTE: the D-159/D-107 near-dup family has since been live-corroborated on two other personas' books).
- D-120/D-122 closures are SOURCE+TEST evidence only — no fresh live batch run this cycle. Absent evidence caps.
- BATCH-SPEC.md:397 still shows the pre-fix unfiltered digest query in an illustrative snippet (in-lane finding, left as a doc trap).

## Your job
Score all P4 baseline dims 1-10 (0.5 steps) AS EVIDENCED NOW (source truth + prior live evidence + what is still unprobed). Overall = floor-bound MIN. Name floor dim + driver, note any defects the fix-review docs missed, and the single next action that most raises the floor. Next free defect number **D-186** — do not renumber existing.
