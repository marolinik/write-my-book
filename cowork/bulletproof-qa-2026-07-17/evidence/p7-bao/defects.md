# P7 Bao — Defects

Persona: Bao (migrator/finisher). Scope: Phase A non-LLM subset (Day-0 import, export-fidelity baseline,
organize, portability, delete drill, edge cases). Book: "The Kőszeg Manuscript P7", 20 chapters, 81,095 words,
unicode/diacritics throughout every chapter. Never reordered (D-03 does not manifest in this evidence set —
deliberately out of scope this phase, per team-lead instruction).

**Update (2026-07-18):** the reorder/export deferred block below WAS run in a follow-up pass (team-lead
instruction: "reorder at 20-chapter scale ... re-export determinism check"). As of that pass the book is no
longer in its original (never-reordered) state — its 20 chapters are now in full-reversal order. See the
"20-chapter reorder + export verification" section for details and current chapter order.

---

## 20-chapter reorder + export verification (2026-07-18) — deferred block, now COMPLETE

**Method:** reused/extended the D-03 fix-verification methodology validated on P2 the same day
(`p2_d03_fix_verify.py`: docx word-exact / pdf similarity / epub exact-match), scaled to this book's 20
chapters and 81K words.

**Reorder applied:** `PATCH /api/books/{id}/chapters/reorder` with a full 20-chapter reversal (chapter at
position *p* moves to position *21-p*) — a genuine multi-chapter permutation with no fixed points, not a
2-chapter swap. Response `{"reordered": 20}`; DB order confirmed to match the reversal exactly via
`GET /chapters`.

**Results — all 3 formats, post-reorder:**
- **DOCX:** 20/20 chapters exact word-for-word match to DB content, in the new reversed order; title headings
  found in exactly the expected reversed order; zero content loss (`total_local_words == sum_over_reordered_titles`,
  84,556 words). `p7ro-05` .. `p7ro-09`.
- **PDF:** all 20 chapters' extracted-text similarity to their own DB content is the unique highest-ranked
  match among all 20 candidates (own ≥0.9956, always rank #1), and title occurrence order in the extracted
  text matches the reversed order exactly. `p7ro2-04`, `p7ro2-05` (see self-correction note below for why the
  first-pass version of this check used the wrong acceptance criterion).
- **EPUB:** all 20 real-chapter content files exact word-for-word match (ratio 1.0000) to their paired DB
  chapter, in correct reversed-order position. `p7ro2-02`, `p7ro2-03`.
- **Re-export determinism (on the reordered state):** exported docx twice in a row post-reorder; body
  paragraphs byte-for-byte identical across both exports (only `docProps/core.xml` timestamp metadata
  differs, per the pre-established `p7_diag_export_determinism.py` precedent). `p7ro-20`, `p7ro-21`.

**Verdict: PASS, no content-integrity defect at 20-chapter reorder scale.** D-03 (fixed on P2 earlier this
session, commit `4e9c8c5`) does not regress here — corroborates the fix generalizes to a larger book and a
full-reversal (not just swap) permutation.

**Self-corrected false-positives (transparency):** the first run of this check produced many spurious FAILs
on PDF and EPUB (docx was clean from the start). All three were test-harness bugs, root-caused via dedicated
diagnostic scripts before concluding anything, not product defects:
1. **EPUB front matter shares the `chNNN.xhtml` numbering scheme.** `ch001.xhtml`–`ch004.xhtml` are half-title/
   title/copyright/etc. (a few dozen words each); the 20 real chapters are `ch005.xhtml`–`ch024.xhtml`. The
   first-pass filter only excluded files literally named `title_page`/`nav`/`toc`, not this in-band front
   matter. Fixed by filtering on body word count (≥1000 words = real chapter) instead of filename.
2. **`<title>` tag bleed.** The extraction regex stripped all HTML tags without first isolating `<body>`, so
   each file's invisible `<head><title>ChapterTitle</title></head>` text was counted alongside the visible
   `<h1>ChapterTitle</h1>` heading — every chapter's word count was inflated by exactly 2× its title length.
   Short titles stayed above the 0.999 ratio threshold by luck; "No Names in São Paulo" (5-word title, +10
   words) tipped just under (0.9988) and exposed it. Fixed by isolating `<body>` and stripping the `<h1>`
   before word-counting; all 20 chapters now hit exactly 1.0000.
3. **Imported a too-strict pairing threshold from P2.** P2's corroboration script required own-similarity to
   beat the best cross-chapter match by ≥0.30 (valid there, where cross-chapter similarity was ~0.25–0.29).
   P7's prose generator (`p7_common.py gen_chapter`) reuses a small shared sentence-template pool across all
   20 chapters, so cross-chapter similarity is inherently ~0.89–0.94 — a fixture property, not ambiguous
   pairing. The correct proof of correct pairing is "own is the unique argmax across all 20 candidates and
   ≥0.99", which held in every case once applied (own was already the unique highest match in the very first
   run; only the acceptance threshold was wrong).

**Evidence:** `p7_reorder_export_state.json`, `p7_reorder_reanalyze_state.json`,
`api-traces/p7-reorder-export-verify.txt`, `api-traces/p7-reorder-reanalyze.txt`.

---

## X4 — export during heavy concurrent autosave (2026-07-18) — optional block, now COMPLETE

**Repro:** fired 5 concurrent `PUT .../content` requests (distinct, easily-distinguishable ~9,000-word
payloads) against one chapter of this book, with a `POST /export` (docx) fired concurrently in the same
thread pool.

