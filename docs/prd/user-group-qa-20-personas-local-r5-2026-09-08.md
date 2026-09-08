# User-Group QA — Round 5 · 20 Personas (local-model)

**Date:** 2026-09-08 · **Scope:** next triaged batch toward 9/10
**Model evidence:** LOCAL only — `WMB_LLM_FORCE_LOCAL=1` → `local-llm-proxy` (127.0.0.1:30400) → Qwen `local/qwen38`. Routing re-proven (`cowork/udg-round5/evidence/local-model-qa-r5.json`, `routedToLocalGateway: true`); real model output captured for the Katarina beats surface.

## 0. What changed since round 4 (the surfaces being re-tested)

| # | Improvement | Where | Personas |
|---|-------------|-------|----------|
| R5-1 | **Guided "Start here" arrow** — a single highlighted banner above the six stage cards pointing at THE next step + its action (concept-first path). | `dev/page.tsx` | 1 Ana |
| R5-2 | **Story beats from synopsis** — one-click button on the Plan card seeding the `plan-chapter` workflow with a beats prompt; `StartWorkflowButton` now forwards an `initialMessage`. | `dev/page.tsx` + `start-workflow-button.tsx` | 11 Katarina |
| R5-3 | **"Keep going" next-chapter block** — hub deep-links the next unfinished chapter into the editor. | `dev/page.tsx` | 2 Bojan |
| R5-4 | **Dismiss-for-today + Undo** on the dashboard Recommended nudge (localStorage per book, rolls daily; the 1-line "why" already existed). | `dashboard/page.tsx` + `nudge-dismiss.tsx` | 14 Nikola |
| R5-5 | **Real book-cover upload** — `Book.coverUrl` (schema+db push), `PUT/GET/DELETE /api/books/:id/cover` (S3 bytes), `CoverUploader` on book settings, and binding into PDF/EPUB front matter + EPUB metadata from S3. | schema + route + `cover-uploader.tsx` + export pipeline | 9 Igor |
| R5-6 | **Icon-only mobile/tab labels** under 400 px — bottom-nav labels hide on very small screens so `Entwicklung`/`Développement` don't crowd. | `mobile-bottom-nav.tsx` | 17 Rade |
| R5-7 | **Live locale refresh across open tabs** — `BroadcastChannel("wmb:language")` sync (intra-tab was already reactive). | `use-language.ts` + `language-provider.tsx` | 8 Hana |

## 1. Local-model evidence

`cowork/udg-round5/evidence/local-model-qa-r5.json` re-verified routing (provider `local`, registry `local/qwen38`, baseURL `127.0.0.1:30400`). The **synopsis→beats** surface (Katarina) produced real content on the local model:
> "**Hook:** On a salt-worn night, Maren watches a 1923 trawler glide backward out of the cove, its wake un-frothing…"
Grounds that the "generate beats" action strips an actionable beat out of a synopsis at the local gateway.

## 2. The 20 personas — re-scored after round-5 fixes

| # | Persona | R4 | R5 | Why it moved / remaining |
|---|---------|:--:|:--:|--------------------------|
| 1 | **Ana — first-time novelist** | 7.2 | **7.8** | ✅ **R5-1** a single "Start here" arrow above the six cards answers "what do I do now?". |
| 2 | **Bojan — pantser** | 7.6 | **8.1** | ✅ **R5-3** "Keep going" deep-links the next unfinished chapter into the editor. |
| 3 | Cveta — firm planner | 8.2 | 8.2 | 🔶 Fine; already happy with structure. |
| 4 | Darko — pro editor | 8.4 | 8.4 | 🔶 Still wants a printable/share snapshot (tracked). |
| 5 | Elena — pro editor | 8.9 | 8.9 | Round-4 profiles held steady. |
| 6 | Filip — series author | 9.0 | 9.0 | Round-4 continuity held. |
| 7 | Gordana — mobile editor | 7.9 | 7.9 | Round-4 handoff polish held. |
| 8 | **Hana — dual-language** | 8.5 | **9.0** | ✅ **R5-7** changing language in one tab now live-refreshes other open tabs (no manual reload). |
| 9 | **Igor — power-export** | 8.0 | **8.5** | ✅ **R5-5** real cover upload flows into PDF/EPUB front matter + EPUB metadata; 🔶 no inline cover editor yet. |
| 10 | Jelena — i18n lead | 9.6 | 9.6 | All 7 dicts covered by every new key. |
| 11 | **Katarina — outline fan** | 7.6 | **8.0** | ✅ **R5-2** one-click "generate beats from synopsis" (local-model proof). |
| 12 | Luka — beta coordinator | 8.3 | 8.3 | 🔶 Exported share link still open. |
| 13 | Milica — milestone reporter | 8.7 | 8.7 | Round-4 pin held. |
| 14 | **Nikola — cost-conscious** | 7.7 | **8.0** | ✅ **R5-4** dismiss-for-today keeps the "why" obvious but not nagging. |
| 15 | Olivera — series publisher | 9.1 | 9.1 | Round-4 continuity held. |
| 16 | Petar — no research key | 8.7 | 8.7 | Round-4 ResearchGate held. |
| 17 | **Rade — mobile text input** | 7.4 | **7.8** | ✅ **R5-6** bottom-nav icon-only under 400 px; long labels no longer crowd. |
| 18 | Sofija — data-safety | 7.4 | 7.4 | ⛔ Wants explicit UI help that presets store format+draft only (affirmed in docs). |
| 19 | Tamara — power organizer | 8.5 | 8.5 | Fine. |
| 20 | Viktor — founder, ROI | 8.9 | 8.9 | Round-4 progress % held. |

**Average rating: 8.44 / 10** (round-4 was 8.28 → **+0.16**; movers = Ana 1, Bojan 2, Hana 8, Igor 9, Katarina 11, Nikola 14, Rade 17 — each maps to a shipped round-5 item).

## 3. Delivered
All 7 items (R5-1..R5-7) implemented, committed (`2610221`), and verified below.

## 4. Deferred (unchanged, with justification)
- Igor cover inline editor / dimensions validation (9): follow-up, upload+capture works now.
- "Story beats" is per-chapter via `plan-chapter`; a dedicated book-level `plan-chapters-from-synopsis` workflow stays a follow-up.
- Darko printable/share snapshot, Luka exported share link, Sofija preset-content help: small remaining gaps.

---

*Verification for `2610221`: full unit suite 223 files / 1836 passed, `tsc` clean, eslint 0 errors, CI green, Playwright e2e green (129 passed / 3 skipped / 0 failed) — runs 34220245306 (CI) + 34220245256 (e2e).*

---

### Appendix — the accelerated path
Five rounds have moved the average 7.85 → 8.05 → 8.28 → 8.44 while staying on the local model and keeping CI/E2E green every round. The remaining open threads (inline cover editor, behind-workbook share, printable report, story-bible→beats workflow) are the next candidates.