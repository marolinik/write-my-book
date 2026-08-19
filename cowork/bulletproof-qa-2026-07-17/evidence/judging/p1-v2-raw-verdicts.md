# P1 "Maya" re-judge v2 — raw blind verdicts (3-judge Fable panel, 2026-07-27)

## Judge A — Overall 6.0 UNCHANGED, floor D3b, driver D-157
Dims: D1 7.5 / D2 8.0 / D3 6.5 / D3b 6.0 FLOOR / D5 6.5 / D7 7.5 / D8 7.5 / D9 6.5 (DOWN 7.5) / D10 7.0 / D11 6.5 (DOWN 7.0).
- Commits PASS: 2d715ee (assistantBubbleText fallback + latestRevision guard, 10/10 tests); cfe622a (NFC+whitespace-normalized anchorQuote+category suppression, 237-line test file; header-scoped stampReportMetadata — D-158 prose residual is BY DESIGN of header-only fix).
- Source-verified D-157 regex: discuss-prompt.ts:91 `^<<<REMEMBER(\s+category="[^"]*")?>>>$` exact->>>-anchored; leaked >> blocks verbatim in pixels 2/3 turns.
- Floor NOT moved, RELOCATED within D3b: old drivers closed (alone = ~7.0) but D-157 = new same-family S2 on same surface, 2/3 live frequency; D9 down (write side silently dropped 2/3 constraints), D11 down (undetected failure state, writer never told).
- Full-res check: word count consistent 704 everywhere (tile/table/dashboard/heatmap 2x352).
- New pixel defects: (1) S4 report markdown tables collapse to run-on text BOTH reports ("SeverityCountCategoryCritical0..."); (2) dashboard Last-30-Days chart paints ZERO data, y-axis autoscaled 419 — possible headless-animation artifact (D-136 precedent), needs settle-delay re-shot, S3 if real; (3) S4 "Member for 0 days" vs 10-day certificate same page (D-152 family); (4) session status "Running" 3m ago possibly stale — verify timing before filing; (5) S4 library dup naming "DEV EDIT REPORT" vs "DEV_EDIT_REPORT" + v4 shows "6d ago" though rewritten today (createdAt not updatedAt); (6) Garamond toast on passive load occludes findings panel.
- Next action: FIX D-157 (tolerant delimiter >=2 brackets + post-parse strip sweep + persist on recognizable verb) + re-shoot 1 turn w/ chip + WriterMemory row. Lifts D3b/D9/D11; moves P1 to 6.5.

## Judge B — Overall 6.5 (UP from 6.0), floor D7, driver D-157
Dims: D1 7.0 / D2 8.0 / D3 6.5 / D3b 6.5 (UP 6.0) / D5 6.5 / D7 6.5 FLOOR (DOWN 7.5) / D8 7.5 / D9 6.5 (DOWN 7.5) / D10 7.0 / D11 7.0.
- Same commit + source verification (discuss-prompt.ts:91 exact >>> anchor confirmed).
- D3b lifted (old floor drivers gone on camera) but D7 dropped: D-157 silently drops writer's stated preference while displaying raw syntax, S2, 2/3 turns; fresh report still asserts ~570 words for 704-word chapter.
- 42e "populated 30-day chart" = mild capture-doc over-claim — chart grid empty.
- New pixel defects (overlap A): flattened report tables; empty 30-day chart despite in-window data (D-152 family); "Member for 0 days" vs 10-day cert; chapters table possibly 784 vs 704 card (needs zoom re-verify — NOTE judge A zoomed, found 704=704, treat A as authoritative); dup report naming + 6d-ago timestamp; Garamond toast occlusion; turn-2 restates turn-1 (1 of 3 capped exchanges wasted); "Untitled" chapter row.
- Partial mitigation keeping 6.5 not 6.0: dismissed-lineage suppression still guards the passage.
- Next action: same D-157 fix prescription; after close, floor moves to cheap D9 metric-contradiction cluster.

## Judge C — Overall 6.0 UNCHANGED, floor D3b, driver D-157
Dims: D1 7.0 / D2 7.5 / D3 6.5 / D3b 6.0 FLOOR / D5 6.5 / D7 7.0 / D8 7.5 / D9 7.0 / D10 7.0 / D11 7.0.
- Same commit + source verification (discuss-prompt.ts:91 exact >>> regex; 2-bracket emission falls through to prose, as pixels show).
- "The wave genuinely closed all three prior floor drivers in pixels... but a same-severity sibling on the same surface re-pins the floor at 6.0 — the P4-v2 'flat despite closed defects' pattern. Failure mode migrated from silent-blank to noisy-leak-plus-silent-loss; that is not a floor lift."
- D2 7.5: 40-min outage handled honest (10->11 exact, same doc id rewritten); docked — writer intent is data, silently discarded twice.
- New pixel defects (converge w/ A+B): collapsed severity tables both reports; empty 30-day chart w/ axis 419 (crop-verified; capture doc "populated" claim WRONG); "Member for 0 days" (possible e2e-shim createdAt=now artifact, needs 1 confirming frame); dup report naming drift; "Running · 0k tok · 3m ago" single ambiguous frame (D-96 family rhyme, observation-grade).
- Next action: identical D-157 prescription (tolerant delimiter + strip sweep + persist) + chip AND WriterMemory row on camera; clears D3b floor + D7 dock + D11 cap.
