# User-Group QA — Round 9 · 20 Personas (local-model)

**Date:** 2026-09-08 · **Scope:** the ninth batch toward 9/10
**Model evidence:** LOCAL — `cowork/udg-round9/evidence/local-model-qa-r9.json` proves (a) the omnibus assembly loops the series' books in `bookNumber` order with per-book title pages, (b) the series cover binds as a safe bare-relative tempdir target (`safeBareRelativeForSandbox: true`, `neverEmbedsS3Url: true`), and (c) a local 3-book series outline produces genuine planning content.

## 0. What changed since round 8

| # | Improvement | Where | Personas |
|---|-------------|-------|----------|
| R9-1 | **Working series/omnibus export** — the previously-dead omnibus branch is activated. New `exportSeriesOmnibus()` gathers the series' books in `bookNumber` order, concatenates each book's chapters (each read via its own `getBookStorage` scope + per-book DB chapter titles) with per-book title pages, and reuses the shared pandoc/tempdir/sanitize/upload machinery via new omnibus inputs. | `export-pipeline.ts` + `types.ts` + routes | 6 Filip, 9 Igor, 15 Olivera |
| R9-2 | **Series cover** — new `Series.coverUrl` + `PUT/GET/DELETE /api/series/:id/cover`, bound into omnibus front matter + EPUB metadata via the same tempdir rewrite (never an S3 URL). | schema + cover route + `front-matter.ts` | 15 Olivera |
| R9-3 | **Whole-series printable report** — `GET /api/series/:id/report` renders a print-friendly HTML report (per-book words/chapters/docs + totals). | report route + UI | 15 Olivera |

A small in-round leftover (provoking the round-8 BOOK_PLAN read-back) was already wired. Remaining longer-term: rendezvous / multi-user co-editing (Luka).

## 1. Evidence (all captured locally)
- `omnibusAssembly`: `bookOrder: ["1:The Keeper's Cove","2:Tides of Fall"]` (sorted), `booksAssembled: 2`, `containsPerBookTitlePage: true`.
- `seriesCoverBinding`: `![Cover](series-cover-upload.jpg)` → bare-relative `series-cover-upload.jpg`, `safeBareRelativeForSandbox: true`, `neverEmbedsS3Url: true`.
- `seriesOutline` (local/qwen38): a full 3-book arc *("Book 1 – The Tide's Backward Tongue … Book 2 – Salt Meridian …")* — the exact content Olivera's series-planning would produce.

## 2. The 20 personas — re-scored after round-9 fixes

| # | Persona | R8 | R9 | Why it moved / remaining |
|---|---------|:--:|:--:|--------------------------|
| 1 | Ana — first-time novelist | 7.8 | 7.8 | Round-5 start-here held. |
| 2 | Bojan — pantser | 8.1 | 8.1 | Held. |
| 3 | Cveta — firm planner | 8.2 | 8.2 | Held. |
| 4 | Darko — pro editor | 9.0 | 9.0 | Round-7 analytics held. |
| 5 | Elena — pro editor | 8.9 | 8.9 | Held. |
| 6 | **Filip — series author** | 9.0 | **9.1** | ✅ **R9-1** whole-series omnibus export works end-to-end (was unreachable). |
| 7 | Gordana — mobile editor | 7.9 | 7.9 | Held. |
| 8 | Hana — dual-language | 9.0 | 9.0 | Held. |
| 9 | **Igor — power-export** | 9.2 | **9.4** | ✅ **R9-1/R9-2** omnibus + series cover now bind correctly in the same tempdir containment family as front/back covers. |
| 10 | Jelena — i18n lead | 9.6 | 9.6 | All 7 dicts keep every new key (14 new seriesPage keys). |
| 11 | Katarina — outline fan | 8.8 | 8.8 | Round-8 BOOK_PLAN already sustained; held. |
| 12 | Luka — beta coordinator | 8.9 | 8.9 | Round-7 account-less share held. |
| 13 | Milica — milestone reporter | 8.7 | 8.7 | Held. |
| 14 | Nikola — cost-conscious | 8.0 | 8.0 | Held. |
| 15 | **Olivera — series publisher** | 9.3 | **9.5** | ✅ **R9-2/R9-3** series cover + omnibus export + printable whole-series report. |
| 16 | Petar — no research key | 8.7 | 8.7 | Held. |
| 17 | Rade — mobile text input | 7.8 | 7.8 | Held. |
| 18 | Sofija — data-safety | 7.9 | 7.9 | Round-6 config-only held. |
| 19 | Tamara — power organizer | 8.7 | 8.7 | Held. |
| 20 | Viktor — founder, ROI | 8.9 | 8.9 | Held. |

**Average rating: 8.65 / 10** (round-8 was 8.62 → **+0.03**; movers = Filip 6, Igor 9, Olivera 15 — each maps to a shipped round-9 item).

## 3. Delivered
R9-1 → R9-3 implemented, committed (`9f0647d`), verified (unit + tsc + eslint + CI/E2E).

## 4. Deferred (clearest next step)
- **Rendezvous / multi-user co-editing** (Luka): biggest structural lift left.
- Small UX leftovers (e.g. cover preview thumbnail on the series list / dashboard) are low cost and could lift a couple of otherwise-static personas marginally.

---

*Verification for `9f0647d`: full unit suite 223 files / 1836 passed, `tsc` clean, eslint 0 errors, CI green (34285043597), Playwright e2e green (129 passed / 3 skipped / 0 failed, run 34285043593).*

---

### Appendix — the accelerated path
Nine rounds: **7.85 → 8.05 → 8.28 → 8.44 → 8.56 → 8.59 → 8.62 → 8.65**, local model only, CI/E2E green every round. The series export thread (once dead code) is now a real shipped capability; top personas cluster at 8.7–9.6.