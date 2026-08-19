# P7 Bao — REJUDGE Defects (fresh independent capture, 2026-07-20)

Persona: Bao (migrator/finisher, "writes long, never wants to lose a word").
Scope this bundle: **DATA-SAFETY-AT-SCALE / export integrity** — re-test of the P7
baseline floor-drivers (D2=8.0, D5=7.0) and the P7-owned export/portability defects
(D-05, D-46, D-47, D-57, D-61 / Z15-B3), plus adversarial new-issue probing.

Book under test: `The Kőszeg Manuscript — Bao Réjudge P7 (São Café Ærø)`,
16 chapters, **51,291 words**, Unicode/diacritics + multi-script (Latin-diacritic,
Cyrillic, Turkish, Nordic ligatures) in every chapter. 80 unique ASCII sentinels
(START/MID×3/END per chapter) embedded so truncation anywhere is detectable.
BYOK: persona is seeded with an OpenRouter key (per briefing — plan-free personas
are NOT key-less). This scope exercised **zero LLM/BYOK paths** (all import/export/
autosave/reorder/delete are non-LLM), so the key was neither read nor used by the
harness. Secret values never printed (see SUMMARY §secrets).

---

## Baseline defects re-tested LIVE

### D-05 — PDF export omits document metadata title — **CLOSED**
Baseline: `pypdf(...).metadata.title == None` on the PDF while docx carried
`<dc:title>`. **Now:** the PDF `/Info /Title` (UTF-16BE hex string) =
`The Kőszeg Manuscript — Bao Réjudge P7 (São Café Ærø)`, full diacritics, matches
`book.name`. Root: the typst template now carries `#set document(title: "$title$")`
(export-templates/typst-book.typ L76-84). Proof: `artifacts/pdf-analysis.json`
(`metadataTitle.raw`, `d05_pdfTitlePresent:true`), `api-traces/04-pdf-analyze.json`.

### D-46 — export filename silently drops diacritics — **CLOSED (primary) / residual (S4)**
Baseline: `"Kőszeg" → "Kszeg"`. **Now:** filename stem =
`The-Koszeg-Manuscript-Bao-Rejudge-P7-Sao-Cafe-r-…` → `"Kőszeg" → "Koszeg"` (ő
folded to o, not deleted). CLOSED for the reported class. Root: NFD + strip
combining marks before ASCII filter (export-pipeline.ts `sanitizeExportFilename`).
**Residual (new, S4):** NFD only decomposes base+combining-mark letters. It does
NOT decompose precomposed ligatures / distinct letters (Æ, Ø, Þ, ð, ß, ł), which
still fall through to the ASCII drop — `"Ærø"` collapsed to `"r"` in the filename
(`…Sao-Cafe-r-…`). Filename cosmetics only; content/metadata unaffected. See
"New findings" below. Proof: `artifacts/export-results.json`, `api-traces/02-export.json`.

### D-47 — silent last-write-wins on concurrent content PUTs — **CLOSED**
Baseline (P7-func J-4): 5 concurrent content PUTs all 200, 4 versions vanished.
Two-scenario live re-test on ch8:
- **Scenario A (exact stale-tab repro):** 5 concurrent PUTs with NO
  `expectedVersion` (changeSource `user`) → **all 5 rejected 409** `version_conflict`;
  chapter content + version unchanged; every 409 carries `serverContent`
  (recoverable). No silent clobber.
- **Scenario B (legit CAS race):** 5 concurrent PUTs stamped at the same version →
  **exactly one 200** (winner, version→2), **four 409**; saved content equals the
  winner's payload byte-for-byte, matches exactly one submitted payload, zero
  interleaving from losers; all 4 losers receive `currentVersion` + `serverContent`
  (words recoverable, never lost).
Proof: `artifacts/concurrency-d47.json` (both `PASS:true`), `api-traces/05-concurrency-d47.json`.

### D-57 — post-delete error-copy inconsistency ("Not found" vs "Book not found") — **PARTIAL**
Delete drill: after `DELETE book` → **17/17 book-scoped routes return 404** (no
stale reads, no 500s) — data-safety on delete is clean. BUT error copy is still
inconsistent: 16/17 say `"Book not found"`; `GET /continuity` returns bare
`"Not found"`. Static grep confirms the residual is broader — **9 routes** still
return `"Not found"` for the book-ownership miss: `continuity` (GET+DELETE),
`continuity/scan`, `continuity/intentional`, `character-chat`, `marketing-kit`
(×2), `series-context`, `radar`, `daily-plan`. The D-57 fix standardized the core
migrator delete-drill paths (book / export / chapters / content / reorder →
`"Book not found"`) but missed this ancillary family. New finding below.
Proof: `artifacts/delete-drill-d57.json`, `api-traces/08-delete-drill-d57.json`.

