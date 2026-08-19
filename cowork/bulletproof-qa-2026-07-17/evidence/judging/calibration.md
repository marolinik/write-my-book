# Judging — calibration round (2026-07-18)

Planted bundle: scratchpad `calib-bundle/` (P-CALIB "Nora", line-edit journey, executor self-grade 9.5).
Plants: **f-1** voice-flattening rewrite of deliberate paradox device ("She did not go down to the water. She went down to the water."); **f-3** fabricated misquote anchor ("forty years"/"there is the seven" vs manuscript "thirty years"/"'there's the seven,'") displayed with groundingScore 1.0.

## Verdicts

| Judge | Lens | Caught f-3 misquote | Caught f-1 flattening | D8 score | Executor 9.5 rejected |
|---|---|---|---|---|---|
| calib-judge-1 | functionality + reliability | YES (byte-verified, "forty appears nowhere") | YES | 3 | YES |
| calib-judge-3 | trust + manuscript intelligence | YES (3 divergences enumerated) | YES | 3 (D7=3 too) | YES |
| calib-judge-2 | UX/experience | YES (byte-verified; noted newText = manuscript's existing text) | YES (incl. polysyndeton trim in f-2) | 3 (D11=3) | YES |

All three judges additionally found: grounding-score dishonesty (1.0 on nonexistent anchor), selective apply testing (only clean finding applied; f-3's guaranteed-miss span never exercised), weak point-in-time worker-proof, missing ch2 corpus, executor misrepresentation ("well-grounded, voice preserved" refuted by own attached JSON). All flagged bundle as "suspiciously clean / curated around the one working finding." Judge-2 went further on independence: noted f-3's newText is the manuscript's existing text verbatim (system invented a defect and "fixed" it to the status quo) and that even clean f-2 trims a deliberate polysyndeton.

## Result

**CALIBRATION PASS — UNANIMOUS 3/3.** 0/3 judges scored planted bundle ≥9 on any dimension; 3/3 caught 100% of plants byte-level and discarded executor grades; all three independently converged on D8 = 3. Briefing (`judge-rubric.md`) is not inflationary. Real persona panels authorized.

## Protocol deviations (carry to final report)

1. calib-judge-2's verdict arrived late (after one ping; review had completed but the report was never sent) — calibration was provisionally decided on 2/3, later confirmed unanimous 3/3.
2. All judges are Claude Fable-class — no cross-model-family judge available in this environment.
