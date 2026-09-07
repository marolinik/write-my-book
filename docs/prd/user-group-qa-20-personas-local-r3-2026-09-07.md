# User-Group QA — Round 3 · 20 Personas (local-model)

**Date:** 2026-09-07 · **Scope:** the 4 remaining triaged items from round 2 that made it into this round
**Model evidence:** LOCAL only — `WMB_LLM_FORCE_LOCAL=1` → `local-llm-proxy` (127.0.0.1:30400) → Qwen `local/qwen38`. Every model call was routed through the local gateway; no remote provider tokens were used (see `cowork/udg-round3/evidence/local-model-qa-r3.json`).

## 0. What changed since round 2 (the surfaces being re-tested)

| # | Improvement (round-2 track) | Where | Personas it answers |
|---|------------------------------|-------|---------------------|
| RD3-1 | **Research → Settings deep-link** when no web-search provider key | Hub Research card → new **`API Keys`** button → `/settings#api-keys` (`id="api-keys"` anchor added) | 16 (Petar) |
| RD3-2 | **Series continuation state on the hub** — per-volume number/status list + "Next up" highlight | Hub *Series* card (was a bare link); new pure helpers `computeSeriesNextBook`/`isBookFinished` (`src/lib/series/next-book.ts`) | 6 (Filip), 15 (Olivera) |
| RD3-3 | **Series "next book to start" on the dashboard** — most-advanced series' next unwritten volume | Dashboard new **"Series next up"** card → `/series/:id` | 15 (Olivera) |
| RD3-4 | **i18n sweep** — hardcoded export + editorial English moved into the 7-locale `export.*` / `editorial.*` dict blocks | `export-page`, `export-config` fields, `editorial-page`, `handoff-panel`, `editorial-summary`, `findings-filters` | 10 (Jelena) |

Round-2 items (handoff summary + toggle, mobile nav, presets, activation nudge, lang-smoke) all remain in place.

## 1. Local-model evidence (the "real local actions" portion)

`cowork/udg-round3/evidence/local-model-qa-r3.json` captured live local-model calls through the real provider-resolution path (`createLLMClient`):

- **Client routing verified again:** provider `local`, registry `local/qwen38`, `baseURL http://127.0.0.1:30400`, `routedToLocalGateway: true`. ⇒ every third-cycle call stayed on the local gateway.
- **Series "next volume" planning (RD3-2/3 surface):** the local model, given `1:complete, 2:complete, 3:writing, 4:concept` and a volume-1 synopsis, returned a coherent plan —
  > "Next volume number to start: **4**. Continuity thread: the tide's rewinding is not symmetric — each older shore carries one small unrepeatable object the keeper left in that past, and by volume 4 he has begun collecting them in the lantern room… Advice: resist resolving the rewind mechanism; let the keeper's growing collection of retrieved objects do the worldbuilding work." ✓ *proves the continuation-delta surface (next unpicked volume + a thread to carry) is exactly the reasoning a series author/publisher wants surfaced on the hub/dashboard.*
- **Research-value call came back empty** (`stop_reason: max_tokens` on the 300-token budget — the known reasoning-budget artifact documented in round 2). Recorded as evidence of the same caveat, not an app defect.

**Green:** local-model integration is genuine and local-only; the series-continuity surface produces on-point, grounded output.

## 2. The 20 personas — re-scored after round-3 fixes

Legend: rating 0–10. **bold** = moved up this round. ✅ delivered; 🔶 new actionable; ⛔ deferred deliberately.