### D-61 / Z15-B3 — estimatedPages significantly off vs actual — **CLOSED**
Baseline: 232 estimated vs 165 actual = **+40.6%** (outside 15% sanity band).
**Now:** estimatedPages **108** vs actual PDF page count **100** = **+8.0%**,
inside the 15% band. Root: two-parameter model (5 fixed front-matter pages + body
at 500 w/pg) replacing the single `ceil(words/350)` divisor
(export-pipeline.ts `estimateRenderedPages`). Page count derived two independent
ways that agree: 100 `/Type /Page` objects AND `/Count 100` on the page-tree root.
Proof: `artifacts/pdf-analysis.json` (`gapPctEstimateVsActual:8`, `d61_within15pct:true`).

---

## Floor-driver re-confirmation: D2 data-safety-at-scale (baseline 8.0) — **HOLDS (strong)**

Every leg word-exact, no loss:
- **Import → readback:** book.wordCount = 51,291 == expected exactly.
- **DOCX export:** decompressed `word/document.xml` = 329,003 chars / 51,422 words;
  **80/80 sentinels present and in order**; all 16 diacritic chapter titles present;
  `<dc:title>` full-diacritic. (The 18.9 KB zip is DEFLATE on repetitive fixture
  prose, NOT truncation — verified by decompression.)
- **EPUB export:** OPF `<dc:title>` full-diacritic; **80/80 sentinels**; all 16
  titles; 22 xhtml files.
- **PDF export:** genuine %PDF-1.7, 100 pages, `/Info` title correct. (Prose is
  `/Type0`+`/CIDFont` glyph-encoded with a ToUnicode CMap; literal text not
  extractable without a PDF extractor lib — see NOT-TESTABLE note in SUMMARY.)
- **Reorder → re-export (D-03 non-regression):** full 16-chapter reversal
  (`reordered:16`, no fixed points); re-export docx twice → body XML
  **byte-identical** across runs (deterministic); **80/80 sentinels intact**;
  title order matches reversal; **every chapter's content stayed paired to its own
  title** (title_n precedes Zk{n}Alpha precedes Zk{n}Omega for all 16).
- **Autosave-at-scale:** 15 sequential stamped saves, versions monotonic 2→16,
  all 15 marks present in order, final readback byte-exact (9001==9001 chars).
Proof: `artifacts/{book-state,docx-epub-analysis,pdf-analysis,reorder-reexport,autosave-scale}.json`.

---

## New findings (this rejudge)

| Prov. ID | Sev | Finding |
|---|---|---|
| NEW-P7R-1 | S4 | **D-46 residual:** export filename fold drops non-decomposable Latin letters (Æ/Ø/Þ/ð/ß/ł) because NFD strips only combining marks. `"Ærø" → "r"` in `…Sao-Cafe-r-…`. Filename cosmetics; no content/metadata loss. A book titled e.g. "Łódź" or "Straße" would produce a badly mangled/near-empty stem (still safe via the `"book"` fallback, but user-hostile). |
| NEW-P7R-2 | S4 | **D-57 residual:** 9 book-scoped routes return bare `{"error":"Not found"}` for the book-ownership miss vs the standardized `"Book not found"` used by book/export/chapters/content/reorder. Routes: continuity (GET+DELETE), continuity/scan, continuity/intentional, character-chat, marketing-kit (×2), series-context, radar, daily-plan. Cosmetic copy inconsistency; correct 404 status, correct fencing. |
| NEW-P7R-3 | S4 (info) | **EPUB front-matter `<title>` residue (F10):** 2 front-matter xhtml files still show the raw split filename (`ch002.xhtml`, `ch004.xhtml`) as their reader-facing `<head><title>`. The F10 fix (`rewriteXhtmlTitleFromH1`) correctly restores all 16 real-chapter titles; front-matter files have no `<h1>` so they keep pandoc's filename default. Consistent with baseline note that F10 is "fixed for real chapter content". Very minor. |

Nothing S1–S3 new surfaced in the data-safety/export area. No data-loss, no crash,
no torn snapshot, no silent overwrite observed anywhere in this scope.
