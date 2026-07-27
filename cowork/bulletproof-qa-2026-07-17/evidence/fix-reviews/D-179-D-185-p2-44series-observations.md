# Register — D-179 … D-185 (P2 Gerald, 44-series UI capture wave)

**Source:** `evidence/p2-gerald-rejudge/UI-CAPTURE-2026-07-27.md` §7
**Build:** `qa/bulletproof-2026-07-17` @ `108fec3` · **Captured:** 2026-07-27, `user_qa_p2`
via e2e headers on `http://localhost:3001`, worker-proof `RUNTIME_WORKER_COUNT = 1` (PASS).
**Nothing in this file is fixed.** This is an evidence wave; every entry below is OPEN.
**Previous free id: D-179. Next free id after this file: D-186.**
No existing defect id was renumbered or reused.

---

## D-179 — S2 — `create-story-bible` reports success and persists nothing, silently blocking the whole editorial pipeline

**Persona:** P2 (found), affects every persona that imports a manuscript.
**Dims:** D8 (blocks it entirely), D7 (failure states lie), D2 (paid work discarded).

**Symptom.** On a book with a valid style fingerprint, `POST /api/books/:id/agent`
`{workflowId:"create-story-bible"}` returns 200, streams a complete Story Bible into the
chat, and terminates with:

```
type: "complete"
metadata.success       = true
metadata.endReason     = "natural"
metadata.documentIds   = []            <-- nothing was written
metadata.resultMeta    = { findingsCreated: 0, statusAdvanced: false }
metadata.suggestedNext = ["build-architecture"]
```

The assistant text ends, verbatim: *"**Story Bible Status:** Complete and ready for
reference."* The tool stream contains only `ReadAllChapters`, `ReadDocument`,
`ListDocuments` — **`WriteDocument` is never called**. No `STORY_BIBLE` row is created.

**Consequence chain (all observed in one session):**
1. `build-architecture` → **422** `Prerequisites not met: "Story Bible needed before designing architecture"` — the step the product itself just recommended.
2. `dev-edit` → **422** `Setup incomplete`, `redirectTo /books/:id/setup`. The gate at
   `src/app/api/books/[id]/agent/route.ts:113-137` requires FINGERPRINT **and**
   STORY_BIBLE **and** ARCHITECTURE documents to all exist.
3. Net: on a freshly imported manuscript, **no editorial pass is reachable at all**, and
   the writer is told everything succeeded at each step.

**Reproduced 2/2** (65.5 s run and 152.2 s run, 0 errors both times), on book
`90436e20-ffc7-42ca-a39f-dc7d48cdda10` (`P2-CAPTURE-D8-*`, 8 chapters / 42,229 words,
imported clean).

**Billing.** Both runs are billed to the writer's own key. The three setup sessions in this
wave cost **$0.070234** (`writing-coach` on `openrouter-qwen36/sonnet`, 148,752 in /
11,600 out) — 98% of the wave's total spend — for one persisted artifact
(the fingerprint) out of three attempted.

**Evidence.**
`evidence/p2-gerald-rejudge/screenshots/44n0b-story-bible-sse.jsonl`,
`44n0b2-story-bible-retry-sse.jsonl` (the retry),
`44n0c-architecture-start.json` (the 422 it causes),
`44n-devedit-start.json` (the 422 it causes),
`44n0-capture-style-sse.jsonl` (the contrast case — same conductor **does** call
`WriteDocument` and does persist a document).

**Why S2.** It is not data loss, but it is a hard block on the product's claimed
differentiator, presented to the writer as success, and it consumes real money each time
the writer retries. Contrast case in the same book proves the write path exists and works
for `capture-style`, so this is a workflow-specific defect, not infrastructure.

**Fix direction (not implemented).** Either (a) make the conductor's completion contract
assert that a category-`setup` workflow produced its declared document type and fail the
session loudly when it did not, or (b) have `create-story-bible` write the document itself
rather than relying on the model to elect to call `WriteDocument`. Option (a) generalises:
`resultMeta` already carries `statusAdvanced: false`, which the product currently ignores.

---

## D-180 — S2 — Find & Replace has no whole-word option; a book-wide character rename corrupts prose and reports the corruptions as successes

**Persona:** P2 (core job: renaming characters across a finished manuscript).
**Dims:** D1, D3, D2 (silent prose corruption at scale), D11 (both incumbents ship the toggle).

**Symptom.** `src/components/editor/find-replace-dialog.tsx` (Ctrl+Shift+F) offers scope
(This chapter / Whole book) and a **Case sensitive** switch. It does **not** offer a
whole-word option — asserted from the rendered dialog:
`dialog_offers_whole_word_option: false`. Matching is documented in the dialog itself as
"plain text — no wildcards or regular expressions", i.e. raw substring.

**Measured, on camera** (two-chapter fixture where `Sam` is a character and
`same`/`sample`/`samples`/`samovar` are ordinary words):

