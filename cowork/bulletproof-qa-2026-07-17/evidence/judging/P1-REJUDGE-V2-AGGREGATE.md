# P1 "Maya" re-judge v2 — AGGREGATE (3-judge blind Fable panel, 2026-07-27)

## Verdict: **6.0 (A 6.0 / B 6.5 / C 6.0) — UNCHANGED from baseline; floor RELOCATED, not lifted**

| Dim | A | B | C | Median |
|---|---|---|---|---|
| D1 | 7.5 | 7.0 | 7.0 | **7.0** |
| D2 | 8.0 | 8.0 | 7.5 | **8.0** |
| D3 | 6.5 | 6.5 | 6.5 | **6.5** |
| D3b | 6.0 | 6.5 | 6.0 | **6.0 FLOOR** |
| D5 | 6.5 | 6.5 | 6.5 | **6.5** |
| D7 | 7.5 | 6.5 | 7.0 | **7.0** |
| D8 | 7.5 | 7.5 | 7.5 | **7.5** |
| D9 | 6.5 | 6.5 | 7.0 | **6.5** |
| D10 | 7.0 | 7.0 | 7.0 | **7.0** |
| D11 | 6.5 | 7.0 | 7.0 | **7.0** |

## Floor: D3b @6.0, driver **D-157** (3/3 judges) — REMEMBER control-block leak + silent constraint drop, 2/3 live turns
- All 3 judges confirm old floor drivers CLOSED in pixels: D-104 (3 turns 0 blank + rendered card + honest cap), D-107 (cluster exactly 3 across rerun), D-113 (stale header gone).
- All 3 independently source-verified the mechanism: `src/lib/editorial/discuss-prompt.ts:91` exact-`>>>` regex; 2-bracket emission bypasses parser into display prose while "I'll remember" promise silently no-ops.
- Judge C names the pattern: P4-v2 "flat despite closed defects" — same-severity sibling on the same surface re-pins the floor. Judge B alone scored 6.5 by weighting partial mitigation (dismissed-lineage suppression still guards the passage).
- Collateral: D9 median down 7.5→6.5 (memory write-side fails), D11 capped ("learns from rejections" half fails live, undetected failure state).

## NEW defects registered (D-160..D-163 taken by P6 v2 panel)
- **D-164 (S4, 3/3):** report severity tables render collapsed to run-on text in document viewer, BOTH report formats ("SeverityCountCritical0Important0Suggestion1Total1").
- **D-165 (S3-if-real, 3/3):** dashboard Last-30-Days chart paints ZERO data while y-axis autoscales to 419 and heatmap shows the same series; capture doc "populated chart" claim contradicted by pixels. Possible headless-animation artifact (D-136 precedent) — needs one settle-delay re-shot before code blame.
- **D-166 (S4, 3/3, D-152 family):** "Member for 0 days" vs 10-DAY certificate + 2d-writing tile on same page; suspect e2e-shim Clerk-profile-absent createdAt=now artifact — 1 confirming frame needed.
- **D-167 (S4, A+C):** library shows two dev-edit reports with naming drift ("DEV EDIT REPORT" v1 vs "DEV_EDIT_REPORT" v4 — internal type-name leaks as title) and v4 shows "6d ago" though rewritten today (createdAt not updatedAt).
- **D-168 (S4, A+B):** "Unlocked: Garamond!" gamification toast fires on passive overview load and occludes Editorial Findings panel.
- Observation-grade (not registered): "Running · 0k tok · 3m ago" session frame (D-96 family rhyme, single ambiguous frame); turn-2 restates turn-1 within hard 3-cap; "Untitled" chapter row; B's 784-vs-704 suspicion REFUTED by A's full-zoom check (704 consistent everywhere).
- **Next free: D-169.**

## Next-action consensus (3/3 identical): FIX D-157
Tolerant REMEMBER/END delimiter parsing (accept >=2 closing brackets / line-anchored prefix) + belt-and-braces post-parse sweep: strip any unparsed control-shaped block from display prose, persist when verb recognizable. Then ONE live discuss turn on camera showing clean chip + WriterMemory row landing. Single parser fix lifts D3b + D7/D9 docks + D11 cap; projected P1 6.5.

Raw verdicts: `p1-v2-raw-verdicts.md`. Bundle: `p1-v2-judge-bundle.md`. Prior: HELD-REJUDGE-AGGREGATE.md P1 6.0.
