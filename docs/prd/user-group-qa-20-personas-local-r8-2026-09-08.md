# User-Group QA — Round 8 · 20 Personas (local-model)

**Date:** 2026-09-08 · **Scope:** the eighth batch toward 9/10
**Model evidence:** LOCAL only — `cowork/udg-round8/evidence/local-model-qa-r8.json` re-proves routing (`local/qwen38` @ `127.0.0.1:30400`, `routedToLocalGateway: true`), produces a genuine whole-book beat sheet (that now gets persisted as BOOK_PLAN), and deterministically verifies the export back-cover binding branch (the `back-cover-upload.<ext>` placeholder rewrite is a permitted bare-relative image target that passes the sanitizer).

## 0. What changed since round 7

| # | Improvement | Where | Personas |
|---|-------------|-------|----------|
| R8-1 | **Back cover in exports** — new `Book.backCoverUrl`, `PUT/GET/DELETE /api/books/:id/back-cover`, `BackCoverUploader` in book settings, and a trailing back-cover page in EPUB/PDF (same `--sandbox` tempdir rewrite + containment). Critically, also **threaded `book.coverUrl` + `backCoverUrl` through the export route** — the round-5 front-cover S3 binding was dead in production; it now actually works. | `back-cover/route.ts` + `back-cover-uploader.tsx` + `export-pipeline.ts` + `export/route.ts` + settings | 9 Igor, 15 Olivera |
| R8-2 | **Persisted whole-book plan** — `plan-chapters-from-synopsis` now also saves a book-level `BOOK_PLAN` document (new `DocumentType.BOOK_PLAN` + `getStoragePath` case) when a complete outline is produced (conditional `WriteDocument`); the workflow intentionally keeps **no** `producesDocument` so empty local-budget runs stay honest (no artifact-contract failed gate). The hub plan stage surfaces the saved plan via `viewArtifactId`. | enum + `storage-keys.ts` + `prompt-assembler.ts` + `dev/page.tsx` | 11 Katarina |

Not acted on this round (diminishing): a printable **whole-series** report for Olivera and a series/omnibus cover (the series-export path itself is currently unreachable from any route — noted in the round-7 research; deferred as a larger piece).

## 1. Evidence
- `planChaptersForBookPlan` returned a real outline on the local model: *"1. 'The Keeper's Tide' — … the ocean pulling its own wave-crashes backward at dusk; she finds a barnacle-encrusted logbook from 1987 … 2. 'The Rewind Season' — The cove's time-slip accelerates …"* — exactly the content that now persists as BOOK_PLAN.
- Deterministic export check passes: `![Back Cover](back-cover-upload.jpg)` rewrites to a bare-relative same-dir target that the manuscript sanitizer permits (`manuscriptKeptBySanitizer: true`), keeping `--sandbox` containment (never an S3 URL in the manuscript).

## 2. The 20 personas — re-scored after round-8 fixes

| # | Persona | R7 | R8 | Why it moved / remaining |
|---|---------|:--:|:--:|--------------------------|
| 1 | Ana — first-time novelist | 7.8 | 7.8 | Round-5 start-here held. |
| 2 | Bojan — pantser | 8.1 | 8.1 | Round-5 keep-going held. |
| 3 | Cveta — firm planner | 8.2 | 8.2 | Fine. |
| 4 | Darko — pro editor | 9.0 | 9.0 | Round-7 analytics held. |
| 5 | Elena — pro editor | 8.9 | 8.9 | Round-4 profiles held. |
| 6 | Filip — series author | 9.0 | 9.0 | Round-4 continuity held. |
| 7 | Gordana — mobile editor | 7.9 | 7.9 | Round-4 polish held. |
| 8 | Hana — dual-language | 9.0 | 9.0 | Round-5 cross-tab sync held. |
| 9 | **Igor — power-export** | 9.0 | **9.2** | ✅ **R8-1** back cover now binds into PDF/EPUB exports too (and the front-cover S3 binding finally works in production). |
| 10 | Jelena — i18n lead | 9.6 | 9.6 | All 7 dicts keep every new key (back-cover keys added to all). |
| 11 | **Katarina — outline fan** | 8.5 | **8.8** | ✅ **R8-2** the whole-book outline is now PERSISTED as a viewable BOOK_PLAN document, not only inline chat. |
| 12 | Luka — beta coordinator | 8.9 | 8.9 | Round-7 account-less share held. |
| 13 | Milica — milestone reporter | 8.7 | 8.7 | Round-4 pin held. |
| 14 | Nikola — cost-conscious | 8.0 | 8.0 | Round-5 dismiss held. |
| 15 | **Olivera — series publisher** | 9.1 | **9.3** | ✅ **R8-1** cover binding groundwork (front+back now export); series/omnibus cover still a follow-up. |
| 16 | Petar — no research key | 8.7 | 8.7 | Round-5 held. |
| 17 | Rade — mobile text input | 7.8 | 7.8 | Round-5 icon-only nav held. |
| 18 | Sofija — data-safety | 7.9 | 7.9 | Round-6 config-only held. |
| 19 | Tamara — power organizer | 8.7 | 8.7 | Round-7 richer reports held. |
| 20 | Viktor — founder, ROI | 8.9 | 8.9 | Round-4 progress % held. |

**Average rating: 8.62 / 10** (round-7 was 8.59 → **+0.03**; movers = Igor 9, Katarina 11, Olivera 15 — each maps to a shipped round-8 item).

## 3. Delivered
Both items (R8-1, R8-2) implemented, committed (`3a1a7a8`), verified below (unit + tsc + eslint + CI/E2E).

## 4. Deferred (with the clearest next step)
- **Series/omnibus cover + whole-series export** (Olivera/Igor): the series-export route is currently unreachable — a real `Series.coverUrl` + `/api/series/:id/export` (omnibus) is the next candidate.
- **Rendezvous board / multi-user co-editing** (Luka full pipeline).

---

*Verification for `3a1a7a8`: full unit suite 223 files / 1836 passed, `tsc` clean, eslint 0 errors, CI green (34280320665), Playwright e2e green (129 passed / 3 skipped / 0 failed, run 34280320410).*

---

### Appendix — the accelerated path
Eight rounds: **7.85 → 8.05 → 8.28 → 8.44 → 8.56 → 8.59 → 8.62**, local model only, CI/E2E green every round. The export-cover thread (front+back now bound) is closed; the big personas are tightly clustered at 8.7–9.6.