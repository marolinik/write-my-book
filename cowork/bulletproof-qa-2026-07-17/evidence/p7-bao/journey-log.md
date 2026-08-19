# P7 Bao — Journey Log

Persona: Bao, migrator/finisher — arriving with a big manuscript already written elsewhere, testing whether
wmb-pub can safely receive it, keep it, reorganize it, and let him leave with everything if it doesn't work
out. Identity: `x-e2e-clerk-id: user_qa_p7`, professional subscription, BYOK key context. Phase A non-LLM
subset only — no dev-edit/line-edit/CAS/extraction/agent jobs triggered anywhere in this journey.

Scope for this session, per team-lead: Day-0 import + export baseline (already partially done before this
session resumed), then organize/rename, merge/split verification, portability sweep, delete drill, and edge
cases. Reorder-then-export stays blocked on D-03 until the background fix lands; wiki/entity extraction,
radar/health, and GDPR delete stay deferred (LLM-gated or destructive-at-account-scope).

## Phase 1 — Day-0 import (67/67 PASS)

Created "The Kőszeg Manuscript P7": 20 chapters, ~4,000 words each, unicode/diacritics forced into every
paragraph (façade, naïve, café, Zürich, São Paulo, Łódź, Kőszeg, Zoë's, Raison d'Être, ...). Total 81,095
words. Verified structure (chapter count/order/act assignment), titles, and word counts via the API, then
did a byte-exact round-trip check on all 20 chapters' content — including every diacritic — with zero
mismatches. D5 latency captured at this scale: chapter-list GET p50 47ms/p95 47ms, book-dashboard GET p50
46ms/p95 62ms, content GET p50 47ms/p95 63ms, content PUT across all 20 saves p50 172ms/p95 188ms
(min 140ms/max 203ms). No cliff at 80K words for any of these paths.

## Phase 2 — Export fidelity baseline, pre-reorder (19/21 PASS)

This book has never been reordered, so D-03 (chapter-body-swap-after-reorder, already proven in P2's
evidence) is out of scope here by construction — this is the clean baseline the campaign needs alongside
that proof. Exported docx, pdf, and epub and checked titles-present-in-order, zero-content-loss (word-level
diff against the DB), metadata, EPUB structure/TOC, and PDF page-count-vs-estimate.

Getting to a trustworthy result took three rounds of fixing my own test oracle, not the product: pandoc's
smart-quote typesetting (straight `'` → typographic curly quotes) was flagging real titles like "Zoë's
Gambit" as missing and real bodies as lossy, until I normalized quote variants before comparing — a step P2's
corroboration didn't need because that book's titles had no apostrophes. Then the F10 check was penalizing 5
legitimate front-matter files (title page, copyright, act dividers) for not matching a chapter title, which
they were never supposed to. Then chapter 10 (last of Act 1) showed a 2-word diff that turned out to be the
export inserting an "Act 2" divider heading — the same signature P2 attributed to the reorder bug, but here
reproduced on a book that was never reordered, meaning it's a general export behavior at act boundaries, not
reorder-specific.

After those three fixes, 19/21 checks passed clean. The 2 real FAILs: PDF page-count estimate 40.6% off
(232 estimated vs. 165 actual) — a reproduction of the campaign's already-tracked Z15/B3 defect at 80K-word
scale — and a new finding, PDF export metadata has no title set even though the docx export from the same
pipeline correctly sets it. Filed as **D-05**.

## Phase 3 — Organize + portability sweep (14/15 PASS)

Renamed chapter 5 live via `PATCH .../chapters/:id`, confirmed the new title showed up in the chapter list
with word count untouched, then reverted it so later diffs against the phase-2 baseline stay clean.

Merge/split: confirmed absent two ways. Static route enumeration (`Glob` across
`src/app/api/**/route.ts`) shows only list/create, get/patch/delete, and reorder for chapters — no
merge/split route exists to invent a call against. Then I live-probed it anyway: `POST .../chapters/:id/merge`
and `.../split` both cleanly 404. A third probe, `POST .../chapters/merge` (no chapter id), returns 405
instead of 404 — that's Next.js's dynamic router treating "merge" as a `chapterId` and hitting a route file
with no POST handler, not a hidden merge feature. All three probes agree on the underlying fact: this
functionality doesn't exist.

Portability: "can Bao get everything out?" I seeded one manually-authored item per non-chapter data class —
a story-bible document, a wiki character entity, a writer-memory note, an editorial finding — all as plain,
non-agent CRUD writes, then confirmed each is retrievable through its own GET route. All four round-tripped
cleanly. The honest gap I found: there's no single "export everything" bundle. `/api/books/:id/export` only
packages chapters into docx/pdf/epub — the story bible, wiki, memory, and findings have no equivalent bundled
export, only individual JSON endpoints. Bao CAN leave with 100% of his data, just not as one file.

## Phase 4 — Delete drill (14/14 PASS)

Created a second, throwaway book (explicitly not the 80K-word book), added content plus a wiki entity and a
document, confirmed all three existed, then deleted the book via `DELETE /api/books/:id`. Afterward: the
book itself, its content, its chapter list, its wiki, and its documents all cleanly return 404, and the book
no longer appears in the user's book list. No orphaned-data symptoms visible at the API layer.

## Phase 5 — Edge cases (11/11 PASS)

On a separate sandbox book (again, not the 80K-word book): pasting exactly 2,000,000 characters into a
chapter succeeds (200); one character over that succeeds — sorry, *fails cleanly* with a 400, not a 500,
which is the behavior D-01's malformed-JSON finding showed this codebase does NOT always get right, so it's
worth noting explicitly when a boundary IS handled correctly. Five concurrent PUTs to the same chapter (an
autosave-race simulation) all returned 200 with no corruption — the final content matched exactly one of the
five submitted versions, consistent with last-write-wins and no interleaved bytes.

Concurrent exports and re-export determinism initially looked broken — 3 simultaneous docx exports of the
unchanged 80K-word book produced 2 different SHAs, and a fresh re-export's SHA didn't match the phase-2
baseline either. I didn't trust that at face value (and, separately, found a bug in my own test harness where
the fail-branch of that particular check could never actually trigger — worth flagging so the raw evidence is
read on its own merits, not through my broken pass/fail label). Root-caused it with a dedicated diagnostic:
extracted the docx body text from two fresh concurrent exports and the original baseline and compared them
directly — word-for-word identical in all three. The only bytes that differ are `docProps/core.xml`'s
`dcterms:created`/`dcterms:modified`, i.e. each export legitimately stamping its own generation time, the
same way Word or any other docx tool does on every save. Content-level export determinism holds; file-level
SHA just isn't the right tool to measure it with.

## Summary

128 checks, 125 PASS. 3 real findings: D-05 (new, PDF metadata title missing), a reproduction of the
already-tracked Z15/B3 page-estimate defect at 80K-word scale, and one informational 405-vs-404 status-code
nuance on a merge-probe that isn't a defect at all. Everything else that looked like a failure along the way
— smart quotes, front-matter scope, act dividers, export-SHA drift — turned out to be a test-oracle gap, not
a product bug, and is documented above so nobody re-discovers the same false trail.
