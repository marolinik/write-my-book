# P1 "Maya" re-judge v3 — blind judge bundle (2026-07-27)

You are re-judging persona **P1 "Maya"** (discuss/memory-loop literary writer) after a fix+capture cycle targeting the v2 floor.

## Baseline (prior verdict)
`evidence/judging/P1-REJUDGE-V2-AGGREGATE.md` — **6.0**, floor **D3b @6.0, driver D-157** (REMEMBER control-block leak + silent constraint drop, 2/3 live turns). Dim medians: D1 7.0 / D2 8.0 / D3 6.5 / D3b 6.0 / D5 6.5 / D7 7.0 / D8 7.5 / D9 6.5 / D10 7.0 / D11 7.0. Raw verdicts: `p1-v2-raw-verdicts.md`.

## Since then (all on camera or in source — spot-check every commit with git show)
- **D-157 FIXED `d625d51`** (tolerant 2-4-bracket delimiters + unparsed-block strip sweep + fallback guard, +15 tests) and **CLOSED ON CAMERA** — 43-series in `evidence/p1-maya-rejudge/` (43a clean chip live turn; 43b WriterMemory row via psql + API; 43c the REAL stored 07-26 drifted bytes now render clean).
- **D-169 FIXED `1ce1c6b`** (in-thread controls no longer navigate out; scope wider than registered), **D-170 FIXED `b484615`** (dismiss persists exactly the constraint the chip promised — shared selector, parity-asserted), **D-172 FIXED `e75996e`** (discuss turns billed at settle; live row on camera 45d/46e).
- **Discuss turns now STREAM** — `eeb1fd8` first-text-gate SSE (+38 tests) + 46-series capture: Server-Timing ttft 19.3/25.4/36.1s, token cadence 32ms median, settle tail 279-984ms, mid-stream no-leak tripwire 0 violations with real REVISION/REMEMBER blocks stored, cap 409 pre-stream 57ms, abort = all-or-nothing (0 rows, thread virgin).

## Disclosed and still open (do not treat as hidden)
- **D-176 (S3, new):** 19-36s static "The editor is replying…" with no elapsed signal — provider reasoning phase; honest wall replaced the 61.6s blind wall but the dominant term stands. **D-177/D-178 (S4):** settle re-cover flash 50-189ms; composer keeps sent text during turn.
- Open from v2: D-158 (report prose word-count), D-159 (semantic near-dup), D-164 (collapsed report tables), D-165 (empty 30d chart, unre-probed), D-166/167/168, **D-171 (S3: WriterMemoryPanel has zero mount sites — writer cannot view/revoke stored constraints)**.
- Abort loses provider spend invisibly (~$0.004, disclosed); mid-turn disconnect now loses the turn by design (honest all-or-nothing — semantic change, named).

## Your job
Score every baseline dim 1-10 (0.5 steps) AS EVIDENCED NOW (code truth + camera truth; absent evidence caps; disclosed warts are honest but still warts). Overall = floor-bound MIN. Name floor dim + driver, list new defects you see in pixels that the docs missed (next free number D-179 — do not renumber), and the single next action that most raises the floor.
