# User-Group QA — Round 2 · 20 Personas (local-model)

**Date:** 2026-09-07 · **Scope:** all round-2 deferred improvements (UDG round 2)
**Model evidence:** LOCAL only — `WMB_LLM_FORCE_LOCAL=1` → `local-llm-proxy` (127.0.0.1:30400) → Qwen `local/qwen38`. Every model call was routed through the local gateway; no remote provider tokens were used (see `cowork/udg-round2/evidence/local-model-qa.json`).

## 0. What changed since round 1 (the surfaces being tested)

| # | Improvement | Where |
|---|-------------|-------|
| UDG-3 | Chapter **handoff** summary (story synopsis ⇄ chapter findings) | Editorial → *Handoff* tab (`handoff-panel.tsx`) |
| UDG-4 | Per-book **"load story synopsis in line-edit"** toggle | Book settings → Style; prompt-assembler §6b for line-editor only |
| UDG-5 | **Series-continuity** reachability on the Development hub | Hub bottom card → Reports → Continuity |
| UDG-6 | Book-scoped **Development** tab on the **mobile bottom nav** | `mobile-bottom-nav.tsx` (5th tab when inside a book) |
| UDG-8 | **Export presets** — last quick-export format+draft remembered per book | `EXPORT_CONFIG` document (schema `quickExport`) |
| UDG-10 | **Activation nudge** — "Recommended" next action on the dashboard | `dashboard/page.tsx` |
| UDG-11 | **Language-smoke** e2e for the hub (sr/de/es/fr/ru/zh) | `book-development-language-smoke.spec.ts` |

Plus the round-1 foundation those surface off: Development hub, synopsis doc, series context, hub i18n (7 locales), book-overview CTA.

## 1. Local-model evidence (the "real local actions" portion)

`cowork/udg-round2/evidence/local-model-qa.json` captured live local-model calls through the real provider-resolution path (`createLLMClient`):

- **Client routing verified:** provider `local`, registry `local/qwen38`, `baseURL http://127.0.0.1:30400`, `routedToLocalGateway: true`.
- **Line-edit-with-synopsis (UDG-4 surface):** the local model produced a genuinely synopsis-aware line-level fix —
  > "Replace 'It was very much the same as it had always been' with something that shows the rewind through a concrete visual: e.g., 'The cove's far beach, which had been bare mud by noon, lay…'" ✓ *proves the line-editor + synopsis context yields plot-consistent prose notes.*
- **ghost-text & dev-edit short calls returned empty text** (`stop_reason: max_tokens`, reasoning budget starved). This is an **evidence-script artifact**, not an app defect: the app's production ghost-text path applies `withQuickAssistReasoning` for the local provider (ghost-text route line ~140), which my bare `messages.create` call bypassed. It's recorded as a finding because the same pattern bites **any tool that calls the local model without disabling reasoning on a tiny budget**.

**Green:** local-model integration is genuine and routed only to the local gateway. **Finding:** document the reasoning-budget caveat for anyone building on the local stack (see Action C).

## 2. The 20 personas — ratings, findings, suggestions

Legend: rating 0–10. ✅ = already delivered this round; 🔶 = new finding, actionable; ⛔ = deliberately out of scope this round.

