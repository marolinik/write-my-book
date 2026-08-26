# P1 (Maya) — 47-series UI capture, 2026-07-27

Adjudicated by team lead from the banked assertion JSONs + PNGs. The capture agent
never wrote its narrative; every claim below is read straight off the artifacts named.

Persona `user_qa_p1` via e2e headers. Book `4116055c-6183-4675-926a-e04f31126951`,
finding `e8418788-bd31-452b-ab93-0de3e77ea105`. Lane-A build (`391a165` + `a163f11`).

## 47a — D-176 wait chrome + ttft agreement + D-177 settle. PASS
`47a-assertions.json`, `47a1-wait-2s/10s/25s.png`, `47a2-wait-phase-flip.png`, `47a3-first-prose.png`, `47a5-settled.png`

- **Counter climbs unbroken 0s..48s** (`counterSeries`, 49 samples). Never stalls, never resets.
- **Phase flip at 8122ms**: "The editor is replying…" -> "The editor is still thinking…".
- **Three distinct hints**, escalating honestly:
  1. `Thinking before the first word.`
  2. `This editor reasons before it writes — the first words usually land 20–40s in.`
  3. `Longer than usual. You can cancel and keep your turn — nothing is saved until a reply arri…`
- **ttft 48738ms** (`Server-Timing: ttft;dur=48738`) vs counter reading `48s` at first prose:
  `headerVsCounterDeltaMs 738`, `agreeWithin1s true`. The client counter does not lie about the wall.
- **Settle tail 605ms** after last text frame (`settledAtMs 49905`). The old 4.4s dead-zone did not manifest.
- **D-177 clean**: `preSettledCount 0`, `finalSettledCount 1`, `violationsCoexisting []`,
  `waitingLineAfterProse []`. No re-cover flash, no double-render.
- Composer disabled + emptied during the turn, restored after. Settle affordances carry an honest
  tooltip while disabled: `Waiting for the editor's reply — cancel the turn to decide now`.
- `rawSyntaxViolations []` — no REMEMBER/REVISION control syntax leaked mid-stream (D-157 holds).
- Revision card present at settle; `chip null` on this turn (no memory emitted), `capNotice false`.

**48.7s is the slowest ttft measured to date** (prior band 19–36s). See D-196: the hint promises
20–40s and this turn exceeded it. The escalation hint fired, so the surface stayed honest.

## 47b — D-176 Cancel is real. PASS
`47b-assertions.json`, `47b1..47b4*.png`

Cancel clicked at 9454ms (counter reading `8s`):
- `fetchRejection {name: "AbortError"}`, POST `net::ERR_ABORTED`, `sseFramesBeforeCancel 0`.
- Notice: **`Turn cancelled — nothing was saved, and none of your 3 exchanges were used.`**
- `liveBubbleAfterCancel false`.
- **Composer text restored verbatim** (D-178) — the full 107-char message is back in the box, enabled.
- `threadState`: userTurns 0->0, replies 0->0, `canDiscussAfter true`. Thread virgin, quota untouched.

All-or-nothing holds through the UI Cancel path, not just programmatic abort.

## 47c/47d — D-183 one-source disable + D-185 card anchoring. PASS
`47cd-assertions.json`, `47c0..47c2*.png`, `47d-two-turn-thread*.png`

- ttft 12175ms, counter `12s`, `agreeWithin1s true`.
- **D-183**: before turn all five affordances enabled; in-turn (`5s`) `Use it` / `Keep as-is` /
  `Apply` / `Dismiss` **all disabled from one source**; after settle all re-enabled
  (`samplerAllDisabledWhileLive true`, `samplerAnyStillDisabledAfterSettle false`).
  `Hide` deliberately stays enabled (disclosed design choice). `Cancel` appears only in-turn,
  tooltip `Cancelling stops the reply — nothing is saved and none of your 3 exchanges are used.`
- **D-185**: `threadOrder` = writer, assistant, **revision-card (index 2)**, writer, assistant.
  `precededByAssistant true`, `laterTurnBelow true`, `danglingColonCandidates []`.
  The card stays welded to the turn that emitted it even with a later exchange below it.

## 47e — D-171 WriterMemory panel mounted + revoke lands. PASS
`47e-assertions.json`, `47e1..47e4*.png`

- Panel **mounted on `/settings`** (`panelMountedOnSettings true`), header `Writer Memory / 3 total / 3 AI-learned`,
  with the honest disclosure `These preferences are injected into every AI agent session.`
- 3 real rows, each with a Forget button **visible without hover** (`revokeReachableWithoutHover true`).
- Revoked `bc68fab0` -> `DELETE 200`, row gone from API and panel in **1221ms**, toast `Memory removed`,
  count drops 3 -> 2, **self-updated with no reload**, and still gone after reload.
- **D-184 demonstrated live**: rows `d6ae40cc` and `bc68fab0` are semantically the same constraint
  ("do not flag Imogen's interior abstraction at emotional peaks as a show-tell lapse") stored twice.
  The panel makes them hand-prunable, which is the disclosed partial mitigation — dedup is still absent.

## 47f/47g — D-165 RESOLVED as an animation artifact; D-166 confirmed; NEW D-195
`47f-assertions.json`, `47g-assertions.json`, `47f1..47f4*.png`, `47g1..47g3*.png`

- API has data: `totalWords 704`, `nonZeroDays [{2026-07-16, 380}, {2026-07-17, 324}]`, `maxDayWords 380`.
- **D-165 was recharts' enter animation, not missing data.** 47f sampled mid-animation
  (`maxBarHeightPx 117` at 8s, `235.8` at 13s, `stableAcrossSettle false`); 47g sampled the growth
  curve directly: heights `[]` at 1520ms, then `[235.8, 201.1]` at 3038ms and **identical at 4567/6086/7599ms**.
  Bars reach full height and hold. Axis labels render (`Jun 28 … Jul 27`, `0/150/300/419`).
  **D-165 CLOSED as a D-136-family harness/timing artifact.**
- **D-166 confirmed on-frame**: `Member for 0 days · 0.7K words · keep going!` on an account with
  30 days of history and a `bestStreak 2` — `daysWritingTile null`, `certificateDays null`.
- **NEW D-195**: every bar carries `fill="hsl(var(--primary))"` and computes to **`rgb(0, 0, 0)`
  in BOTH light and dark** (`barsLight`, `barsDark`). `47g3-chart-dark-mode.png` shows pure-black
  bars on the near-black dark panel — Maya's streak chart is all but invisible in dark mode.
- **NEW D-198**: `warm-stats` took **9924ms**, dashboard page 3203ms, overview 5785ms on first hit.

## Honest limitations
- Clerk script fails to load in the harness (`failed_to_load_clerk_js`) on every shot — expected under
  e2e-header identity, no bearing on the assertions.
- 47a's chip was null, so the REMEMBER-at-settle path is proven by 48a (P6), not here.
