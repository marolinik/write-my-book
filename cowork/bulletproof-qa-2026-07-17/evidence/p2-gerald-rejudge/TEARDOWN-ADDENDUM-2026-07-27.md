# Competitive teardown — ADDENDUM, 2026-07-27

**Scope:** corrections to `evidence/competitive-teardown.md` (dated 2026-07-17).
**Why an addendum and not an edit:** all three baseline judges filed the original as an
S3 **doc-accuracy** defect because it asserted, as *product gaps*, four things the same
evidence bundle disproved. Editing the original in place would destroy the audit trail
that produced that finding. The original stands; this file supersedes it on the four
points below, each with a citation a judge can re-derive.

Build under test: branch `qa/bulletproof-2026-07-17`, HEAD `108fec3`.
Author: P2 44-series UI capture wave. Persona: `user_qa_p2` ("Gerald").

---

## 1. "No find & replace (chapter or book-wide)… impossible today" — **FALSE**

Find & Replace exists, is keyboard-reachable, and works book-wide.

* UI: `src/components/editor/find-replace-dialog.tsx`, opened with **Ctrl+Shift+F**
  (`src/components/editor/editor-toolbar.tsx:400`). Scope switch **This chapter /
  Whole book**, a **Case sensitive** switch, a live debounced match preview with
  per-chapter counts and highlighted snippets, and **Replace all**.
* API: `POST /api/books/:id/search/replace` — 4,617 replacements, 29/29 byte-exact at
  the 07-18 baseline (`evidence/p2-gerald/journey-log.md`).
* Captured live this wave: **shot 44k1** (dialog, book-wide, 16 matches in 2 chapters),
  **44k2** (Replace all), **44k3** (prose after), assertions
  `screenshots/44k-findreplace-assertions.json`.

**But the teardown's underlying worry was right for a different reason.** The dialog has
**no whole-word option** (`dialog_offers_whole_word_option: false`). Renaming a character
`Sam` → `Max` book-wide — Gerald's single most common structural edit — produced **17
`Max` occurrences where only 6 were wanted**: `same`→`Maxe` (×8), `sample`→`Maxple`,
`samples`→`Maxples`, `samovar`→`Maxovar`. See §"NEW defects" in
`UI-CAPTURE-2026-07-27.md`. So: *the feature is not missing; its safest mode is.*

## 2. "Chapter reorder broken (404)" — **FALSE**

`PATCH /api/books/:id/chapters/reorder` exists
(`src/app/api/books/[id]/chapters/reorder/route.ts`) and returned 200 in the baseline
bundle. Not re-shot in this wave (declared uncaptured, see the capture doc's
§"Dims and surfaces explicitly NOT captured").

## 3. "Live model-identity dishonesty — the Coach force-runs on `${provider}/sonnet`
regardless of the writer's choice" — **FIXED**

`3159d78 fix(llm): conductor resolves on workflow primary-agent role (D-43)`. The
conductor now resolves the model from the workflow's primary-agent role instead of
hard-coding a sonnet-class model.

**Honest residual, do not let this addendum overstate it:** model *substitution* is still
undisclosed at the point of use. In this wave, Gerald's account default is
`openrouter-qwen36/sonnet`, and both quick-assist calls were actually served by
`openrouter-deepseek/haiku` (`usage_records`, 05:08 and 05:11 rows). That reroute is the
intended behaviour of `d51514c` (reasoning models are unfit for quick assist), and it is
the reason Gerald's first AI touch is now a 200 with real prose instead of the 07-20 502
— but nothing in the editor tells the writer which model wrote the suggestion. That is
registered open as **D-127** (P5) / **D-148** (substitution names no model at point of
use). It is a disclosure gap, not a routing bug, and it is not closed.

## 4. "AuthorshipTracker always reports 100% human" — **FIXED**

`src/lib/editor/authorship.ts` now exports `hasTrackedAuthorship(stats)` and
`src/components/editor/authorship-tracker.tsx:49` returns early when it is false — the
readout renders only when genuine provenance has been recorded, instead of manufacturing
a flattering 100%.

---

## What the teardown still gets right (unchanged)

* **BYOK is a moat for professionals and a wall for beginners.** Re-confirmed this wave
  from the other side: the cold funnel (shots 44g-44j) shows the product *does* offer a
  key-free on-ramp ("Skip for now — start writing free"), but a key-free account has no
  working AI. That is the standing founder call (**D-155**, managed no-key tier), not a
  capture finding.
* The data-safety posture is the differentiator, and it is now evidenced rather than
  asserted — see `44a`-`44c2` (two-tab conflict + recoverable backup), `44e`
  (17/17 offline zero-loss unit net), `44i3` (import byte-fidelity 8/8, delta 0 chars).
