# Live-testing backlog — 2026-09-17 (closed out 2026-09-18)

Running list from the writer's live session against the local fleet. Nothing is
dropped from here until it is either fixed or explicitly declined.

Status legend: **DONE** (fixed + verified), **OPEN** (not started), **PARTIAL**.

## Status as of 2026-09-18

All thirteen open items (O1–O13) were worked. Twelve are DONE; O7 is CONFIRMED
and guarded but its root cause is still open, for the honest reason recorded
below.

| # | What it was | Outcome |
|---|---|---|
| O1 | 131 hardcoded English strings | DONE for the app. 535 scanner hits down to 59; what remains is public marketing copy, shadcn primitives and scanner false positives. `scripts/scan-hardcoded-ui-strings.ts` measures it; `tests/unit/main-surfaces-i18n.test.ts` keeps the daily screens from regressing. |
| O2 | Series documents were concatenations | DONE — `src/lib/series/compose-series-document.ts` demotes headings, inserts in book order, names books that contributed nothing, marks a foreign-language section. |
| O3 | Old documents keep their damage | DONE — damage scan, an API, a notice with per-document Regenerate, and a CLI script. Found 15 damaged of 62 on the live dev database. |
| O4 | Prerequisite failures invisible | DONE — the 422 now names the missing artifact in the writer's language and offers the run that produces it. |
| O5 | Zika needs a warm-up | DONE — cold-start family gets a 20 minute client deadline, the rest of the fleet 10, hosted providers keep the SDK default. |
| O6 | Worker log flood on Redis loss | DONE — exponential Redis backoff to a 30s ceiling plus a per-failure log throttle. |
| O7 | D-203 hydration mismatch | One real cause found and FIXED (the dashboard nudge read localStorage during render). Residual: no mismatch in 6 serial audit runs, 1 in 4 under three concurrent dev requests. Production comparison still blocked by the env guard. |
| O8 | Board did not refresh after a job | DONE — `RefreshOnSessionComplete` refreshes the server render when a session of this book reaches a terminal state. |
| O9 | Cross-book continuity blind | DONE — `ListSeriesBooks` and `ReadSiblingChapter` give the checker a sibling book's real prose. |
| O10 | Continuity tab always ran the series check | DONE — new `check-continuity` workflow for a standalone book, and the whole tab translated. |
| O11 | Razvoj board showed the greenfield map | DONE — the importer path is derived from the data and rendered by the same cards. |
| O12 | No structural revision pass | DONE — propose, accept, apply, undo, and a writer panel. Live-verified against the local fleet on a book copy, 2026-09-18 (see "O12 live rehearsal"). |
| O13 | `analyze` was a dead end | DONE — the report hands off to the restructure pass, in the workflow graph and in the Analytics tab. |

---

## Done this session

| # | Problem | Root cause | Fix |
|---|---|---|---|
| 1 | Agent output mangled every non-ASCII character | `local-llm-proxy.py` read the upstream stream one byte at a time and decoded each byte on its own, so every multi-byte UTF-8 char became one U+FFFD per byte | Read and decode line by line; `\n` never falls inside a UTF-8 sequence |
| 2 | Agents wrote English for a Serbian writer | `POST /api/books` hardcoded `language: "en"`; agents enforce `book.language` | Default to the writer's `preferredLanguage`; same for series; existing books repointed |
| 3 | Markdown tables collapsed into run-on paragraphs and were saved flattened | The TipTap editor had no Table extension, and headings were capped at h3 | Added `@tiptap/extension-table`, headings h1–h6, round-trip test |
| 4 | No way to rename a book or change its language | Both were setup-wizard-only | Book details card in Book Settings; shared language list |
| 5 | Repeated approval prompts for the same document | `RequestApproval` is model-driven; nothing remembered a granted approval | Session-level approval cache (approvals only, never rejections) |
| 6 | Garbled Serbian/German/Spanish UI strings | 51 runs of double-encoded text committed into `ui-strings.ts` | Repaired in place + `no-mojibake.test.ts` guard over all of `src/` |
| 7 | Agent asked approval to delegate, then timed out unseen | Nothing forbade approval-to-start; a collapsed panel hid the request | Tool description + conductor rule forbid it; `ApprovalNotifier` toast |
| 8 | Every local session recorded 0 tokens | Proxy never sent `stream_options.include_usage`, and broke out of the read loop before the usage chunk | Both fixed; budget and cost accounting work again |
| 9 | Spinner kept running after a session finished | Client store persists sessions across books; a missed terminal event left them "running" forever | `GET /api/books/:id/agent/:sessionId` + reconciler (mount, focus, 20s); setup wizard scoped to its own book |
| 10 | "Completed in N min" kept growing | Duration computed as `now - startedAt` for finished runs | `completedAt` on the session + `sessionElapsedMs()` |
| 11 | Synopsis / research locked on an imported manuscript | Prerequisites demanded a CONCEPT / STORY_BIBLE document that an imported book never has | Prerequisites accept an existing manuscript; prompts derive the synopsis backwards from the chapters |
| 12 | "Trener" as the Serbian name for the Coach | Translation choice | Renamed to "Mentor" everywhere |
| 13 | Setup wizard banner and step counter in English | Hardcoded strings | Translated into all 7 locales |

