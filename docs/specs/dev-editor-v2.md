# Developmental editor v2: whole-book revision

Status: SHIPPED 2026-10-09 (A 821087c, B ea37a91+0614003, C b8ca451, D this commit). Approved 2026-10-08: draft-then-apply, cap 7, commercial lens as a run toggle.

## Why

The owner wants the developmental editor to read the whole book and propose real revisions: reordering, merging and splitting chapters, cutting and expanding them, pacing, hooks, and a commercial ("bestseller") reading. Today `restructure` (O12) does only reorder, renumber, merge and split.

## Baseline: live run on 2026-10-08

Setup: copy of "Legat - Zavet" (40 ch, 64.8k words), qwen3.8-flash-next, session 6f5a0931.

What works:
- Reasoning is evidence-based: dates from the text, word counts against the median.
- Deliberate choices are protected (ch. 14, 34, the 36–40 finale).
- The chat summary holds 6 coherent moves in a sensible order.

Defects:

| # | Defect | Cause |
|---|--------|-------|
| B1 | 36 pending moves in the panel; the chat talks about 6 | The orchestrator delegated to story-architect 3 times, each pass filed anew, and nothing caps a pass |
| B2 | merge [24,25] filed 5 times | Dedup compares the whole payload, including the model-written `title` |
| B3 | "Backup option, only if you reject X" filed as an independent move | No notion of alternatives or dependencies; the writer can accept both |
| B4 | 11.0M input tokens for one pass | 3 delegations, each re-reading chapters; no cheap whole-book metrics |
| B5 | Later moves carry `confidence: null` | Optional field, and the prompt does not insist |
| B6 | Moves from older passes stay pending forever beside new ones | Nothing retires a superseded pass |

## Design

### Phase A: one pass, one coherent proposal (fixes B1–B6)

- **Pass = session.** Moves already carry `sessionId`. When a new restructure session files its first move, every still-pending move from older sessions becomes `superseded` (a new status, shown in history, never applied).
- **Cap of 7 live moves per pass.** The 8th `ProposeStructureMove` is refused with the list of what is already filed. A new tool, `WithdrawStructureMove`, lets the architect replace a weaker move.
- **Dedup by identity:** kind + chapter ids + target position + anchor. Never the title.
- **Alternatives:** an optional `alternativeTo` (the id of another move in the same pass). The UI nests the alternative under its primary. Accepting one marks its siblings `superseded`.
- **Tool feedback:** every Propose result returns the pass so far ("3/7 filed: …"). The orchestrator prompt says to delegate once and to report exactly the filed moves.
- **`confidence` required** in the tool schema.

### Phase B: trim and expand (new move kinds)

- `trim`: chapter id, target word count, and what to cut (quoted passages, scenes, repetitions).
- `expand`: chapter id, target word count, and what is missing (a beat, a scene, a transition), with evidence.
- These are not mechanical. Accepting one creates a **draft**: the ghostwriter model rewrites the chapter with fingerprint + story bible + the move's instructions, reusing the Polish Scene guards (budget per script, truncated or reasoning-only output refused). New status `drafted`; the draft is stored on the move.
- The writer sees a before/after comparison and chooses **Apply** or **Discard**. Apply writes through the versioned DocumentService, the snapshot goes to `previousState`, and Undo works as for split.

### Phase C: whole-book pacing and hooks

- **Deterministic metrics in code** (`src/lib/structure/book-metrics.ts`), per chapter: words, scenes (scene-break markers), dialogue share, mean sentence length, mean paragraph length, the opening line, the closing paragraph, and the timeline position from the existing tension parse when an ANALYSIS_REPORT exists.
- A new tool, `BookMap`, gives the architect that table plus the opening and closing ~120 words of every chapter, so it reads the whole book's shape cheaply and calls ReadChapter only for suspects (addresses B4).
- **Hooks:** the architect rates each chapter's opening and ending (0–3: none / soft / question / cliffhanger) inside the pass. A weak hook at a key point becomes a `hook` move (scope: opening or ending). It follows the same draft/apply path as trim and expand, but rewrites only the first or last scene.
- **Book map in the UI:** one row per chapter showing length bar, dialogue share, tension (if analysed) and hook marks, with each chapter's pending moves pinned to it.

### Phase D: commercial lens

- An optional toggle on the run: "Read it as a genre reader would."
- Checks are computed from the metrics (story-percentage positions): inciting incident by ~10–15%, midpoint near 50%, sagging middle (a run of low-tension chapters), share of chapters ending on a hook, chapter length against genre norms.
- The model maps the beats from ARCHITECTURE and uses MARKET_REPORT (genre, comps) when it exists.
- Output: a "Commercial reading" section in STRUCTURE_PROPOSAL. Moves it motivates are tagged `lens: "commercial"`, and they count inside the same cap of 7. It is advice, never a rewrite on its own.

### UI: one logical place

- **Reports › Structure becomes "Dev editor"**, top to bottom:
  1. The book map.
  2. The current pass: at most 7 cards, grouped Structure / Pacing (trim, expand) / Hooks, in the recommended order, with alternatives nested.
  3. History.
- Card actions by kind:
  - Structural kinds keep Accept (applies now), Reject and Undo.
  - Rewrite kinds get "Make a draft" → comparison → Apply / Discard, then Undo.
  - Reason and evidence are folded open on request.
- The agent panel shows the same cards in compact form, so the chat and the panel agree by construction (both list the pass).
- The dev board card says "N proposals in this pass" and links to the Dev editor tab.

## Order and gates

A → B → C → D, one commit per green step, tests first.

Before C ships, re-run on a fresh copy of Zavet to measure moves ≤7, no duplicates, and input tokens (target: under 3M).

## Not in scope

- Automatic application of anything.
- Inferred writer patterns (owner rule).
- Series-level restructure.
