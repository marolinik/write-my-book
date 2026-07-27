# 50-series adjudication — P2's four Lane-C fixes, witnessed

Orchestrator adjudication of the 50-series captures (`shots/50[abcd]-assertions.json`),
cross-checked against the dev database independently of the capture harness.
Lane C fix commits: `60b83b5` / `673d8fa` / `7b8e60e` / `f13e8ba`.

Context that made this necessary: the Lane C fix-review states plainly
*"Nothing in this lane was verified in a browser."* Under campaign law an endorsed but
unwitnessed fix does not move an experience dimension — P4 v4 re-proved that by holding at
6.0 on exactly this pattern. So P2 needed capture, not judges.

## D-188 — agent claims a document it never wrote: **CLOSED, three independent witnesses**

`50a`, book `90436e20`, 81s run, agent POST 200 (`sessionId e574113b`).

The run took the **`RECOVERY`** branch: the agent again wrote the Story Bible into the chat
instead of calling `WriteDocument`, and `artifact-contract.ts` caught it and said so:

> "Saved your Story Bible as a document — the assistant wrote it into the chat but never
> saved it, so the product persisted it for you. You can find it in this book's documents."

Independent DB confirmation (not from the harness):

| table | evidence |
|---|---|
| `documents` | `STORY_BIBLE` / `.planning/STORY-BIBLE.md`, created `13:29:21.581` — 4s before the probe snapshot |
| `document_versions` | `change_source = transcript-recovery`, `word_count = 777`, `version = 1` |

777 words clears the contract's >=300-word deliverable threshold, `version = 1` shows it
overwrote nothing, and the change_source is the exact audit value the fix specifies.

**Important honest note for judges:** the hardened prompt did **not** prevent the miss on
this run. The agent still failed to call the tool; the safety net caught it and disclosed.
The defect is closed because the product no longer lies, not because the agent stopped
forgetting.

## D-190 + D-115 — orphaned chapter content: **CLOSED**

`50b`, sentinel `ORPHAN-SENTINEL-1785159663088`. Full lifecycle: write 23 sentinel words ->
delete the chapter -> create a new chapter in the same act/number slot -> read -> type -> reload.

All six verdicts true: `withheldOnGet`, `blankInPixels`, `firstSaveNot409`,
`noServerContentLeak`, `sentinelGoneAfterSave`, `freshProsePersisted`. GET returned
`{"markdown":"","wordCount":0}`, the editor rendered `0 words` with the sentinel absent from
the whole DOM, the first PUT returned **200 rather than the old phantom 409**, and the
reclaimed document (`a54828ad`) carried the fresh prose through a reload.

This also closes **D-115** (deleted-chapter resurrection), open since the 07-21 wave.

## D-194 — chapter count: **CLOSED**

`50c`. Creating one book moved the Total Chapters tile 25 -> 26, `deltaIsExactlyOne: true`,
tile rect identical before and after. The auto-created placeholder chapter is counted once.
DB agrees: `chapter_count = 1` against one `chapters` row.

## D-189 — whole-word find/replace: **PARTIAL**

PASS: `A_defaultOn: true` (defaults on), and for a non-word term the toggle auto-disables
with an honest reason — `D.toggleDisabled: true`, `D.reasonShown: true`,
"Whole word needs a search term that starts and ends with a letter, digit or underscore —
it is off for this one."

NOT WITNESSED: every match-count probe is `null` and every raw probe still reads
`previewHeader: "Type at least 2 characters to preview matches."`, i.e. the search term
never reached the input and the live preview never ran. So `B.onFewer: false` and
`C.unicodeAware: false` are **null-probe artifacts, not product failures** — do not read
them as regressions. The unicode-aware `wholeWord` behaviour, which is the substance of
D-189, remains source-verified only. Needs a re-shot with the term input correctly targeted.

Encoding note: the `?` seen mid-sentence in the reason text when dumping the JSON through a
cp1252 terminal is a display artifact. Source bytes at
`src/components/editor/find-replace-dialog.tsx:237` are `M-bM-^@M-^T` = U+2014 em dash.
D-182 is intact.

## New defects found while cross-checking

Two defects surfaced from the DB checks rather than the pixels — both are registered
separately and both are unfixed:

- **D-199** (S3) — `document-service.ts:64` hardcodes `changeType: "manual_edit"` in
  `create()`, so the recovered Story Bible, the agent's fingerprint and 8 imported chapters
  all badge as **"Manual"** in Version History. See `fix-reviews/D-199-provenance-mislabel.md`.
- **D-200** (S2) — chapter DELETE reconciles `chapterCount` but never `wordCount`, so the
  23 deleted sentinel words are stuck in `books.word_count` forever (37 stored vs 14 real).
  Inflates Total Words, novel-equivalent, milestone unlocks and the shareable progress card.
  See `fix-reviews/D-200-deleted-chapter-words-stick.md`.

Both continue the campaign's standing pattern: the floors are live-moment honesty and
observability gaps, not feature gaps.

## Harness disclosures

- `pageErrors` in 50a contains `Clerk: Failed to load Clerk ... clerk.example.test` — expected
  under the e2e-header persona bypass, not a product error.
- 50a showed `~3-8 min` estimated against an actual 81s run, another instance of D-180
  estimator drift; and `statusComplete: false` on every probe while the tail reads
  "Create Story Bible completed", which is a probe-selector miss.
