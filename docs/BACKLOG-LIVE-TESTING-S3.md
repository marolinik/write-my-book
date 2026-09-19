# Live-testing backlog — S3, 2026-09-18

Second live pass, the owner writing in the product against the local fleet
(`user_marko`, DeepSeek V4.1 Flash) on the real Legat trilogy. Items are listed
in the order he reported them and are fixed in that order.

Status legend: **DONE** (fixed + verified), **OPEN**, **PARTIAL**.

| # | What | Status |
|---|---|---|
| S3-1 | `/books` died on a client hook | **DONE** — D-206, commit `4371e35` |
| S3-2 | Library groups do not follow the flow; "Other" is a dumping ground | **DONE** |
| S3-3 | The library surface is still hardcoded English | **DONE** — `8696f88` |
| S3-4 | Board said "in progress" while waiting on the writer; no way to reach the panel | **DONE** |
| S3-5 | Re-running `restructure` stacks duplicate proposals | **DONE** |
| S3-6 | Undo threw on a unique constraint; two paths destroyed prose | **DONE** |
| S3-7 | Board showed "done" when nothing was adopted; panel was all dead cards | **DONE** |
| S3-8 | A proposal travelled by chapter number, so accepting one broke the others | **DONE** |
| S3-9 | Agent panel header overflowed on a long step label | **DONE** |
| S3-10 | Reports tabs showed "No content available" over reports that existed | **DONE** — `4453e5b` |
| S3-11 | Continuity counts contradicted the header; Cyrillic dates; horizontal scroll | **DONE** — `eb15fd6` |
| S3-12 | Marketing kit sat in the writing panel; sprint timer wired to nothing | **DONE** — `a8995cc`, `87735d3` |
| S3-13 | Agent panel could not be docked on Lektura or in the editor | **DONE** — `c235027` |
| S3-14 | "All chapters" ran one chapter; chapter selector overlapped the buttons | **DONE** — `c64e4b9` |
| S3-15 | Series documents were not clickable; volumes printed the series title | **DONE** — `10fa007` |
| S3-16 | Batch editorial dialog was English end to end | **DONE** — `95d4148` |
| S3-17 | Series had no Continuity, Structure or Market of its own | **DONE** — `7af634d` |
| S3-18 | Reports are dead ends — a finished pass proposes nothing | **DONE** — `9616347`, `fecdfb2` |
| S3-19 | Only structural moves are decidable inline; other reports are not | **DONE** — `15bc186` |
| S3-20 | Series documents are concatenations, not synthesis (O2 reopened) | **DONE** — `50bb0b1`; composer was already fixed, the owner's documents predate it and are now flagged for regeneration |
| S3-21 | Style page: English chrome, colliding labels, overflowing chips | **DONE** — `fd9b51a` |
| S3-22 | Continuity domain cards could never fill | **DONE** — `156e333` |
| S3-23 | Editorial vocabulary printed as raw database slugs | **DONE** — `53c76fb` |
| S3-24 | Serbian counted in two forms: "3 knjiga" | **DONE** — `8696f88` |
| S3-25 | Shelf card subtitle assembled in English | **DONE** — `8696f88` |
| D-204 | Applied move printed the engine's English record | **DONE** — `8696f88` |
| D-205 | Undo recomputed the word count instead of restoring it | **DONE** — `e25317f` |

---

## S3-1 — /books threw for every writer (DONE)

**D-206.** The i18n sweep gave the shelf card's `PrimaryCta` a `useLanguage()`
call. The book list is server rendered and that is a client hook, so the page
died inside its error boundary — "Nešto je pošlo naopako", no hint of a cause,
at request time rather than build time.

Fixed in `4371e35`: the strings travel as props from `books/page.tsx`, which
already resolves the dictionary with `getUIStrings`. Two English leftovers in
the same component were translated on the way through (continue-to-chapter,
"Review feedback"). `tests/unit/client-hook-boundary.test.ts` guards the class
of mistake by walking the import graph out from every server entry, stopping at
the first `"use client"` module.

---

## S3-2 — the library groups do not follow the flow (DONE)

> "redosled grupisanja artifakata bi idealno bio kao u flow u od početka do
> kraja... ovako je malo konfuzno, ovo other.. i sl..."