| 14 | Agent typed Cyrillic in a Latin-script Serbian book | Script is a model behaviour; the prompt could only ask | `enforceBookScript()` transliterates at the stream and at every document/chapter write |
| 15 | Agent drifted into Croatian / ijekavian | Language prompt said only "Serbian Latin" | Prompt pins Serbian ekavian with word pairs and vocabulary; audit flags ijekavisms |
| 16 | 404 opening a document from the series list | The list links book-level documents to the series route, which reads them in series scope only | Detail page resolves the document's own scope first |
| 17 | Series continuity checked only one book | `continuity-checker` tools reach the current book only; the instruction never said where cross-book material lives | Instruction names the series documents as input and requires it to state which books it could NOT read |

---

## Open

### O1 — 131 hardcoded English strings across the UI (HIGH)
Found by scanning every `.tsx` for user-visible text that does not go through
i18n. The Serbian UI still reads half-English on the main surfaces:

```
books/[bookId]/page.tsx       Book Progress, Word Count, Recent Agent Sessions, Editorial Findings
books/[bookId]/settings       Model Overrides, Resolution Preview, Delete this book
series/[seriesId]/page        Total Books, Total Chapters, Total Words, Series Documents
settings/billing              Total Sessions, Input Tokens, Contact Us
app/(app)/not-found, error    Page not found, Something went wrong
```

Needs new keys in all 7 locales. Waiting on the writer's call: whole sweep, or
only the screens in daily use first.

### O2 — Series documents are a concatenation, not a synthesis (HIGH)
`synthesizeToSeries()` appends each book's document verbatim under a
`## Book NN Contributions` heading. Consequences, all visible in the current
files:

- The series document opens with **Book 02** because book 1 never contributed
  (its documents predate the series link, or were written under another book
  number). Nothing detects the gap.
- Heading levels collide: the book document keeps its own `# TITLE`, so an `h1`
  ends up nested under the wrapper's `h2` — two `h1`s in one document.
- Language follows whatever each book had when it contributed, so a series can
  hold a Serbian and an English section side by side (currently: a Serbian set
  from today, an English set from 19 days ago).
- Nothing is ever merged: shared characters, timeline and rules are repeated per
  book instead of being reconciled once.

Fix direction: demote the contributed document's headings by one level when
splicing, order sections by book number and show gaps explicitly, and add a real
synthesis pass (story-architect reading all contributions and writing one
coherent series document) instead of leaving the concatenation as the product.

### O3 — Old documents still carry the damage (MEDIUM)
Documents written before fixes 1 and 2 keep their mojibake and their English.
`U+FFFD` cannot be reversed — the original bytes are gone. They have to be
regenerated. Affected: the first book's ARCHITECTURE, STORY_BIBLE and
FINGERPRINT, plus the 19-day-old series set.

### O4 — Prerequisite failures are invisible in the UI (MEDIUM)
`POST .../agent` answers `400 {"error":"Prerequisites not met","missing":[…]}`,
but the panel shows nothing — the writer presses "Run" and gets silence. The
`missing` list should surface as a message naming what is needed and which
workflow provides it.

### O8 — Journey board does not refresh when a background job finishes (HIGH)
`/books/:id/dev` is a server component. A background workflow writes the
document, but nothing re-renders the page, so the card still reads "Nije
započeto" and the writer starts the same run again. Needs a `router.refresh()`
when a session completes (the stream hook already invalidates the client-side
query cache, which does nothing for server components).

