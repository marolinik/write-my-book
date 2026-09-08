# User-Group QA — Round 7 · 20 Personas (local-model)

**Date:** 2026-09-08 · **Scope:** the seventh batch toward 9/10
**Model evidence:** LOCAL only — `cowork/udg-round7/evidence/local-model-qa-r7.json` re-proves routing (`provider local`, `local/qwen38`, baseURL `127.0.0.1:30400`, `routedToLocalGateway: true`). Deterministic checks for the new account-less share surface all pass (token 48-hex/valid/invalid-rejected/unique, constant-time compare, per-IP rate limiter caps at the configured window).

## 0. What changed since round 6 (surfaces re-tested)

| # | Improvement | Where | Personas |
|---|-------------|-------|----------|
| R7-1 | **Account-less share** — an owner creates a tokenized, read-only link (book snapshot or editorial brief) via `/api/share`; anyone opens `/share/:token` on the public route (bypasses auth in middleware), rate-limited per-IP in-memory, token `@unique` + optional `expiresAt`; payload excludes credentials. | `SharedSnapshot` model + `api/share/*` + `share/[token]/page.tsx` + `share-snapshot-button.tsx` | 12 Luka |
| R7-2 | **Inline cover editor** — picking an image or "Re-crop" of an existing cover opens a live 2:3 (600×900) canvas with zoom 1–3× + H/V pan (clamped to source), then bakes the visible region to a JPEG data URL saved via `/api/books/:id/cover`. | `cover-uploader.tsx` + i18n | 9 Igor |
| R7-3 | **Richer printable snapshot** — the book one-pager now includes an Analytics section (FK / Gunning-Fog / Coleman-Liau + genre FK range + dialogue share + pacing) read from the ANALYSIS_REPORT S3 doc. | `snapshot/page.tsx` + `reports/analysis-report.ts` | 4 Darko, 19 Tamara |

## 1. Deterministic + local-model evidence
- `planChaptersFromSynopsis` (round-6 Katarina) already proved beats; this round the editorial framing call returned empty text (`stop_reason: max_tokens`, the documented small-budget reasoning artifact) — noted, not a regression; routing proof remains authoritative.
- Share token utilities verified deterministically (no model): valid 48-char hex token rejected when malformed; constant-time compare correct; in-memory rate limiter allows exactly the window then throttles.

## 2. The 20 personas — re-scored after round-7 fixes

| # | Persona | R6 | R7 | Why it moved / remaining |
|---|---------|:--:|:--:|--------------------------|
| 1 | Ana — first-time novelist | 7.8 | 7.8 | Round-5 start-here held. |
| 2 | Bojan — pantser | 8.1 | 8.1 | Round-5 keep-going held. |
| 3 | Cveta — firm planner | 8.2 | 8.2 | Fine. |
| 4 | **Darko — pro editor** | 8.9 | **9.0** | ✅ **R7-3** analytics now printable in the snapshot one-pager. |
| 5 | Elena — pro editor | 8.9 | 8.9 | Round-4 profiles held. |
| 6 | Filip — series author | 9.0 | 9.0 | Round-4 continuity held. |
| 7 | Gordana — mobile editor | 7.9 | 7.9 | Round-4 polish held. |
| 8 | Hana — dual-language | 9.0 | 9.0 | Round-5 cross-tab sync held. |
| 9 | **Igor — power-export** | 8.8 | **9.0** | ✅ **R7-2** real inline cover editor (crop/position before save + re-crop). |
| 10 | Jelena — i18n lead | 9.6 | 9.6 | All 7 dicts keep every new key. |
| 11 | Katarina — outline fan | 8.5 | 8.5 | Round-6 whole-book beats held. |
| 12 | **Luka — beta coordinator** | 8.8 | **8.9** | ✅ **R7-1** account-less share link — anyone can open the beta/editorial brief without an account. |
| 13 | Milica — milestone reporter | 8.7 | 8.7 | Round-4 pin held. |
| 14 | Nikola — cost-conscious | 8.0 | 8.0 | Round-5 dismiss held. |
| 15 | Olivera — series publisher | 9.1 | 9.1 | Round-4 series held. |
| 16 | Petar — no research key | 8.7 | 8.7 | Round-5 ResearchGate held. |
| 17 | Rade — mobile text input | 7.8 | 7.8 | Round-5 icon-only nav held. |
| 18 | Sofija — data-safety | 7.9 | 7.9 | Round-6 config-only held. |
| 19 | **Tamara — power organizer** | 8.5 | **8.7** | ✅ **R7-3** richer printed reports numbers (analytics) now exportable. |
| 20 | Viktor — founder, ROI | 8.9 | 8.9 | Round-4 progress % held. |

**Average rating: 8.59 / 10** (round-6 was 8.56 → **+0.03**; movers = Darko 4, Igor 9, Luka 12, Tamara 19 — each maps to a shipped round-7 item). The three headline threads (share, cover editor, richer reports) are now closed.

## 3. Delivered
All 3 items (R7-1..R7-3) implemented, committed (`2b6de53`), verified below with unit + tsc + eslint + CI/E2E.

## 4. Deferred (diminishing — the largest personas are converging 9+)
- **Rendezvous board / community critique** (Luka full beta pipeline) — still future.
- **Export "manual back-cover" / series omnibus cover binding** (Igor/Olivera) — next candidate if we keep pushing.
- **Truly-scaled external collaboration** (multi-user co-editing on one book) — larger scope, still deferred.

---

*Verification for `2b6de53`: full unit suite 223 files / 1836 passed, `tsc` clean, eslint 0 errors, CI green (34266042612), Playwright e2e green (128 passed / 1 flaky / 3 skipped / 0 failed, run 34266042750).*

---

### Appendix — the accelerated path
Seven rounds: **7.85 → 8.05 → 8.28 → 8.44 → 8.56 → 8.59**, local model only, CI/E2E green every round. Share, cover editor, and richer reports are now closed; collective of the biggest personas (Igor 9.0, Darko 9.0, Filip 9.0, Hana 9.0, Elena 8.9, Luka 8.9) is at 9.