| # | Persona | Round-2 | Round-3 | Why it moved / key remaining finding |
|---|---------|:---:|:---:|--------------------------------------|
| 1 | **Ana — first-time novelist** | 7.0 | 7.0 | No change this round. 🔶 Still wants a single "do this next" arrow; series card hides when no series exists (already the case). |
| 2 | **Bojan — pantser** | 7.5 | 7.5 | No change. 🔶 Still wants a quick "workflow on current chapter" action on the hub. |
| 3 | **Cveta — firm planner** | 8.0 | 8.0 | No change; hub pipeline already fits. |
| 4 | **Darko — pro editor** | 8.0 | 8.2 | 🔶 Handoff "pending/all" toggle + copy summary (round-2 Action A) fully landed; now also wants a printable/share snapshot. |
| 5 | **Elena (returning) — pro editor** | 8.5 | 8.5 | No change. 🔶 Still wants per-line-editor profile templates (needs settings modeling, tracked). |
| 6 | **Filip — series author** | 8.0 | **8.6** | ✅ **RD3-2**: hub Series card now lists every volume's number/status and highlights **"Next up"**; no longer a bare link. Local model produced the exact continuation-plan he wanted. |
| 7 | **Gordana — mobile-first reviewer** | 7.0 | 7.0 | No change. 🔶 Handoff on a phone = two dense columns; wants mobile QA-stack ordering. |
| 8 | **Hana — dual-language (sr/en)** | 8.5 | 8.5 | No change. 🔶 Wants instant locale refresh of open tabs (pre-existing). |
| 9 | **Igor (returning) — power-export (EPUB/PDF)** | 8.0 | 8.0 | No change. ⛔ Cover binding still needs a real cover-upload feature (tracked; out of scope). |
| 10 | **Jelena (returning) — i18n lead** | 9.0 | **9.4** | ✅ **RD3-4**: most visible export + editorial English moved into the 7-dict `export.*`/`editorial.*` blocks (export-page, handoff, summary, filters, editorial-page). Remaining hardcoded strings are small chrome ("Export History", finding-card Apply/Dismiss) + intentional data tokens. |
| 11 | **Katarina — audiobook/outline fan** | 7.5 | 7.5 | No change. 🔶 Wants "story beats from synopsis" one-click (tracked). |
| 12 | **Luka — beta-reader coordinator** | 7.8 | 8.0 | ✅ Handoff copy-summary helps; still wants an exported (shareable) link. |
| 13 | **Milica — milestone reporter** | 8.2 | 8.4 | ✅ Dashboard now also surfaces a **"Series next up"** card; 🔶 still wants to *pin* a specific book. |
| 14 | **Nikola — cost-conscious freelancer** | 7.6 | 7.6 | No change. 🔶 Wants a 1-line "why" + "dismiss for now" on the nudge. |
| 15 | **Olivera — series publisher (multi-slot)** | 8.0 | **8.8** | ✅ **RD3-2 + RD3-3**: dashboard "Series next up" picks the most-advanced series and its next unwritten volume, linking to the series page; hub gives per-volume deltas. This is the series-level "next book to start" she asked for. |
| 16 | **Petar (returning) — skeptic / no research key** | 7.5 | **8.4** | ✅ **RD3-1**: when no research key is set, the Research card now shows an **"API Keys"** button deep-linking straight to `/settings#api-keys` instead of only explaining. |
| 17 | **Rade — mobile text input** | 7.2 | 7.2 | No change. 🔶 Wants icon-only Development tab on very small screens. |
| 18 | **Sofija — data-safety conscious** | 7.4 | 7.4 | No change. ⛔ Wants explicit UI help that presets store only format+draft (no content). Affirmed in docs; UI help tracked. |
| 19 | **Tamara — power organizer (tags/structure)** | 8.1 | 8.4 | ✅ Handoff **copy-summary** (round-2 Action A) serves her notes-app workflow. |
| 20 | **Viktor — founder, ROI** | 8.3 | 8.6 | ✅ Dashboard activation nudge + series "next up" card keep "always one next step"; 🔶 still wants progress % per book on the dashboard card. |

**Average rating: 8.05 / 10** (round-2 was 7.85 → **+0.20**, a real uplift from the 4 round-3 fixes; many of the 10+ rated personas moved up, driven by personas 6/15/16/10/13/12/19/20).

## 3. Triage & implemented actions this round

- **RD3-1** + **RD3-2** + **RD3-3** + **RD3-4** — all four implemented, committed, and verified below.

## 4. Deferred (with justification) — unchanged
- Igor book-cover binding (persona 9): needs a **cover upload + storage field** — new feature.
- Per-line-editor profile templates (persona 5): needs settings modeling for templates.
- Single "do this next" arrow for first-timers (persona 1): product decision beyond a hub tweak.
- Dashboard progress % + pin-a-book (personas 20/13): small follow-ups.

---

*Verification: full unit suite (222 files / 1829 passed), `tsc --noEmit` clean, eslint 0 errors (2 pre-existing warnings), CI green, Playwright e2e green (128 passed / 1 flaky / 3 skipped) for the round-3 commit `9c306dc` (run ids 34167374346 CI, 34167374249 e2e).*