### O9 — Continuity across books is structurally blind (MEDIUM)
`continuity-checker` can only read the current book's chapters. Cross-book
checking works off the series documents, which are concatenations, so anything a
book never contributed is invisible. A real fix needs a tool that reads a
sibling book's chapters.

### O10 — Continuity tab always runs the SERIES check (MEDIUM)
Even for a standalone book outside any series, and the whole tab (domain names,
buttons, empty state) is hardcoded English.

### O11 — The Razvoj board shows the greenfield map to an importer (HIGH)
`journeys.ts` already defines an "Existing Manuscript" journey in the right
order (read-manuscript, capture-style, create-story-bible, build-architecture,
analyze, then dev-edit/line-edit/beta-read/revise per chapter, then
market-analysis and publishing-check) — but it is only reachable from the agent
panel's Journeys tab. `/books/:id/dev` renders the six greenfield stages (Idea,
Synopsis, Structure, Research, Plan, Draft), so a writer who imported a finished
book is shown a path that does not apply and never meets the one that does.

### O12 — No structural-revision pass (HIGH, missing capability)
Nothing proposes reordering, merging or splitting chapters. There is a manual
`chapters/reorder` endpoint and nothing else: no workflow reads the pacing
metrics, the continuity findings and the architecture together and says "chapter
17 and 18 should merge", "31 is numbered wrong", "the 1903 thread stalls for
four chapters — move 24 earlier". This is the step the writer expects between
analysis and dev-edit, and it is the one that is absent.

Shape it should take: a `restructure` workflow on story-architect that reads
ARCHITECTURE + ANALYSIS_REPORT + continuity findings + the chapter list and
produces a STRUCTURE_PROPOSAL document — an ordered list of concrete moves with
a reason and a diff-like before/after, each accepted or rejected by the writer,
with acceptance driving the existing reorder endpoint.

### O13 — `analyze` is a dead end (MEDIUM)
The workflow produces ANALYSIS_REPORT and declares `suggestedNext: []`. Nothing
consumes the metrics and nothing tells the writer what to do with them, which is
exactly how it reads in the app: a report appears and the journey stops.

### O5 — Zika needs a warm-up (LOW)
`qwen3.8-27b-uncensored` answers `/v1/models` while its weights are not
resident, so the first request after an idle period can hang for minutes.
Either warm it on gateway start or give that family a longer client timeout.

### O6 — Worker log flood on Redis loss (LOW)
While Docker was down the worker wrote ~80k `ECONNREFUSED` lines with no
backoff.

### O7 — D-203 hydration mismatch (LOW) — CONFIRMED, root cause open
Reproduced and localised on 2026-09-18, and now guarded by
`tests/e2e/hydration-console.spec.ts` (opt-in: `HYDRATION_AUDIT=1`).

What is now known:

- It is real in development and **intermittent**: three of four runs of the
  audit are clean, one fails. The first run after a cold compile failed on all
  three pages tested.
- The mismatching node is a Radix `DropdownMenuTrigger` on `/dashboard`; the
  server rendered `id="radix-_R_66iitmlb_"` and the client `id="radix-_R_1hkitmlb_"`.
  React's message is the attribute-mismatch one, not a text mismatch.
- React 19 derives `useId` from the position in the tree, so a differing id
  means the tree above that node differed between server and client render.
  That is the thing to find; it is NOT the dropdown's own fault.

What could NOT be answered here, and why: the original question was whether this
is dev-only. A production build refuses to start on this machine, by design —
`next build` fails with "Invalid production environment: placeholder value is not
allowed in production runtime" for the three Clerk variables, plus
"DEV_AUTH_BYPASS must be disabled in production". The local `.env` carries
neutralised Clerk keys and the dev bypass the writer needs. Answering the
question requires an environment with real keys:

```bash
npm run build && npx next start -p 3100
HYDRATION_AUDIT=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100   npx playwright test hydration-console
```

Nothing was patched on a guess: a speculative `suppressHydrationWarning` would
hide the symptom and keep whatever renders differently.

