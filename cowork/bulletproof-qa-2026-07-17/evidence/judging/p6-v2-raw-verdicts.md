# P6 "Owen" re-judge v2 — raw blind verdicts (3-judge Fable panel, 2026-07-27)

## Judge A — Overall 6.5 (UP from 6.0), floor D4 (D5 co-floor 6.5)
Dims: D1 7.0 / D2 7.0 / D3 7.0 / D4 6.5 FLOOR / D5 6.5 co-floor / D7 7.0 / D8 7.5 / D10 8.0 / D11 7.5.
- Evidence authenticated: 48169ec, dc912fa real+in-scope; D-43 fix 3159d78 verified (resolveConductorModelForWorkflow, 6 RED tests, honest 400-no-key).
- D4 driver: D-35 closed on camera BUT walk was Skip-only (no substantive step in UI), no time-to-first-word, post-setup screen re-solicits setup.
- 41e GET setupComplete:true = doc-log assertion, no committed 07-26 trace; accepted reduced weight via 07-20 p0-honesty.json entries 10/11.
- New pixel defects: (1) S4 progress-counter contradiction 2/6 vs 0/2 vs 2/5 (D-152 class, sidebar 0/2 stale post-completion); (2) S4 post-completion setup nag — 3 competing CTAs incl "Start Setup" after setupComplete=true; (3) 41c mid-hydration frame (generic breadcrumb, skeleton) — "clean overview" claim rests on partial load, 41e cleaner; (4) S4 "1 chapters" x2; (5) S4 FAB occludes chapters Action column 41e (D-139 family); (6) 41d opus row below fold (evidentiary only, trace corroborates).
- Next action: "Capture My Writing Style" from wizard ON CAMERA, streamed progress timed, scratch book (attacks D4+D5 both; doubles as D-40 re-test; keep fingerprint probe untouched).

## Judge B — Overall 6.5 (UP from 6.0), floor D3/D5 tie @6.5
Dims: D1 7.0 / D2 7.0 / D3 6.5 / D4 7.0 (UP from 6.0, floor CLEARED) / D5 6.5 FLOOR / D7 7.0 (UP 6.5) / D8 7.5 / D10 8.0 / D11 7.5.
- Commits verified: 48169ec RED-pre-fix tests; dc912fa strict writes; 3159d78 D-43 conductor-primary-role + honest 400. p0-honesty.json corroborates 41e setupComplete PATCH-then-GET; 01b36e1 shipped no fresh trace (small evidentiary discount, disclosed).
- D4 cleared decisively BUT capped 7.0: import leg unexercised, no time-to-first-word, e2e-header identity not real funnel, UI never tells writer setup complete.
- D5 principal floor: zero P6 stream/latency evidence ever + baseline 157.2s blocking synchronous discuss POST (dead spinner) unremediated, unre-probed.
- New pixel defects: (1) S4 "1 chapters" x2; (2) 41c mid-hydration not settled "clean overview"; (3) S4 setup completion never acknowledged — "Getting Started 0/2" pixel-identical pre/post wizard, 41c nags Start Setup after completion; (4) 41d opus row below fold — by-model claim rests on aggregates; (5) Ghost Text 664 in / 4.0K out anomaly — output 6x input, possible column swap or pre-fix reasoning tokens, 1 DB read rules out; (6) minor 2/6 badge vs checked Done rail.
- Next action: P6 editorial loop ON CAMERA — live discuss/line-edit stream cadence + latency with modelEditor: anthropic/opus set (proves D-43 live + moves D5; if still dead spinner, finding names fix = stream the discuss turn).

## Judge C — Overall 6.5 (UP from 6.0), floor 6.5 plateau D3/D4/D5 (D4 nominal)
Dims: D1 7.0 / D2 7.0 / D3 6.5 / D4 6.5 (UP 6.0) / D5 6.5 / D7 7.0 (UP 6.5) / D8 7.5 / D10 8.0 / D11 7.5.
- Deepest verification: read overview-banner source (src/app/(app)/books/[bookId]/page.tsx:467-499) — banner renders ONLY when setupComplete false; 41e shows NO banner = independent in-pixel corroboration setupComplete=true live at render, beyond disclosed circularity. D-35 closure holds.
- KEY EVIDENCE-INTEGRITY CATCH: 41c mislabeled "post-setup" — it SHOWS the Start Setup banner, which source only renders when setupComplete=false; 41c is pre-setup or stale render (generic breadcrumb, missing book-nav, Memory skeleton). "Clean overview" claim proven by 41e, not 41c.
- D4 driver: time-to-first-word never timed; "Start Writing!" lands on overview NOT Chapter 1 editor (extra locate+Edit hop, S3); import path unexercised.
- 41d verified internally consistent: Coach 17 sessions $10.63 1.3M in/115.2K out; 21+13=34 sessions; 119.3K ≈ 115.2K+4K; consistent with p0-honesty $10.21/$0.375 grown since.
- New defects: (1) 41c mislabel (evidence-integrity); (2) S3 setup completion no visible affordance — sidebar 0/2 unchanged, Setup never checked, Next Step badge persists; (3) S4 2/6 vs 2/5 count inconsistency; (4) S3 Start Writing lands overview not editor; (5) S4 Ghost Text 664 in/4.0K out — 166 input tok/session implausibly low, possible rollup input undercount; (6) opus row below fold; Export label glyph-clipped 900px.
- Next action: timed on-camera leg Done step > Start Writing > open Chapter 1 > type first words, wall-clock + latency, plus visible setup-complete affordance — attacks D3+D4+D5 at once, likely 7.0.
