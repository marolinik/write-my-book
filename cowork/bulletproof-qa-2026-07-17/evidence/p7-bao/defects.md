# P7 Bao — Defects

Persona: Bao (migrator/finisher). Scope: Phase A non-LLM subset (Day-0 import, export-fidelity baseline,
organize, portability, delete drill, edge cases). Book: "The Kőszeg Manuscript P7", 20 chapters, 81,095 words,
unicode/diacritics throughout every chapter. Never reordered (D-03 does not manifest in this evidence set —
deliberately out of scope this phase, per team-lead instruction).

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