`DOC_GROUPS` in `src/components/book/documents-library.tsx` names five groups —
Setup, Chapters, Editorial, Analysis & Reports, Other — and lists the types each
one owns. Anything it does not list falls through to **Other**:

```ts
const unknownDocs = filteredDocs.filter((d) => !allDocTypes.has(d.type));
if (unknownDocs.length > 0) {
  const otherGroup = grouped.find((g) => g.key === "other");
  if (otherGroup) otherGroup.docs.push(...unknownDocs);
}
```

Four real document types are missing from every group, so the writer finds them
under a gear icon labelled "Other":

| Type | Where it comes from | Where it lands today |
|---|---|---|
| `SYNOPSIS` | `write-synopsis` — the spine of the book | Other |
| `BOOK_PLAN` | `plan-chapters-from-synopsis` | Other |
| `WORLD_RESEARCH` | `research` workflows | Other |
| `TOPIC_RESEARCH` | `research` workflows | Other |

They are also missing from `DOC_TYPE_LABELS` and `DOC_TYPE_ICONS`, which is why
the synopsis card shows the raw enum name `SYNOPSIS` as its subtitle instead of
a title, with a generic file icon.

The ordering problem is separate from the missing homes. The product already
states its own order twice, and the library agrees with neither:

- `development-stages.ts` (greenfield): idea → synopsis → structure → research
  → plan → draft
- `manuscript-stages.ts` (importer): read → style → bible → architecture →
  analyze → restructure → edit

Both put **analysis before editorial** — `analyze` suggests `restructure`, which
suggests `dev-edit`, and the Razvoj board renders them 5, 6, 7 in that order.
The library puts Editorial before Analysis & Reports.

**The fix:** one spine that both boards fold into, every `DocumentType` given a
home, and "Other" kept only for a genuinely unrecognised type.

| # | Group | Types |
|---|---|---|
| 1 | Idea & voice | `CONCEPT`, `FINGERPRINT`, `STORY_BIBLE` |
| 2 | Structure | `SYNOPSIS`, `ARCHITECTURE`, `BOOK_PLAN` |
| 3 | Research | `WORLD_RESEARCH`, `TOPIC_RESEARCH` |
| 4 | Chapters | `CHAPTER_BRIEF`, `CHAPTER_PLAN`, `CHAPTER_CONTENT` |
| 5 | Analysis | `ANALYSIS_REPORT`, `CONTINUITY_REPORT`, `STRUCTURE_PROPOSAL` |
| 6 | Editorial | `DEV_EDIT_REPORT`, `LINE_EDIT_REPORT`, `BETA_READ_REPORT` |
| 7 | Publishing | `MARKET_REPORT`, `EXPORT_CONFIG` |
| 8 | Notes | `FREEWRITE` |

**Shipped.** The spine moved out of the component into
`src/lib/documents/library-groups.ts`, which is plain data plus a pure
`groupDocuments()` — no React, so it is testable directly.
`tests/unit/library-groups.test.ts` parses the `DocumentType` enum out of
`schema.prisma` and asserts every book-level value is claimed by exactly one
group, so a type added later fails the build instead of quietly reappearing
under "Other". An unrecognised type now lands in Notes: a document the writer
can still see beats one that vanishes.

The component kept only the icons and the label lookup. Its private
`DOC_TYPE_LABELS` — English-only, and it had never heard of `SYNOPSIS` — was
deleted in favour of `getDocumentTypeLabels()` in `tool-labels.ts`, which
already carried every type in all seven languages. `BOOK_PLAN` was missing
there and was added.

Verified live on *Legat - Zakletva*: Zamisao i glas → Struktura → Poglavlja →
Analiza → Redakcija, the synopsis filed under Struktura, and no "Other".

---

## S3-3 — the library surface is hardcoded English (DONE)