| | |
|---|---|
| wanted (whole-word `Sam`) | **6** |
| `Max` occurrences after Replace all | **17** |
| collateral word corruptions | **11** |
| corrupted forms observed | `Maxe` (×8, from "same"), `Maxple`, `Maxples`, `Maxovar` |

Sample of the resulting prose: *"Maxe smile every time — Maxe tilt… He weighed the Maxple
in his palm… The Maxovar hissed."*

There is no preview of *which* matches sit inside larger words (the live preview shows
counts and snippets but does not distinguish), and no undo affordance in the dialog.

**Field corroboration (disclosed as campaign residue, not spontaneous corruption).** The
same mechanism already ran at manuscript scale against the campaign's own P2 fixture: the
deliberate 07-18 book-wide drill replaced "the" and left **4,617** `[[REPLACED]]` markers
across all 8 chapters of `Dead Reckoning 31 QA P2` — 614 in chapter 1 alone — including
`them` → `[[REPLACED]]m` and `together` → `toge[[REPLACED]]r`. Visible on camera in
`44p1-ghost-text-on-gerald-model.png`.

**Evidence.** `44k1-find-replace-dialog-bookwide.png`, `44k2-replace-all-result.png`,
`44k3-prose-after-rename.png`, `44k-findreplace-assertions.json` (fixture book
`bf60f7a0-6f66-4058-aa6b-1c1a036065e2`).

**Relationship to existing entries.** The trust judge filed this *class* at the 07-18
baseline as an S3 documentation-level observation from a trace artifact. This is the first
time it has been driven through the product's own UI and quantified. Filed as a new,
higher-severity product defect rather than folded into the doc-level note.

**Fix direction (not implemented).** Add a whole-word toggle to the dialog and a
`wholeWord` flag through `POST /api/books/:id/search/replace`; word-boundary matching must
be unicode-aware (the fixture is full of `Zürich`/`Łódź`/`Kőszeg`). A "N of M matches are
inside longer words" warning in the preview would be the cheap partial mitigation.

---

## D-181 — S3 — D-115's browser variant is *silent*: no phantom 409, the deleted prose is adopted on first save

**Persona:** P2. **Dims:** D2, D7. **Rides the D-115 / D-22 fix lane — do not fix separately.**

**Symptom.** The registered D-115 repro (`p2-gerald-rejudge/api-traces/25-orphan-resurrect.txt`)
ends in a phantom **409** whose `serverContent` leaks the deleted text. Driven through the
real editor, that 409 **does not occur**: the editor loads the orphan `CHAPTER_CONTENT`
document *and its version*, so its first stamped save is valid, returns **200**, and the
deleted prose becomes a permanent part of the brand-new chapter.

**Observed, end to end, in one book (`P2-CAPTURE-D115-1785126801417`):**
* `DELETE /chapters/:id` → 200 `{"deleted":true}`; `GET` that chapter → 404.
* `/books/:id/chapters/new` auto-defaults `chapterNumber` to **2**, the number just freed.
* The new chapter opens showing the deleted prose (sentinel `GHOST_SECRET_9f3a`) under a
  "**Fresh Start**" badge, footer "16 words".
* Same moment over the API: **`wordCount: 0`** with a **106-character non-empty body**
  containing the sentinel — the `wordCount`-vs-body inconsistency named in the D-115 entry.
* Writer types one sentence → autosave **200** (no conflict chip within 45 s). Final state:
  `version 3`, `wordCount 23`, markdown = deleted sentence **+** the new sentence.

**Why this matters more than the 409.** A 409 is at least an interruption the writer can
investigate. The browser path produces no signal at all: deleted words silently re-enter
the manuscript and its version history, and will be exported.

**Evidence.** `44q1-new-chapter-form-defaults-to-freed-number.png`,
`44q2-brand-new-chapter-full-of-deleted-prose.png`,
`44q3-first-save-silently-adopts-deleted-prose.png` (renamed from the planned
`44q3-phantom-409-…` because the planned symptom did not occur; the frame shows
"Saved 06:34 AM", 23 words, no conflict chip and no dialog), `44q-d115-assertions.json`.

---

## D-182 — S3 — Version History cannot identify the conflict backup the dialog promises

**Persona:** P2. **Dims:** D10, D7, D2.

**Symptom.** `SaveConflictDialog` promises, verbatim: *"Whichever you choose, the other
version stays in version history."* `handleLoadTheirs` honours it — it writes an unguarded
backup with `changeSource: "conflict-backup"` before replacing the editor
(`src/components/editor/save-conflict-dialog.tsx:188`). But
`src/components/editor/version-history-panel.tsx` badges rows from **`changeType`**, not
`changeSource`, and `changeType` is `manual_edit` for the backup, the resolve and every
ordinary autosave alike. Captured ledger:

```
v5 manual_edit / conflict-resolve   ← badge "Manual"
v4 manual_edit / conflict-backup    ← badge "Manual"   (the writer's rescued words)
v3 manual_edit / user               ← badge "Manual"
v2 manual_edit / user               ← badge "Manual"
v1 manual_edit / user               ← badge "Manual"
```