**One real cause found and fixed.** `NudgeDismiss` (the dashboard "hide this
recommendation" wrapper) seeded its state from `localStorage` *inside the first
render*. For a writer who had dismissed the nudge that day, the client's first
tree differed from the server's, which renames every `useId` below it - and the
theme-toggle dropdown is below it. It now renders the server's markup first and
adopts the stored dismissal in an effect, guarded by
`tests/unit/nudge-dismiss-hydration.test.tsx` (the server render must not depend
on storage).

**Measured after the fix** (dev server, warm):

| How the audit ran | Runs | Runs with a mismatch |
|---|---|---|
| Serial (`--workers=1`) | 6 | 0 |
| Three browsers at once (`--workers=3`) | 4 | 1 |

So the writer-visible case is gone, and what remains appears only when several
requests hit the dev server at once - which is consistent with the original
"dev-only" suspicion (a streamed or aborted dev render producing a different
tree), but it is not proof. The proof is the production run above, in an
environment that has real Clerk keys.

---

## O12 live rehearsal — 2026-09-18

The P1 gate from the 09-18 S2 handoff ("O12 has never run against a real
model") is closed. The whole pass — propose, accept, apply, undo — ran against
the local fleet on a copy of the writer's own book, never on the trilogy.

**The copy.** `scripts/dev-clone-book.ts` clones a book's rows *and* its MinIO
objects, because `Document.storageKey` is relative to the book's S3 prefix: copy
the rows alone and every document in the clone points into an empty prefix. The
clone is created detached from its series so no series-level number moves, and
`--delete` refuses any book that still has a `seriesId`, which is the cheapest
proof available that it is a clone. Rehearsal book:
**Legat - Zakletva (proba restrukture)** — 31 chapters, 38 documents, 8
findings, carrying the ARCHITECTURE, ANALYSIS_REPORT and CONTINUITY_REPORT that
`restructure` reads as evidence.

**What the model did.** story-architect filed two moves and wrote the
STRUCTURE_PROPOSAL (7,069 chars, in Serbian):

| Move | Confidence | Evidence it cited |
|---|---|---|
| Split chapter 31 at a verbatim anchor | 0.90 | 3,728 words, longest file against a ~1,835 median; architecture lists it as two chapters; continuity finding 3 |
| Renumber chapter 10 to position 11 | 0.85 | In-manuscript headings run one behind the file numbering; continuity finding 3 |

It also recorded what it *declined* — "Košare" (593 words, the shortest chapter)
is a deliberate beat, not a defect. Two moves rather than the three-to-seven the
prompt asks for, but each one is anchored in a named metric or finding, which is
the rule that matters.

**What the engine did.** Both moves applied and both undid, checked in the
database rather than in the UI's own claim:

- Split: ch31 3,728 → 1,940 words, new ch32 "Povratak (istrgnute strane)" 1,804
  words, CHAPTER_CONTENT documents 31 → 32. Undo returned 31 chapters, and the
  restored prose is **byte-identical** to the source book's chapter 31 (23,290
  chars).
- Renumber: "Košare" 11 → 10 and "Utorkom, uz zapisničara" 10 → 11 through the
  two-phase transaction, 31 rows intact, no unique-constraint collision. Undo
  put both back.

### D-204 — the structure panel's result line is untranslated (LOW)

An applied move renders `Split chapter 31 into 31 and 32.` and `Moved chapter 10 to
position 11.` inside an otherwise fully Serbian panel. `resultSummary` is
written in English by the apply engine and rendered raw, so it cannot be
translated at the component. The summary needs to become a key plus parameters,
not a sentence.

### D-205 — undo restores prose exactly but not the word count (LOW)

An accept-then-undo cycle that changes nothing visible still moved
`book.wordCount` 56,874 → 56,890 permanently. The prose came back byte-identical;
the count did not, because undo recomputes it with `countWords()` instead of
restoring the number held in the move's `previousState` snapshot. `countWords`
strips `-` and `|` as markdown, so it disagrees with whatever the import path
recorded. Every rehearsal of a move leaves the book's word count slightly wrong.

### Observations, not defects

- The agent panel header still read "31 poglavlja" while the book had 32,
  immediately after the split. Seen once; likely the panel not refetching after
  a structural mutation, adjacent to O8.
- The renumber proposal's *reasoning* argues the entire manuscript is offset by
  one, but a `renumber` move can only express moving one chapter, so the payload
  became a swap with its neighbour. The engine did exactly what the payload
  said. If the real defect is a whole-book offset, the move vocabulary has no
  way to say so.

---

## Standing check

`npx tsx scripts/audit-agent-runs.ts --hours 6` — flags wrong-language
documents, `U+FFFD`, double-encoding, empty documents, failed or over-long
sessions, and flattened tables.
