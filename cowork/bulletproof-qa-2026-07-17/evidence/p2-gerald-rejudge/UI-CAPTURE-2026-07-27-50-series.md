# P2 (Gerald) — UI capture 2026-07-27, 50-series

Live capture of the four Lane-C fixes on the running build. Lane C shipped with the
review note *"Nothing in this lane was verified in a browser."* — this series supplies
the missing pixels and the matching database rows.

**Honest-capture rule in force:** one retry maximum per shot. Everything that failed or
could not be reached is disclosed below, including one shot whose retry came back worse
than the first run. Nothing here is re-run-until-green.

## Environment

| | |
|---|---|
| Dev server | `http://localhost:3001` (Next 16, Turbopack), verified up before shooting |
| Database | container `wmb-pub-postgres-1`, database `writemybook` |
| Identity | e2e headers `x-e2e-test-secret` + `x-e2e-clerk-id: user_qa_p2`; `.env` untouched (`DEV_CLERK_ID` left at its resting value) |
| Persona book | `90436e20-ffc7-42ca-a39f-dc7d48cdda10` (Gerald's 8-chapter manuscript) |
| Scratch book | `df2269b0-0d86-41f7-8a28-7d3a86cfa2d5` (`QA-50C-1785159389897`), created in-shot; no persona fixture was mutated by 50b/50c |
| Lane C fixes under test | `60b83b5`, `673d8fa`, `7b8e60e`, `f13e8ba` |
| Scripts | `scripts/shot50a.ts`, `shot50b.ts`, `shot50c.ts`, `shot50d.ts` |
| Harness note | every in-page snippet is a raw source string (esbuild `keepNames` rewrites arrows into `__name(...)`, which throws inside the page) |

`scripts/qa-seed-personas.ts` was **not** run at any point.

## Verdicts

| Shot | Defect | Verdict | One-line reason |
|---|---|---|---|
| 50a | D-188 declared-document artifact contract | **PASS** | RECOVERY branch fired, in pixels and in three DB tables |
| 50b | D-190 / D-115 orphan-chapter guard | **PASS** | 6/6 flags, sentinel never resurrected, phantom 409 gone |
| 50c | D-194 chapter count | **PASS** | dashboard tile 25 -> 26, delta exactly +1 |
| 50d | D-189 whole-word find/replace | **PARTIAL** | default-ON and disabled-with-reason witnessed; match counts not witnessed |

---

## 50a — D-188: the agent may no longer claim a document it never wrote

**What it proves.** Pre-fix this book held two `create-story-bible` sessions stamped
`completed` (05:38 and 05:43) and **zero** `STORY_BIBLE` rows: the product told Gerald it
had written a document that did not exist. The fix adds a two-stage contract — RECOVERY
(>=300 words + >=2 headings in the transcript, `wroteNothing`) then HONESTY (a claim with
no artifact fails the session out loud).

**How it was driven.** The wizard's own Story Bible step, "Create Story Bible" clicked in
the browser. `POST /agent` was teed to record status and latency. No API shortcut.

**Which branch fired: `RECOVERY`.** Captured, not inferred — the probe read the phrase off
the rendered page and the screenshot shows it:

> "Saved your Story Bible as a document — the assistant wrote it into the chat but never
> saved it, so the product persisted it for you. You can find it in this book's documents."

**Measured.**

| | |
|---|---|
| Run wall time | **81 s** (agent POST 200) |
| Session | `e574113b`, status `completed`, 29 243 in / 2 013 out tokens, **$0.013165** |
| Usage row | `71a1d995`, `key_source = user` (BYOK), model `openrouter-qwen36/sonnet` |
| Document | `dd0cc514-a7ae-454e-b12a-c366f21d9d92`, type `STORY_BIBLE`, created `13:29:21.581` |
| Version | `version = 1`, `change_source = transcript-recovery`, `word_count = 777` |

`version = 1` shows the recovery overwrote nothing; `change_source` is exactly the audit
value the fix specifies; 777 words clears the 300-word deliverable floor.

**Artifacts.** `shots/50a-assertions.json`, `50a1-bible-step-before.png`,
`50a2-agent-running.png`, `50a3-artifact-verdict.png`, `50a4-contract-message-closeup.png`.

**Honest notes.**

1. The hardened prompt did **not** stop the miss. The agent again wrote the bible into the
   chat instead of calling `WriteDocument`; the net caught it. D-188 is closed because the
   product stopped lying, not because the agent stopped forgetting.
2. The **HONEST-FAILURE branch was not exercised** — no run in this series produced a claim
   with no recoverable transcript. That half of the contract remains source-verified only.
3. Page errors contained `Clerk: Failed to load Clerk ... clerk.example.test` — expected
   under the header persona bypass, not a product error.
4. The panel estimated "~3-8 min" against an 81 s run: another instance of **D-180**
   estimator drift.
5. Probe selector miss: `statusComplete` read `false` on every sample while the page tail
   read "Create Story Bible completed". Harness, not product.

**New finding from reading what was actually saved — see D-201.** The recovered document is
847 words, 8 headings, 8 question marks; it opens *"Welcome. I'm your Writing Coach, and
I'll be building the story bible for P2-CAPTURE-D8-1785129390."* and ends *"Take your time —
this bible will be the reference document for everything that follows"*, having just asked
the writer five clarifying questions. It is the coach's opening interview turn, persisted as
the deliverable.

---

## 50b — D-190 / D-115: deleted chapter prose stays deleted

**What it proves.** Before the fix, a chapter document outlived its chapter row (documents
carry no `chapterId`), so a new chapter created in the same act/number slot inherited the
dead prose, and the first save came back as a phantom 409 whose `serverContent` handed the
deleted text back to the writer.

**How it was driven.** Six steps on the scratch book: PUT sentinel prose -> DELETE the
chapter -> POST a new chapter at the freed number -> GET content -> render the editor ->
type and let the editor's own autosave fire -> reload. All `/content` calls teed.

**Measured.** Sentinel `ORPHAN-SENTINEL-1785159663088`, new chapter `b57acf4c`.

| Assertion | Result |
|---|---|
| `withheldOnGet` | true — GET returned `{"markdown":"","wordCount":0}` |
| `blankInPixels` | true — editor 0 chars, sentinel absent from the entire DOM |
| `firstSaveNot409` | true — PUT statuses `[200, 200]` (pre-fix: 409) |
| `noServerContentLeak` | true — no response body contained the sentinel |
| `sentinelGoneAfterSave` | true |
| `freshProsePersisted` | true — survived a full reload |

Version ladder on the reclaimed document: **v1** user 23 w, **v2** `orphan-reclaim` 6 w,
**v3** user 14 w. The reclaim is stamped and auditable rather than silent.

**Artifacts.** `shots/50b-assertions.json`, `50b1-new-chapter-empty.png` (shows
"Start writing your chapter…", a `Fresh Start` badge and `0 words`),
`50b2-after-typing-saved.png`, `50b3-after-reload-persisted.png`.

This also closes **D-115** (deleted-chapter resurrection), open since the 07-21 wave.

---

## 50c — D-194: a new book counts its own first chapter exactly once

**What it proves.** `POST /api/books` created the write-first placeholder Chapter 1 but left
`books.chapter_count` at 0, so every book started one short and every later delta rode the
wrong base.

**Surface choice matters.** Book cards and the setup wizard read a live `_count` and
therefore never showed the drift. The dashboard "Total chapters" tile reads the **stored**
column (`_sum.chapterCount`) — it is the only writer-facing surface where the bug was
visible, so that is where it was shot. The tile was located by its own card text, not by
index.

**Measured.** Tile **25 -> 26** across a book created through the real `/books/new` form,
`deltaIsExactlyOne: true`, tile rect identical before and after. DB agrees:
`chapter_count = 1` against exactly one `chapters` row (`2bcfdb75`), 0 documents — no
phantom extra chapter.

**Artifacts.** `shots/50c-assertions.json`, `50c1-dashboard-before.png`,
`50c2-new-book-form.png`, `50c3-after-create.png`, `50c4-dashboard-after.png`,
`50c5-total-chapters-tile.png` (clipped tile reading **26**).

---

## 50d — D-189: Unicode-aware whole word — **PARTIAL**

**Witnessed (PASS).**

- **A. Default ON.** `raw.opened.wholeWordChecked: true` on first open, with the toggle
  enabled — `50d1-dialog-default-toggle-on.png`.
- **D. Non-word term disables the toggle and says why.** For the query `"— "`:
  `wholeWordDisabled: true`, `wholeWordChecked: false`, `reasonShown: true`, text verbatim
  *"Whole word needs a search term that starts and ends with a letter, digit or underscore —
  it is off for this one."* — `50d6-nonword-toggle-disabled.png`,
  `50d7-disabled-reason-closeup.png`. The character in that sentence is a real em dash
  (source bytes `M-bM-^@M-^T` = U+2014 at `find-replace-dialog.tsx:237`); a `?` in a JSON
  dump is a cp1252 terminal artifact. **D-182 intact.**

**Not witnessed (INCONCLUSIVE).** Every match count in the banked run is `null`; the preview
panel read *"Type at least 2 characters to preview matches."* for all six queries. So
`B.onFewer: false` and `C.unicodeAware: false` in `50d-assertions.json` are **probe nulls,
not product failures** — a judge must not read them as regressions.

**Correction to the earlier adjudication.** That document explains the nulls as *"the search
term never reached the input."* The banked JSON rules that out:

- `find-replace-dialog.tsx:75` — `const wholeWordApplies = find.trim().length === 0 || isWordLikeQuery(find);`
  derives from the **`find`** state.
- `find-replace-dialog.tsx:132` — `const showPreview = debouncedFind.trim().length >= 2;`
  derives from the **`debouncedFind`** state (300 ms debounce, line 68).

In the banked run `wholeWordApplies` flipped only at the dash query (`wholeWordDisabled`
goes `false ... false -> true`), and `scopeBook` moved `"This chapter" -> "Whole book"`.
Both require React state updates and re-renders. So the text *did* reach the input and the
component *did* re-render; what never advanced was `debouncedFind` — the 300 ms timer's
state commit — across roughly 40 s and six queries. The prescription is therefore not
"re-target the input"; it is to investigate why the debounce commit stalls. Registered as
**D-202**.

**Retry disclosure.** The single permitted retry produced this weaker artifact set and
overwrote run 1. Run 1 of the same build previewed correctly (console-observed, not banked:
`Zürich` whole-word ON = 176 matches in 8 chapters). Per the honest-capture rule there was
no second retry.

**Corroboration on a different surface** (captured via Node against
`/api/books/:id/search`, UTF-8 clean — `curl` mangles the umlaut and returns 0 both ways):

| query | whole word ON | whole word OFF |
|---|---|---|
| `old` | 1 | 277 |
| `Zürich` | 176 | 176 |
| `ürich` (mid-word fragment) | **0** | 176 |
| `Marseille` | 170 | 170 |
| `arseille` (mid-word fragment) | **0** | 170 |

`ürich` matching 0 with whole word ON is the exact Unicode discrimination D-189 is about: an
ASCII `\w` rule would treat `ü` as a boundary and match the fragment. The server-side rule is
**captured**; the same rule surfacing in the dialog preview is **inferred** (shared module
`src/lib/search/find-replace.ts`, `WORD_CHAR = /[\p{L}\p{N}_]/u`), not witnessed in this run.

**Verdict.** D-189 PARTIAL: default and disabled-with-reason closed in pixels; the count
behaviour proven on the API, not in the dialog. One re-shot with a human keystroke would
finish it.

**Artifacts.** `shots/50d-assertions.json`, `50d1` … `50d7`.

---

## New defects registered from this series

| ID | Sev | Summary |
|---|---|---|
| D-201 | S3 | Transcript recovery persisted the coach's opening **interview turn** as the STORY_BIBLE artifact; `hasStoryBible` is existence-only (`book-health.ts:206`), so it silently satisfies the downstream gate. No review or undo affordance. |
| D-202 | S4 | Find & Replace preview can stay on "Type at least 2 characters" while the input holds a longer term — `debouncedFind` stalls while `find`-derived state keeps re-rendering. Observed once; run 1 of the same build was fine. |

(D-199 and D-200 were taken by the orchestrator's DB cross-check in
`ADJUDICATION-2026-07-27-50-series.md`. Next free defect: **D-203**.)

## What was NOT reached

- D-188's **HONEST-FAILURE** branch (session `failed` + error in pixels) — no run produced a
  claim without a recoverable transcript.
- D-189 **match counts inside the dialog** — see above.
- No `git push` was performed; commits are local, per campaign rule.
