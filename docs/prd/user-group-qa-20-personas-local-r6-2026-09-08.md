# User-Group QA — Round 6 · 20 Personas (local-model)

**Date:** 2026-09-08 · **Scope:** next triaged batch toward 9/10
**Model evidence:** LOCAL only — `WMB_LLM_FORCE_LOCAL=1` → `local-llm-proxy` (127.0.0.1:30400) → Qwen `local/qwen38`. Routing re-proven (`cowork/udg-round6/evidence/local-model-qa-r6.json`, `routedToLocalGateway: true`); real model output captured for the whole-book beats surface.

## 0. What changed since round 5 (the surfaces being re-tested)

| # | Improvement | Where | Personas |
|---|-------------|-------|----------|
| R6-1 | **Cover GC + dimension pre-check** — deleting a book now removes its uploaded cover object from S3; the cover uploader rejects tiny/mis-ratio images client-side. | `route.ts` (DELETE) + `cover-uploader.tsx` | 9 Igor |
| R6-2 | **Printable book snapshot** — one-page status/analytics snapshot at `/books/:id/snapshot` (progress %, words, chapters, beta, streaks, health, chapter table) with Print / Save-as-PDF. | `snapshot/page.tsx` + `print-button.tsx` | 4 Darko |
| R6-3 | **Editorial brief snapshot** — printable/shareable editorial/beta-review one-pager at `/books/:id/editorial/snapshot` (severity summary + findings by chapter). | `editorial/snapshot/page.tsx` | 12 Luka |
| R6-4 | **Whole-book beats from synopsis** — new book-level `plan-chapters-from-synopsis` workflow (inline chapter-by-chapter outline, honest on small budgets), wired into the hub Plan-stage button. | `workflows.ts` + `prompt-assembler.ts` + `dev/page.tsx` | 11 Katarina |
| R6-5 | **Config-only reassurance** — explicit settings help: model/preference presets store only selections, never manuscript/document content. | book settings | 18 Sofija |

Note: same-auth owner-scoped read-only snapshots (R6-2/R6-3); account-less external share is deferred (it needs a real token model — no precedent, larger trust surface).

## 1. Local-model evidence

`cowork/udg-round6/evidence/local-model-qa-r6.json` re-verified routing (provider `local`, registry `local/qwen38`, baseURL `127.0.0.1:30400`). The **whole-book beats** surface (Katarina) produced a genuine chapter-by-chapter outline on the local model:
> "1. 'The Tide Runs Backward' — Hook: Keeper Maren notices the fog rolling inland… Escalate: A 19th-century clipper ship surfaces… Climax: …the face of Cael, the sailor who drowned six summers ago…"
> "2. 'Salt and Reruns' — Hook…"
Grounds that `plan-chapters-from-synopsis` yields a real outline at the local gateway. (`stop_reason: max_tokens`, 320-token reasoning-budget artifact, same caveat as prior rounds.)

## 2. The 20 personas — re-scored after round-6 fixes

| # | Persona | R5 | R6 | Why it moved / remaining |
|---|---------|:--:|:--:|--------------------------|
| 1 | Ana — first-time novelist | 7.8 | 7.8 | Round-5 start-here held. |
| 2 | Bojan — pantser | 8.1 | 8.1 | Round-5 keep-going held. |
| 3 | Cveta — firm planner | 8.2 | 8.2 | Fine. |
| 4 | **Darko — pro editor** | 8.4 | **8.9** | ✅ **R6-2** printable book-status one-pager to send/print. |
| 5 | Elena — pro editor | 8.9 | 8.9 | Round-4 profiles held. |
| 6 | Filip — series author | 9.0 | 9.0 | Round-4 continuity held. |
| 7 | Gordana — mobile editor | 7.9 | 7.9 | Round-4 polish held. |
| 8 | Hana — dual-language | 9.0 | 9.0 | Round-5 cross-tab sync held. |
| 9 | **Igor — power-export** | 8.5 | **8.8** | ✅ **R6-1** cover cleaned up on delete + sanity pre-check; 🔶 inline cover editor still a follow-up. |
| 10 | Jelena — i18n lead | 9.6 | 9.6 | All 7 dicts keep every new key. |
| 11 | **Katarina — outline fan** | 8.0 | **8.5** | ✅ **R6-4** beats for the WHOLE book, not just one chapter (local-model proof). |
| 12 | **Luka — beta coordinator** | 8.3 | **8.8** | ✅ **R6-3** printable/shareable editorial/beta brief. |
| 13 | Milica — milestone reporter | 8.7 | 8.7 | Round-4 pin held. |
| 14 | Nikola — cost-conscious | 8.0 | 8.0 | Round-5 dismiss held. |
| 15 | Olivera — series publisher | 9.1 | 9.1 | Round-4 series held. |
| 16 | Petar — no research key | 8.7 | 8.7 | Round-5 ResearchGate held. |
| 17 | Rade — mobile text input | 7.8 | 7.8 | Round-5 icon-only nav held. |
| 18 | **Sofija — data-safety** | 7.4 | **7.9** | ✅ **R6-5** settings now explicitly say presets store only config, never content. |
| 19 | Tamara — power organizer | 8.5 | 8.5 | Fine. |
| 20 | Viktor — founder, ROI | 8.9 | 8.9 | Round-4 progress % held. |

**Average rating: 8.56 / 10** (round-5 was 8.44 → **+0.12**; movers = Darko 4, Igor 9, Katarina 11, Luka 12, Sofija 18 — each maps to a shipped round-6 item).

## 3. Delivered
All 5 items (R6-1..R6-5) implemented, committed (`96b1ff3`), and verified below.

## 4. Deferred (unchanged, with a clear next step)
- **Account-less external share** (Luka 12 full version): the same-auth editorial-brief page is shipped; a truly account-less token page needs a `SharedSnapshot` model + `share/[token]` routes — larger trust surface, next increment.
- **Darko printable report already shipped** (R6-2); a richer full Reports print-out (recharts-based) stays a follow-up.
- **Igor inline cover editor** (crop/position) still open.

---

*Verification for `96b1ff3`: full unit suite 223 files / 1836 passed, `tsc` clean, eslint 0 errors, CI green (34224415006), Playwright e2e green (129 passed / 3 skipped / 0 failed, run 34224415019).*

---

### Appendix — the accelerated path
Six rounds: **7.85 → 8.05 → 8.28 → 8.44 → 8.56**, local model only, CI/E2E green every round. The three remaining open threads (account-less share with token model, richer print reports, inline cover editor) are the next candidates.