**Result: PASS, no torn snapshot.** The exported docx's chapter body contained exactly one complete submitted
version (no interleaving of two different payloads' text within the same paragraph run); the post-race
`GET .../content` also settled on exactly one complete version (last-write-wins, as expected — the export
simply captured whichever complete version existed at its own read time, not necessarily the very last write,
which is correct behavior, not a defect). Original chapter content was restored and verified afterward.

**Evidence:** `api-traces/p7-x4-race-export-autosave.txt`.

---

## D-05 — PDF export omits document metadata title

**Class:** S3, minor. Publisher-trust artifact, not a data-loss or crash defect.

**Repro:** Export the same book to both docx and pdf via `POST /api/books/:id/export`.
- docx: `docProps/core.xml` correctly sets `<dc:title>The Kőszeg Manuscript P7</dc:title>`.
- pdf: `pypdf.PdfReader(pdf_bytes).metadata.title` is `None`.

Both formats come from the same export pipeline and the same book — the docx path clearly has the title
available (book.name is threaded into the pipeline), but it isn't propagated into the PDF's own metadata
dictionary. This matters for a migrating/finishing writer like Bao: a PDF handed to an agent, a beta reader,
or a print-on-demand service shows no title in the file's own properties (visible in Preview/Acrobat/Finder
"Get Info", ebook readers' library view, etc.) even though the manuscript content itself is complete and correct.

**Evidence:** `p7fmt-12-pdf-metadata-title-present` in `p7_phase2_state.json` (mirrored in `_results.json`).
Not fixed — evidence-only, `src/` untouched per phase scope.

---

## Z15 / B3 (reproduction, not a new defect) — PDF page-count estimate significantly off vs. actual

**Class:** already tracked in `COVERAGE-MATRIX.md` under P7 ownership (Z15, "export finish: page-estimate
~47% off (B3), F10 xhtml titles").

**Repro at 80K-word scale:** `estimatedPages` returned by the export API was 232; the actual rendered PDF
page count (via `pypdf.PdfReader(...).pages`) was 165 — a 40.6% gap, well outside a generous 15% sanity
threshold. This is a smaller gap than the historically-documented ~47%, at a different word count (81K vs.
whatever P2/prior sessions used), which suggests the estimator's error scales with content rather than being
a fixed constant offset — worth noting for whoever fixes it, since a fixed-offset patch would not close this.

**Evidence:** `p7fmt-11-pdf-page-count-vs-estimate-B3` in `p7_phase2_state.json`. Confirms the defect is
still live; not re-filed as a new ID since it's pre-registered.

**Note:** the F10 half of that pre-registered Z15 entry ("xhtml titles") IS now fixed for real chapter
content — see the non-defect diagnostics section below. Only the page-estimate half of Z15/B3 remains open.

---

## Informational, not a defect: merge-probe returns 405 instead of 404

`POST /api/books/:id/chapters/merge` returns HTTP 405 (Method Not Allowed), not 404. Root cause: Next.js's
dynamic route resolves `/chapters/merge` to `chapters/[chapterId]/route.ts` with `chapterId="merge"` — that
route file has GET/PATCH/DELETE handlers but no POST, so the framework returns 405 by default. The two more
direct probes, `POST /chapters/:id/merge` and `POST /chapters/:id/split`, both correctly return 404 (no such
route segment at all). All three probes agree on the actual fact under test: **merge/split chapter
functionality does not exist**, corroborating the static route enumeration (`Glob` of
`src/app/api/**/route.ts` shows only `chapters/route.ts`, `chapters/[chapterId]/route.ts`, and
`chapters/reorder/route.ts`). Recorded as a FAIL in `_results.json` purely because the status code didn't
match my probe's literal expectation, not because it reveals a real problem.

---

## Non-defect diagnostics (investigated, ruled out — recorded so nobody re-litigates them)

1. **Export SHA instability across concurrent/repeated exports of unchanged content.** Root-caused with
   `p7_diag_export_determinism.py`: the docx body text (`word/document.xml` paragraphs) is byte-identical
   across two concurrent exports and a baseline vs. a 10-minutes-later re-export. The only differing bytes
   are `docProps/core.xml` `<dcterms:created>`/`<dcterms:modified>` — each export run's own generation
   timestamp, standard for any docx-producing tool. SHA is the wrong oracle for "export determinism";
   content-equality is correct, and it holds. See `p7_phase5_state.json` ids `p7-76`, `p7-78`, `p7-79-diag`.

2. **Pandoc smart-quote typesetting** (straight `'` → typographic `'`/`'`) on export. Correct publishable
   behavior, not content loss — required normalizing quote variants in the test oracle (both title matching
   and word-level body diffing) to avoid false failures. This affects body prose, not just titles — a
   generalization beyond what P2's D-03 corroboration needed, folded into the shared `p7_common.py`.

3. **"Act N" divider paragraph at act boundaries.** Reproduced on a book that was NEVER reordered — a
   chapter immediately preceding an act boundary shows a 2-word insert diff purely from the act-divider
   heading text. Not specific to D-03/reorder; any chapter-boundary-detection script must treat `Act \d+`
   paragraphs as slice terminators alongside chapter headings.

---

## Portability — honest gap (not a numbered defect, flagged for founder-decision triage)

Chapters/content, story-bible documents, wiki entities, writer memory, and editorial findings are each
individually, fully retrievable via their own JSON GET route (all verified this phase by seeding one
manually-authored item per class and confirming round-trip). **But there is no single "export everything"
bundle** — `/api/books/:id/export` packages chapters only, into docx/pdf/epub. A migrating/finishing writer
can leave with 100% of their data, but only via N separate raw API calls, not one file/zip producible from
the UI. See `portability_summary` in `_results.json` for the full breakdown.