A writer who just discarded a paragraph and wants it back has to open versions one at a
time and read them. The data-safety guarantee is real; its discoverability is not.

**Evidence.** `44c-version-history-after-load-theirs.png` (five identical "Manual" badges),
`44c2-conflict-backup-version-viewed.png` (v4 opened, discarded sentence visible),
`44a-c-assertions.json` → `versionLedger`, `44c-retry-assertions.json`.

**Fix direction (not implemented).** Badge or label rows from `changeSource` when it is one
of the conflict sources (e.g. "Conflict backup" / "Conflict resolve"), or add a one-line
subtitle. Purely presentational; no schema change (`document_versions.change_source`
already stores it).

---

## D-183 — S3 — Chapter delete has no UI affordance

**Persona:** P2 (and any writer who cuts a chapter). **Dims:** D1, D3.

**Symptom.** `useDeleteChapter` exists (`src/hooks/use-chapters.ts:127`) and the API route
works, but a repo-wide search finds **zero component consumers** — no menu item, no button,
no context action anywhere under `src/components` or `src/app`. Book deletion exists
(`books/[bookId]/settings/page.tsx`); chapter deletion does not. A writer cannot remove a
chapter without calling the API directly.

**Evidence.** Source audit recorded in `UI-CAPTURE-2026-07-27.md` §D-115; the D-115 drill
had to drive the delete over HTTP for exactly this reason.

**Note.** This is why the D-115 capture is only *partly* a "what a writer would see" story,
and that limitation is disclosed in the capture doc rather than papered over.

---

## D-184 — S4 — accepted ghost-text broke point of view (n=1)

**Persona:** P2. **Dims:** D8, D10. **Explicitly a single sample.**

**Symptom.** On a close-third passage ("He read the message twice…", "Marek set the receipt
on the table and…"), the accepted ghost suggestion was:

> "The courier was late, so **I** poured another drink and tried to remember what it felt
> like to believe in anything but the balance of a ledger."

First person, inserted mid-scene. The prose itself is idiomatic and on-register; the POV is
not. Served by `openrouter-deepseek/haiku` (see D-127/D-148 on substitution).

**Evidence.** `44p2-ghost-accepted.png`, `44p3-inline-assertions.json`
(`proseBefore` / `proseAfterAccept`).

**Status.** Recorded because P2's exit criteria include voice preservation, and flagged as
n=1 so it cannot be read as a measured voice-drift rate. A real voice assessment needs the
D8 lane, which is blocked by D-179.

---

## D-185 — S3 — `books.chapter_count` is not incremented when a chapter is created

**Persona:** all. **Dims:** D2 (data integrity), D7.

**Symptom.** `POST /api/books/:id/chapters` creates the chapter row but leaves the
denormalised `books.chapter_count` untouched. Reproduced on two fresh capture books created
this wave, and present on the campaign's canonical P2 fixture:

| book | `chapter_count` | actual chapters |
|---|---|---|
| `P2-CAPTURE-D115-1785126801417` | 1 | **2** |
| `P2-CAPTURE-FINDREPLACE-1785130046032` | 1 | **2** |
| `Dead Reckoning 31 QA P2` `636a1f02…` | 7 | **8** |
| `Dead Reckoning (book 31)` `73247017…` (imported) | 8 | 8 ✅ |
| `P2-CAPTURE-D8-1785129390` (imported) | 8 | 8 ✅ |

The import path maintains the counter correctly; the create path does not.

**Scope limitation, stated honestly:** the UI surfaces that read the denormalised column
(shelf cards, overview headers) were **not** enumerated or screenshotted in this wave. The
editor sidebar reads the live chapter list and shows the correct count. So the writer-visible
blast radius is unverified — what is verified is that the stored value is wrong.

**Evidence.** Direct SQL against `wmb-pub-postgres-1` / `writemybook`, quoted in
`UI-CAPTURE-2026-07-27.md` §7 and §8.

---

## Cross-references — registered OPEN, re-observed this wave, NOT renumbered

* **D-115 / D-22** — deleted-chapter prose resurrection. Captured in the UI (`44q1`-`44q3`);
  D-181 above is its browser-variant sibling and belongs to the same fix lane.
* **D-127 / D-148** — quick-assist model substitution is undisclosed at the point of use.
  Re-observed: account default `openrouter-qwen36/sonnet`, both quick-assist calls served by
  `openrouter-deepseek/haiku`, no in-editor indication. The reroute itself (`d51514c`) is
  working as intended and is why Gerald's 07-20 502 is now a 200.
* **D-142** — abort-unbilled. Corroborated weakly: 3 `ghost-text` SSE requests, 2 billed
  `usage_records` rows. Offered as an observation, not a proof.
* **stampless first-save** last-write-wins window — unchanged, not attacked this wave.
* **e2e-layer `offline-autosave.spec.ts`** still 0/8 BLOCKED-ENV; `c1f31b1` closed the gap
  at the unit layer only (17/17 green, re-run this wave as `44e`).
