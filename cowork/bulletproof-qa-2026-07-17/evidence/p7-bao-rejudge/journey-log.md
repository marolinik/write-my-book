# P7 Bao — REJUDGE journey log (2026-07-20)

Executor: independent evidence-capture. Live product on http://localhost:3002,
auth via `x-e2e-test-secret` (from process.env, never printed) + `x-e2e-clerk-id:
user_qa_p7`. Worker: exactly one BullMQ worker at capture (`worker-proof.txt`).
All API/analysis driven by `npx tsx --env-file=.env scripts/*.ts`.

## 0. Environment reconnaissance
- Server PID 53220 on :3002 (next start-server). Worker tree: npx(31644) → tsx
  cli(28224) → node worker(61892) = one logical worker.
- Tools: pandoc + typst present (real docx/pdf/epub export exercised). No
  pdftotext/pypdf/pymupdf in env → PDF prose extraction handled by a hand-rolled
  zlib inflater for structure/metadata; glyph-level text NOT extractable (noted).
- Read the fixed source before driving: export-pipeline.ts (sanitizeExportFilename
  NFD fold, estimateRenderedPages two-param model, typst `set document(title)`),
  content/route.ts (D-47 `expectedVersion` requirement for interactive writers),
  book/route.ts DELETE ("Book not found"), continuity/route.ts (bare "Not found").

## 1. Create + structured import (scripts/01_create_import.ts)
- POST /api/books → 201, bookId 85c3d2c4…, firstChapterId ed869e2e….
- POST /import (structured JSON, 16 chapters, diacritic prose, action=create) →
  200 `{created:16, totalWordCount:51291, chapterCount:16}`.
- GET book → wordCount 51291 == expected exactly. Saved expected-chapters.json
  (source-of-truth content + sentinels) and book-state.json.

## 2. Export docx/pdf/epub (scripts/02_export.ts)
- All three POST /export → 200, no warnings, no markdown fallback.
  - docx: filename `The-Koszeg-Manuscript-Bao-Rejudge-P7-Sao-Cafe-r-…docx`,
    wordCount 51436, estimatedPages 108; downloaded 18,901 bytes.
  - pdf: wordCount 51436, estimatedPages 108; downloaded 773,741 bytes.
  - epub: wordCount 51436; downloaded 44,121 bytes.
- First read of the small docx size looked alarming; resisted concluding
  "truncation" and instead decompressed to verify (see step 3) — it was DEFLATE on
  repetitive fixture prose.
- **D-46 observed in filename:** `Kőszeg → Koszeg` (fixed); `Ærø → r` (residual).

## 3. DOCX + EPUB decompressed analysis (scripts/03_analyze_docx_epub.ts, jszip)
- DOCX: document.xml 329,003 chars / 51,422 words; **80/80 sentinels, order OK**;
  16/16 titles; `<dc:title>` full diacritics == book name.
- EPUB: OPF title full diacritics == book name; **80/80 sentinels**; 16/16 titles;
  22 xhtml files. Two front-matter files show `ch002.xhtml`/`ch004.xhtml` as
  head-title (F10 front-matter residue, NEW-P7R-3).

## 4. PDF metadata + page count (scripts/04_analyze_pdf.ts, 04b_pdf_textprobe.ts)
- Inflated 107 flate streams. **/Info /Title present** (UTF-16BE) full diacritics
  == book name → **D-05 CLOSED**.
- Page count 100 (100 `/Type /Page` objs AND `/Count 100` agree). estimate 108 →
  **+8.0% gap, within 15% → D-61 CLOSED** (baseline +40.6%).
- Text-recoverability probe: sentinels absent, `/Type0`+`/CIDFont`+`ToUnicode`
  present → glyph-encoded; PDF prose truncation not directly testable here.
  Indirect assurance: same assembled source as word-exact docx/epub; 100 pages
  proportional to 51K words (~514 w/pg at 11pt).

## 5. Concurrency / D-47 (scripts/05_concurrency.ts, ch8)
- Scenario A: 5 stampless concurrent PUTs → 409×5, content+version unchanged, all
  recoverable → PASS.
- Scenario B: 5 stamped-at-v1 concurrent PUTs → 200×1 (winner v→2) + 409×4, saved
  == winner payload exactly, no interleaving, losers recoverable → PASS.

## 6. Autosave-at-scale (scripts/06_autosave_scale.ts, ch12)
- 15 sequential stamped saves, versions 2→16 monotonic, all marks in order, final
  readback byte-exact → PASS.

## 7. Reorder + re-export (scripts/07_reorder_reexport.ts)
- Restored ch8+ch12 (overwritten by steps 5-6) to original prose via stamped PUT.
- Full 16-chapter reversal (`reordered:16`). Re-export docx ×2 → body XML
  byte-identical (deterministic). 80/80 sentinels intact; title order == reversal;
  D-03 content↔title pairing intact for all 16 → PASS.

## 8. Delete drill / D-57 (scripts/08_delete_drill.ts)
- DELETE book → 200 {deleted:true}. 17 post-delete probes → all 404 (clean; no
  stale reads, no 500s). Distinct 404 copy = {"Book not found","Not found"} →
  D-57 PARTIAL; `GET /continuity` = "Not found". Grep confirmed 9-route residual.

## 9. Hygiene
- worker-proof.txt captured (1 worker). Secret scan (99_secret_scan.ts): OpenRouter
  + OpenAI keys 0 hits; E2E_TEST_SECRET 1 hit = coincidental substring of the
  mandatory `x-e2e-test-secret` header-name literal (dev placeholder value
  "test-secret", 11 chars) in lib.ts — NOT a disclosed secret value. Confirmed
  against src/lib/auth.ts:56 (same header constant). secretsClean = true.