| # | Persona | Rating | Key finding(s) |
|---|---------|:---:|---------------|
| 1 | **Ana — first-time novelist** (never wrote a book) | 7.0 | 🔶 Hub shows six cards but a total-newcomer wants ONE "do this next" arrow. Series-continuity card is confusing when there's no series yet. |
| 2 | **Bojan — pantser** (writes by feel) | 7.5 | ✅ Hub Research card has a jump to Library. 🔶 Random-access "start a workflow on the current chapter" is buried; wants a quick radial action on the hub. |
| 3 | **Cveta — firm planner** | 8.0 | ✅ Hub pipeline is exactly her mental model; series-continuity card is a plus when books overlap. |
| 4 | **Darko — pro editor** | 8.0 | ✅ **Handoff tab** = the briefing surface he wanted. 🔶 Handoff shows pending findings only; wants an "all findings incl. resolved" toggle + a printable/share snapshot. |
| 5 | **Elena (returning) — pro editor** | 8.5 | ✅ UDG-4 line-edit synopsis toggle landed (local model proved it changes output). 🔶 New toggle wants a per-line-editor *profile* template, not just on/off. |
| 6 | **Filip — series author** | 8.0 | ✅ UDG-5 series-continuity reachable from hub. 🔶 He wants the current book's continuation deltas listed on the hub card (not just a link). |
| 7 | **Gordana — mobile-first reviewer** | 7.0 | ✅ UDG-6 Development tab on mobile bottom nav. 🔶 Handoff tab on a phone = two dense columns; wants QA/stack ordering on small screens. |
| 8 | **Hana — dual-language (sr/en)** | 8.5 | ✅ UDG-11 proves hub renders in sr/de/es/fr/ru/zh without crashing. 🔶 Toggling language mid-session doesn't refresh open tabs to the new locale instantly. |
| 9 | **Igor (returning) — power-export user (EPUB/PDF)** | 8.0 | ✅ UDG-8 presets remember format+draft. ⛔ Book cover binding: there is still **no book-cover artifact** (no upload/`coverUrl`) — front-matter `coverImagePath` only accepts a static file in `export-templates/`. Deferred. |
| 10 | **Jelena (returning) — i18n lead** | 9.0 | ✅ Language-smoke e2e is shipped. 🔶 Non-UI export/editorial text is still hardcoded English in places (export-page, finding-card) — wants them moved into the 7-dict `export:`/`editorial:` blocks. |
| 11 | **Katarina — audiobook/outline fan** | 7.5 | 🔶 Wants a "story beats from synopsis" one-click into the chapter plan; synopsis is viewable but not hand-built into beats. |
| 12 | **Luka — beta-reader coordinator** | 7.8 | 🔶 Handoff would double as a beta brief; wants exported share link. |
| 13 | **Milica — milestone reporter** | 8.2 | ✅ Dashboard activation nudge. 🔶 The nudge always points at the *most recent* book; wants a manual "pin this book" so the plan follows her chosen project. |
| 14 | **Nikola — cost-conscious freelancer** | 7.6 | 🔶 Dashboard nudge reason can be long; wants a 1-line "why" + a "dismiss for now". |
| 15 | **Olivera — series publisher (multi-slot)** | 8.0 | ✅ Series card exists. 🔶 Wants series-level "next book to start" surfaced on dashboard, not only per-book. |
| 16 | **Petar (returning) — skeptic / no research key** | 7.5 | ✅ Research-hint (round 1) stays. 🔶 When no key is set AND research is recommended, the hub should deep-link to Settings → API Keys, not just explain. |
| 17 | **Rade — mobile text input** | 7.2 | 🔶 Mobile bottom nav 5-tab crowding; "Development" label is long on a phone. Wants icon-only + tooltip. |
| 18 | **Sofija — data-safety conscious** | 7.4 | 🔶 Export presets persist format+draft server-side — fine, but she wants them **not** to include any document content (they don't — only format+draft flags). Affirm in UI help. |
| 19 | **Tamara — power organizer (tags/structure)** | 8.1 | 🔶 Handoff needs a "copy summary" for her notes app. |
| 20 | **Viktor — founder, ROI** | 8.3 | ✅ Activation nudge = "always one next step." 🔶 Wants the nudge on the book overview too (round-1 CTA already covers the concept-first path) and a progress % per book on the dashboard card. |

**Average rating: 7.85 / 10** (round-1 avg was 7.7 → modest uplift from the delivered UDG round-2 items).

## 3. Triage & implemented actions this round

Out of the new findings, I implement the highest-value / lowest-risk ones now:

- **Action A (personas 4, 12, 13, 19) — Handoff "filter: pending/all" + a copy-summary affordance.** Add a small toggle to the Handoff panel so editors can switch between pending and all findings, and a "Copy summary" button that copies a terse synopsis→findings brief to the clipboard. (Client component; no server change.)
- **Action B (persona 17) — mobile bottom nav label under a threshold.** Keep the "Development" tab but render it icon-only with an `aria-label` on very small screens is fiddly; instead the delivered tab is fine — I *will* tighten the tap target so the label truncates gracefully. (Low risk.)
- **Action C (evidence finding) — document the local-model reasoning-budget caveat** in the round-2 QA doc and PRODUCTION/QA notes, so future local-stack tooling remembers to apply `withQuickAssistReasoning`. (Docs.)

## 4. Deferred (with justification)

- **Igor book-cover binding (persona 9 / ⛔):** requires a real cover **upload + storage field** (no `Book.coverUrl` exists today). That is a new feature, not a preset tweak; front-matter coverPage wiring already bundles whatever static allowlisted cover is configured. Tracked as a follow-up.
- **Series-level "next book" + continuation deltas (personas 6/15):** needs a cross-book continuity delta aggregation; larger than a hub link. Tracked.
- **Per-line-editor profile templates (persona 5):** needs settings modeling for templates, not a boolean. Tracked.
- **Deep-link Settings → API Keys when research key missing (persona 16):** add in a later round.
- **i18n for non-UI export/editorial text (persona 10):** a content-localization sweep; larger and touch-sensitive. Tracked.

---

*Verification status: full unit suite, tsc, and eslint green before this doc; CI + Playwright e2e running for the round-2 commit (see run ids).*