Visible in the same screenshot, in an otherwise Serbian app: the group headings
("Analysis & Reports", "Other"), every entry in `DOC_TYPE_LABELS` ("Continuity
Report", "Analysis Report"), and the empty-state CTAs ("Run Dev Edit", "Run
Setup Wizard", "No editorial documents yet"). The component is already a client
module holding `useLanguage()`, so this is dictionary work, not plumbing.

**Done as part of S3-2**, because the groups were being renamed anyway: the
eight group labels (new `docLibrary` dictionary section, seven languages), the
empty-state sentence, the CTA — which reuses the already-translated workflow
names from `getAgentStrings().workflows` rather than adding a string per group
— and the document type names.

**Finished in `8696f88`:** the document count (which also taught the app to
count in Serbian — see S3-24), "organised by workflow stage", the new-document
button, both empty states, the per-chapter headings, the relative timestamps
and the three library tabs. Verified live: the page has no English left on it.

Part of the O1 remainder, but it sits on a daily surface rather than on
marketing copy, so it belongs here rather than in the tail.

---

## Carried from earlier today

Found while rehearsing the structural revision pass; see
`BACKLOG-LIVE-TESTING.md` for the full write-ups.

| # | What | Severity |
|---|---|---|
| D-204 | Applied structure moves render their `resultSummary` in English | LOW |
| D-205 | Accept-then-undo drifts `book.wordCount` though the prose is byte-identical | LOW |
| — | Shelf card subtitle still English ("56.874 words · drafted 31/31 · last touched today") | LOW |
| — | "3 knjiga" should be "3 knjige" — Serbian needs a third plural form the dictionaries do not carry | LOW |

---

## S3-4 — the board said "in progress" while it was waiting on the writer (DONE)

> "pise u toku, ima dokument a nema akcije tj kako da ih uradim"

`deriveManuscriptStages` marks `restructure` **partial** while proposals are
undecided, which is correct — the point of the pass is the decision, not the
report. The board rendered that as the generic "U toku", so the writer read it
as *the agent is still thinking* and went looking for actions that were not
there. Both restructure sessions had in fact completed minutes earlier.

Fixed three ways:

- The card now says how many proposals are waiting, in the writer's language
  and with the right plural (`countWithNoun`): "10 predloga čeka vašu odluku".
- The link to the structure panel becomes the **primary** button, labelled
  "Odluči o predlozima"; re-running the pass moves to second place. A stage
  waiting on the writer leads with his decision.
- The reports tabs are addressable (`?tab=structure`). They were not, so the
  link landed on Analytics and the writer could not find the panel at all —
  reported separately, same trip.

## S3-5 — duplicates, and the manuscript damage they caused (DONE)

> "ovo je takodje zbog duplih, to mora da se spreci, ako vec ima ne treba
> ponovo da se pojavi, to mora sistemski da se resi"

Running `restructure` twice filed every move twice. `merge [9, 10]` was then
accepted twice: the first ran on 9+10, the second on the survivor plus whatever
had shifted into 10 — which was **Košare**, the chapter the same editor had
explicitly declined to touch in its own proposal document.

`ProposeStructureMove` now refuses a move this book already carries as pending,
accepted or applied, and says which one. The agent has no way to file the same
structural change twice.

## S3-6 — undo could not run, and two ways prose was destroyed (DONE)

Pressing Poništi threw:

```
Unique constraint failed on the fields: (`book_id`, `chapter_number`)
```

Three separate defects, all in the same family — **a number is reused while
something still points at the old one**:

1. **Undo re-created absorbed chapters at their original numbers.** The merge
   had closed the gap, so those numbers were taken. It threw after the
   survivor's prose was already restored, leaving the book a chapter short with
   the move still marked applied. Absorbed chapters now come back parked far
   above the book and reach their real numbers through the renumber pass.
2. **`renumberChapters` only parked the chapters the caller named.** Undo
   replays an ordering captured when the move was applied; if the book has
   gained a chapter since, that chapter is unparked and a target number walks
   straight into it. It now parks the whole book and appends the unnamed
   chapters after the named ones.
3. **A new document took a key an existing document still held.** Storage keys
   are derived from the chapter number at creation and deliberately never move,
   but chapter numbers are recycled. Splitting chapter 24 created a chapter 25
   whose key `chapter-25.md` belonged to the old chapter 25 (now 26) — and the
   write went straight over that chapter's prose. `DocumentService.create` now
   refuses a key another document in the book holds.

The first parking fix initially used `max + 1`, which reproduced defect 3 on the
restore path; parking now sits above `TEMP_OFFSET * 2`, where no real key can
ever be.

### Recovery

The owner's *Legat - Zakletva* was restored to **31 chapters in the original
order, 56.890 words, every chapter readable, no shared keys, no numbering
gaps**. Two chapters had to come back from cold storage: "Ono što je nosio" from
the move's `previousState` snapshot (11.641 chars) and "Pandorina kutija" from
its own version-1 object (12.750 chars), which survived because version keys are
derived from the document id rather than the chapter number.

The 16-word difference against the imported 56.874 is D-205, not lost prose.

## S3-7 — a green tick on work that never happened (DONE)

> "kaze da je uradjeno a nije, niti ima da vidim predloge i prihvatim...
> ostale su stare... bez akcije"

After the recovery every proposal sat at `undone` or `failed`, and the board
showed the restructure stage as **Urađeno**. `deriveManuscriptStages` read
"nothing pending" as "work finished":

```ts
input.structureMovesPending > 0 ? "partial" : "done"
```

An empty decision queue is not an outcome. A book whose every proposal was
rejected, undone or failed to run has a manuscript nobody changed. The stage now
needs a move that was actually applied and still stands; otherwise it reads as
not started and `nextStage` points back at the pass, so the board recommends
running it again. `structureMovesApplied` is counted alongside the others in
`dev/page.tsx`.

The panel had the matching problem: ten dead cards with no buttons, and no empty
state, so there was nothing to do and no way to start over. Decided, undone and
failed moves now collapse into a fold — "Raniji predlozi (10)" — and with
nothing live the panel shows its empty state and the "Predloži strukturne
izmene" button again.

## S3-8 — a proposal pointed at the wrong chapter, and said so in English (DONE)

> "nije prihvatio zadnju izmenu od 3 koje su stajale"
> `Potez nije mogao da se primeni: This proposal is already failed.`

Three proposals stood on the panel. The writer accepted two merges — `[11,12]`
and `[29,30]` — and each renumbered everything below it. The third was a split
of chapter 28 at a verbatim quote. Chapter 28 had been **"Dnevnik"** when the
editor read it; after the merges, 28 was **"Klisura"**, so the engine reported
the quote was not in that chapter. The move was not wrong. Its address was.

Re-planning at accept time is the right rule, but it only means something if
the move still names the same CHAPTER. A number is a rendering of the reading
order, not an identity — the same mistake, in a fourth place, as S3-6.

`ProposeStructureMove` now stamps chapter ids into the payload, and `planMove`
resolves those ids to current numbers before doing anything else. Accepting one
move can no longer poison another. Proposals filed before this still travel by
number and keep working; a move whose chapter is gone fails with
`chapter_not_found` instead of acting on whatever inherited the number.

The second half of the report: `This proposal is already failed.` in the middle
of a Serbian panel. The engine answers with a code AND an English sentence, the
route already forwarded both, and the panel threw the sentence. Codes are the
contract; the prose belongs in the dictionary. Seven failure reasons are now
translated in all seven languages, and each says what to do rather than what
went wrong — "Poglavlje za koje je potez napisan više ne postoji. Pokrenite
prolaz ponovo."

## S3-9 — the agent panel header broke on a long step label (DONE)

The running-step badge ("Delegiranje: Analitičar rukopisa") rode over the panel
title and ran off the right edge, and "Agent za pisanje" wrapped onto two lines.

Two causes, both in the header row:

- `Badge` carries `shrink-0 whitespace-nowrap` by default, so it never gave way;
  it pushed the row wider than the panel instead. It now gets `min-w-0 shrink`.
- `truncate` had been applied to the badge itself, which does nothing: ellipsis
  needs a block-level box, and a badge is `inline-flex`. The label now sits in
  its own `<span className="truncate">`.

The title was the visible casualty — it was the only thing in the row allowed to
shrink, so it absorbed the overflow and wrapped. It is `shrink-0` now, and the
action buttons are too.

Same trip: the stats bar under the header said "Step 6:" and "Turn 12/50" in
English. Both are in the dictionary now, in all seven languages.

**Test note.** The proposal-dedup tests from S3-5 were moved out of
`no-duplicates.test.ts` into `structure-propose-tool.test.ts`. They had built a
second, thinner harness for the same tool: a dynamic `import()` inside the test
and a `ctx` missing `agentType` and `documentService`. Under full-suite load
that occasionally sent `executeTool` into its retry path and the assertion saw
no write — a flaky test guarding a real defect, which is worse than no test. The
storage-key half stays where it is; it needs its own storage mock.
