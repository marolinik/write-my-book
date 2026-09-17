# Live-testing backlog — 2026-09-17

Running list from the writer's live session against the local fleet. Nothing is
dropped from here until it is either fixed or explicitly declined.

Status legend: **DONE** (fixed + verified), **OPEN** (not started), **PARTIAL**.

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

### O7 — D-203 hydration mismatch (LOW)
Radix `useId` differs between server and client render (`_R_33e…` vs `_R_or…`),
reported in the console on every page load. Pre-existing. Suspected dev-only
(Turbopack overlay); needs a production-build comparison to confirm.

---

## Standing check

`npx tsx scripts/audit-agent-runs.ts --hours 6` — flags wrong-language
documents, `U+FFFD`, double-encoding, empty documents, failed or over-long
sessions, and flattened tables.
