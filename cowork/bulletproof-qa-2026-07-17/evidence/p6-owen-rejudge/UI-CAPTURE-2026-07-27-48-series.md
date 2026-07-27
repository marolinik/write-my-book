# P6 (Owen) — 48-series UI capture, 2026-07-27

Adjudicated by team lead from banked artifacts. Persona `user_qa_p6` via e2e headers.
Books `6d69fd7c…` (keeper) and `8632ba0c…` (VM1). Lane-A build (`391a165` + `a163f11`).

## 48a — D-176 wait chrome on P6's OWN surface. PASS — kills the v3 floor's evidence objection
`48a-assertions.json`, `48a0-thread-open.png`, `48a1-wait-2s/10s.png`, `48a2-wait-phase-flip.png`, `48a3-first-prose.png`, `48a4-midstream.png`, `48a5-settled.png`

P6 v3 graded 7.0 with the floor pinned on D5/D-176 **specifically because the liveness evidence was
transferred from P1's pixels**. This shot removes that objection: the same chrome is now captured on
Owen's own editorial surface, finding `0002c9e1`.

- `Server-Timing: ttft;dur=17823`, first prose in DOM at 17979ms, counter reading `17s`,
  `agreeWithin1s true`. Settled 18991ms.
- **Phase flip at 8075ms**, same two-band copy as P1. Both hints seen.
- **Token cadence is genuinely live**: 20 text frames, `medianInterTokenGapMs 12`, `streamSpanMs 224`.
- `d177 {violations: [], clean: true}`; `rawSyntaxViolations []`.
- **Chip at settle** (this is the P1-missing half): `I'll remember: "Preserve deliberate root-word
  echoes that link character action to thematic vocabulary."` — REMEMBER captured, no leak mid-stream.
- Revision card present at index 4, after a 2-turn thread. `capNotice false`, `danglingColon []`.
- ttft 17.8s here vs 48.7s on 47a the same afternoon: **the reasoning-slot wall varies ~2.7x**.

## 48b — D-139 3rd recurrence, measured. PARTIAL — one real cosmetic clip, one harness artifact
`48b-keeper-assertions.json`, `48b-vm1-assertions.json`, `48b1/48b2-{keeper,vm1}*.png`

Viewport 1280x900, same as 45a/45g. FAB at `{x1212, y832, w48, h48}` both books.
Shell `padding-bottom: 80px` present in all four measurements (the `fab-clearance.ts` fix is live).

**Real finding (NEW D-197):** on VM1 in view, Action cell row 1 sits at `y852-892` and **overlaps the
FAB by 380px²** (19x20) — `anyOverlapInView true`. The link itself is still the top element
(`topElementAtCentre "A.inline-flex.items-center"`, `selfIsOnTop true`), so it remains clickable.
Root cause: `padding-bottom` only clears the **last** row once scrolling is at rest; it cannot protect
a mid-document row that happens to sit in the FAB band (y832-880). Keeper's 5 in-view cells all read
`overlapPx 0` only because its rows are higher on screen (y366-570).

**Harness artifact, NOT a defect:** `allClickableAtBottom false` on every cell of both books co-occurs
with `overlapPx 0`, and the rects are **negative** (`y -1180`, `y -211`) — the rows scrolled *above*
the viewport, so `elementFromPoint` correctly returns null. `scrollHeight === clientHeight`
(3307/3307, 1915/1915) confirms MAIN is not the scroller; the window scrolled instead.
Filed to the D-136 family. Any future D-139 probe must use `scrollIntoView` + an unclamped hit-test.
`allActionTextsFullAtBottom true` in both books — no text truncation anywhere.

## 48c — D-181 / D-182 PASS in pixels; D-180 captured as-is. Assertion JSON UNUSABLE
`48c-assertions.json` (DOM half void), `48c-billing-full.png`, `48c1-spend-card.png`, `48c2-estimate-banner-as-is.png`, `48c3-usage-by-model-fold.png`

**Honest disclosure:** the DOM scrape failed — `copy: null` and all eight `verdict.*` flags `false`,
including `spendHeadlinePresent false`. Those flags are a **selector failure, not a product failure**;
`48c1-spend-card.png` shows every element the flags deny. Adjudicated from the screenshot instead.
Second D-136-family harness fault in this wave.

From `48c1-spend-card.png`:
- **D-181 FIXED in pixels**: headline **`Your AI Spend — Your Keys`**, description
  `What you paid your AI providers directly, at their rates`, then `Total spent (last 30 days)` /
  **`$12.48`** / `Paid with your own keys — no platform markup applied` / badge `100% Your Keys`.
  The amount carries its own label, the no-markup claim is about the *rate*, and the old
  spend-as-savings framing is gone.
- `$12.48` matches `usageApi.total.costEstimate 12.4805738…` exactly. Panel is faithful.
- **D-182 PASS**: real em dashes in `BYOK — Bring Your Own Key`, `Your AI Spend — Your Keys`,
  `Paid with your own keys — no platform markup applied`.
- **D-180 still open, captured as-is** (not in this lane): `Cost estimates may be inaccurate —
  Over the last 18 sessions, estimated costs differed from actual costs by 38%. … 30 model pricing
  discrepancies detected against provider rates.` The banner discloses drift but never explains it
  or offers a reconcile action. Founder-call item.

`usageApi` totals: 1,395,763 in / 129,341 out, 43 sessions, all `byKeySource.user`.
By model: `anthropic/opus` $12.03 (657,932/28,819), `openrouter-qwen36/sonnet` $0.426 (730,548/90,895),
`openrouter-qwen36/haiku` $0.0236, `openrouter-deepseek/haiku` $0.00007, `text-embedding-3-small` $0.0001.
The deepseek row is the D-127 substitution still visible in the ledger — honest, still unlabelled at point of use.
