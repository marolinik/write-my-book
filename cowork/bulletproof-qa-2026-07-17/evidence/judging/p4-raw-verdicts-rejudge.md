# P4 "Priya" — 3 raw blind verdicts (2026-07-20)

Preserved for audit. Aggregate: `P4-REJUDGE-AGGREGATE.md`.

## Headlines
| Lens | Headline | Floor |
|---|---|---|
| func + reliability | 3.5 | D5 3.5 |
| UX + experience | 4.0 | D5 4.0 |
| trust + safety (money) | 5.0 | D5 5.0 |

## Per-dimension (func / exp / trust)
D1 6.0/7.0/7.0 · D2 7.0/7.5/7.5 · D3 5.0/4.5/6.0 · D3b 5.0/5.5/NO-EV · D4 NO-EV · D5 **3.5/4.0/5.0** · D6 NO-EV · D7 7.0/7.5/7.5 · D8 NO-EV/5.0/NO-EV · D9 NO-EV/5.5/6.0 · D10 NO-EV/5.0/NO-EV · D11 5.5/6.5/6.5

## Load-bearing agreements (all 3, byte-level re-derived)
- **Four-way spend agreement CONFIRMED:** healthy 0.04786332; cap-halt 0.15510135 — BatchRun.spentUsd = digest.spentUsd = DB actualCostUsd sum = notification string; agreement JSON is script-computed from independent HTTP+Prisma reads, not hand-asserted. No terminal surface shows $0.00 while money was spent.
- **Budget-cap halt HONEST (not S1):** over-cap child skipped, `actualCostUsd:null`, never billed; skip-guard fires at dispatch; ch1 completed post-halt was admitted pre-halt (in-flight drain, disclosed). Trust judge: rubric's S1 test passes.
- **Worker-proof VALID** (one leaf PID 58460, double-captured) → measurements not void. **Secrets: PASS** (bundle-wide grep clean).
- **D-17 unit lock GREEN** with the Redis-down path exercised in-test; Gate-4 lock 5/5.

## Defect union
- **D-20** chapter-create raw 500 — CONFIRMED OPEN by all 3 (now fixed this session).
- **D-96** (NEW-1 + judge corollaries): `counts.running` always 0 (100+ polls both batches), batch `status:"queued"`/`halted:false` while children terminal, `startedAt:null`, live `spentUsd:$0` until finalization. Terminal exact → stale aggregation not fabrication; trust judge: S2 if a UI renders mid-run spend.
- **D-97** (suspected, all 3): digest credits 2 findings to a SKIPPED chapter; 43 vs 11 on identical input; per-chapter counts strictly superset prior run → possible cumulative-in-range counting sold as this-run output.
- **D-98** (func-new): halted batch notification titled "Overnight batch complete", halt absent from human string.
- **NEW-B** (trust): cap-overshoot bound misdocumented ("at most one per-child cost" vs observed ≈ concurrency × per-session-max); no mid-flight cancel on halt.
- **NEW-2** (S4): sub-cent cap → "$0.00 cap" via toFixed(2).
- **J-4** (S3): transient child failure, no retry — waking to an unedited chapter.

## "Suspiciously clean?" consensus
Not clean — preserves raw 500, failed child, 77× overshoot, ~9-min queue stalls, float noise, self-filed defects; agreement script-computed. Missing: any UI render proof (D-96 user-facing severity unpinnable), live Redis-outage digest (unit-only, disclosed), cancel-mid-run, worker-crash recovery, concurrent-batch collision, scale test (3×151-word chapters vs the persona's 30-chapter shape), finding CONTENT.
