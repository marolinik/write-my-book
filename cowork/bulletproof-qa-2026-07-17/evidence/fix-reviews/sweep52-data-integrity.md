# Sweep #52 — data-integrity + polish cluster (D-46/D-47/D-56/D-59/D-61)

Owner: opus-fix-7c. Check-first + TDD RED-first, minimal diff, immutable, NO-COMMIT (team-lead lands by pathspec).
Disjoint from src/lib/graph/** and src/lib/agents/** (untouched). D-57 skipped (already landed 51c1f29 per team-lead).

**Gates:** `npx tsc --noEmit` exit 0. Full `npx vitest run` = **1027 passed / 130 files, 0 failed**
(baseline 1005/129 → +1 test file, +10 my tests; remainder concurrent teammates, 0 regressions).

---

## D-59 [S4] — ALREADY FIXED on-branch (no-op)
Commit **409e7e3** `fix(api): api-key POST answers 200 on update, 201 only on create (D-59)`.
`src/app/api/settings/api-keys/route.ts:149-163` computes `keyAlreadyExists` from the pre-upsert
`findMany` and returns `status: keyAlreadyExists ? 200 : 201`. Verdict confirmed by read. No change.

## D-47 [S3, data-integrity] — ALREADY ADDRESSED for the real flow (no code; residual is deliberate)
CHECK-FIRST verdict: optimistic concurrency control is **already built and fires end-to-end** — this is
not an unbuilt-concurrency gap.
- Server: `PUT /api/books/[id]/chapters/[chapterId]/content` (route.ts:116-160) runs a CAS via
  `svc.update(..., data.expectedVersion)`; a stale stamp throws `VersionConflictError` → **409**
  `{ error: "version_conflict", currentVersion, serverContent }` — exactly what a two-tab dialog consumes.
- Schema: `updateChapterContentSchema.expectedVersion` (validation.ts:227-233), optional; comment documents
  "Omitted = last-write-wins (legacy)".
- Client: the real editor **sends** it — `manuscript-editor.tsx:535,563` stamps `expectedVersion` from
  `paneStore.documentVersion`; `save-conflict-dialog.tsx` renders the 409. Landed at **29af79e**
  (`feat: autosave optimistic locking`), which post-dates the P7 J-4 raw-PUT probe.
- The J-4 repro (5 concurrent PUTs all 200, 4 versions vanish) sent **unversioned** raw PUTs, hitting the
  intentional legacy last-write-wins path — not the app's path.

**Decision (STOP on the broad change, per your guidance):** the only way to make the J-4 raw-PUT probe get
409s is to make `expectedVersion` **mandatory** on every content PUT — a behavior change that breaks
legitimate legacy/agent/import writers that intentionally last-write-wins, i.e. the "broad refactor beyond a
minimal diff / don't half-build concurrency control" you said to STOP on. The real flow (editor + dialog) is
already protected. **Residual:** unversioned raw PUTs remain last-write-wins by design — register as
accepted/founder-decision, not a code change. Existing conflict-dialog flow untouched.

## D-46 [S3] — FIXED — `src/lib/import-export/export-pipeline.ts`
Root cause `:616` — `bookName.replace(/[^a-zA-Z0-9-_ ]/g, "")` stripped every diacritic ("Kőszeg"→"Kszeg").
Fix: new pure helper `sanitizeExportFilename()` — NFD-decompose, strip combining marks (`[̀-ͯ]`),
then drop remaining non-ASCII, spaces→hyphens, trim edge hyphens, fall back to `"book"` if empty. Transliterates
(ő→o, é→e, ö→o) instead of dropping; keeps filenames ASCII end-to-end so the download route's `..`/`/\` guards
and `Content-Disposition` header stay valid (route not touched). ASCII titles are byte-identical to before.
Wired at the `outputFilename` construction site.
Tests: `tests/unit/export-filename-pages.test.ts` (5) — Kőszeg→Koszeg, ASCII passthrough, Latin fold spread,
no `/\..`, non-Latin/empty→"book".

## D-61 [S3] — FIXED — `src/lib/import-export/export-pipeline.ts`
Root cause `:612` — `Math.ceil(wordCount / 350)`: single divisor, error scales with length (81,095 w → 232 est
vs 165 actual, +40.6%; P7 Bao live, Z15/B3). Fix: new pure helper `estimateRenderedPages()` = two-parameter
model `FRONT_MATTER_PAGES(5) + ceil(words / BODY_WORDS_PER_PAGE(500))`. Calibrated on both measured anchors:
(6,187 w → 17 pp) gives 18 (+5.9%); (81,095 w → 165 pp) gives 168 (+1.8%) — both inside the QA 15% threshold,
vs the old 232 (+40.6%). Front-matter offset is physically grounded (the export's title/copyright/half-title
pages; the EPUB evidence itself shows 4 near-empty front-matter sections). Wired at the `estimatedPages` site.
Tests: `tests/unit/export-filename-pages.test.ts` (4) — both anchors within 15%, D-61 gap closed (est<200),
monotonic/non-negative.

## D-56 [S4] — FIXED — `src/app/api/books/[id]/batch/route.ts`
Root cause: POST parsed+validated the body (`createBatchSchema.parse` → 400) BEFORE the ownership fence
(`findFirst` → 404), so a non-owned/nonexistent book with a malformed body leaked 400 vs 404 (existence-hiding
break). Fix: reorder — ownership fence runs first; `parseJsonBody` + schema.parse moved after. Owned-book bad
body still 400; non-owned uniformly 404.
Test: `tests/unit/batch-route.test.ts` — "D-56: non-owned book with an invalid body returns 404, not 400".
(RED signature was doubly telling: the probe's `mockResolvedValueOnce(null)` leaked into the next test because
`findFirst` was never reached pre-fix; the reorder consumes it and both go green.)

## Files touched
- `src/lib/import-export/export-pipeline.ts` (D-46 + D-61: two exported pure helpers + two call sites)
- `src/app/api/books/[id]/batch/route.ts` (D-56 reorder)
- `tests/unit/export-filename-pages.test.ts` (new, 9)
- `tests/unit/batch-route.test.ts` (+1 D-56 test)
