# P1 "Maya" — UI evidence re-capture (2026-07-26)

Persona **P1 (Maya)** · Book **"The Salt Letters QA P1"** `4116055c-6183-4675-926a-e04f31126951` · Chapter 1 `ed84e638-0436-4cee-a458-669ce81cad50` (704 words, `dev_edited`). BYOK OpenRouter, default `openrouter-qwen36/sonnet`.

Goal: supply the missing UI evidence that pins P1 at 6.0 — for two fixes that already shipped:
- **D-104** blank discuss bubbles (fixed `2d715ee`)
- **D-107** duplicate pending findings (fixed `cfe622a`)
- plus **D-113** report metadata (fixed `cfe622a`) and **D5-adjacent** return-writer dashboard.

Harness: Playwright (repo `@playwright/test`, chromium headless, viewport 1280×900 unless noted), `extraHTTPHeaders {x-e2e-test-secret, x-e2e-clerk-id: user_qa_p1}` (secret read from `.env` at runtime, never written/printed). `nextjs-portal{display:none}` injected after every load. Dev server `http://localhost:3001` (not restarted). Nothing committed; all artifacts left in the working tree.

---

## Shot inventory

| Shot | File | What it proves |
|------|------|----------------|
| 42a | `42a-discuss-thread.png` / `-full.png` | D-104: finding `036a088d` discuss thread, turns 1–2 — **both assistant bubbles render full visible prose (450 & 420 chars); no blank/empty bubble**. Also exposes a NEW defect (raw `<<<REMEMBER>>` control block leaking into the bubble — see below). |
| 42a (contrast) | `42a-discuss-constraint-chip.png` | D-104 intended behavior: finding `b92055ea` discuss reply that emitted a **correctly-formatted** `<<<REMEMBER>>>` — renders the clean "On 'Keep as-is', I'll remember: …" chip, **0 leaked blocks**. |
| 42b | `42b-discuss-capped.png` / `-full.png` | D-104: `036a088d` after turn 3 → **3 exchanges, 3 non-blank assistant bubbles**; turn 3 returned a structured `<<<REVISION>>>` that renders as the **AI Rewrite Comparison** card (original 50w vs rewrite 42w diff) — structured-only content renders visibly, never blank. Shows the "3-exchange cap reached" notice (input replaced by cap message). |
| 42c before | `42c-findings-before.png` | D-107 defect state in live data: **3 near-identical pending `show-tell` findings** on the same shoreline anchor (`036a088d`, `5c20c0e1`, `73b2781c`) + 1 dismissed sibling — pre-fix accumulation. |
| 42c after | `42c-findings-after.png` | D-107 outcome after a fresh dev-edit rerun (run 2): **show-tell cluster still exactly 3** (no new identical-anchor duplicate). Findings 10→11: exactly one new finding created. |
| 42d before | `42d-report-stale-prefix.png` | D-113 defect: current DEV_EDIT_REPORT header **"Edit Date: 2025 / Chapter Word Count: ~570 words"** (real chapter = 704 words). Written 2026-07-20, before the fix commit. |
| 42d after | `42d-report-fresh.png` | D-113 fresh report (run 2, same doc id, rewritten today). See D-113 section — nuanced result. |
| 42d library | `42d-documents-list.png` | Documents/Library surface listing the reports + foundation docs. |
| 42e | `42e-dashboard.png` | D5-adjacent return-writer Writing Dashboard: **Total Words 704**, Story Health 77%, Editorial Coverage 1/1, "6 findings need review", populated stat tiles + 30-day chart + goals. |
| 42e | `42e-book-overview.png` | Book overview surface. |

---

## Per-shot status

### 42a / 42b — D-104 (discuss, no blank bubble) — CAPTURED, fix confirmed
- Target finding `036a088d` (pending, show-tell, 0 prior turns — all 3 available). Warmed per ENV-01 (see anomalies).
- **3 discuss turns run** (billable BYOK qwen). Every assistant turn rendered visible content:
  - Turn 1 → prose "You're right—the taxonomy isn't a show-tell lapse… Flag withdrawn." (450 chars).
  - Turn 2 → prose "You're right—I misread the taxonomy… I'll leave the text exactly as written." (420 chars).
  - Turn 3 → a structured `<<<REVISION>>>` rendered as the **AI Rewrite Comparison** card + short prose (57 chars). After turn 3 the thread is **capped** ("3-exchange cap reached — decide above, or undo to revise.", input removed).
- **Assertion: 3 assistant bubbles, 0 blank.** The pre-fix D-104 symptom (empty grey bubble) did **not** reproduce.
- **Honest caveat on D-104 coverage:** the exact pre-fix trigger — a reply whose prose parses to `""` while carrying *only* a structured field — never occurred in these turns (every reply carried prose). So this proves "no blank bubbles across 3 live turns + structured revision + structured constraint," not the empty-`assistantMessage` fallback path specifically. The fallback path (`REVISION_FALLBACK_TEXT` / `CONSTRAINT_FALLBACK_TEXT`) remains covered only by unit tests (`finding-conversation.test.ts`).
- **Contrast shot** `42a-discuss-constraint-chip.png` (finding `b92055ea`): a reply that used the correct `<<<REMEMBER>>>` delimiter → the intended "On 'Keep as-is', I'll remember: 'Preserve present-tense shifts…'" chip renders cleanly, 0 leaked blocks. This is the fix's designed behavior.

### 42c — D-107 (findings dedup) — CAPTURED with disclosed nuance
- **Before (`42c-findings-before.png`):** 10 findings / 6 pending. Pending clusters: **3× show-tell** on anchor "She thought about the difference…" (the pre-fix duplicate cluster), 1× prose "has changed" on anchor "She never read them…" (`b92055ea`), 2× blank-anchor prose (pre-seeded "Rita QA" rate-limit fixtures — blank anchors, never dedup-eligible).
- **Two dev-edit reruns triggered** via `POST /api/books/:id/agent {workflowId:"dev-edit",chapterNumber:1}` (dev-edit is non-conversational, >5 min est → BullMQ background queue; worker confirmed live via `/api/health/dependencies` → `worker: ok`).
  - **Run 1** (`bc119843`): completed all analysis passes but **stalled ~40 min at the WriteDocument step due to an OpenRouter outage** ("OpenRouter is experiencing temporary issues — will retry"); never wrote its report; cancelled (`{ok:true, alreadyDone:true}`). Its SSE reasoning is itself dedup evidence — it stated the tense finding "was flagged in a previous edit" and other concerns were "writer-approved creative choices," so it declined to re-create them.
  - **Run 2** (`d8299d21`): completed after OpenRouter recovered. Findings 10→**11** (pending 6→7): **exactly one** new finding created.
- **After (`42c-findings-after.png`):** the **show-tell cluster is still exactly 3** — the rerun added no new identical-anchor duplicate. Run 2's own report (see 42d-fresh) has a **"Findings Respectfully Suppressed (per Writer's Previous Choices)"** section that explicitly lists the show-tell, explanatory-sentence, and chapter-length issues as **not re-flagged**.
- **Interpretation caveat (disclosed):** the live UI shows the dedup *outcome* (no accumulation of identical `anchor+category` findings), not the `executeCreateFinding` in-band suppression gate firing — that runs inside the worker and isn't surfaced in the UI, and in both runs the agent chose not to attempt an identical-anchor create (so the gate itself wasn't observably exercised). The gate is covered by `finding-pending-duplicate-suppression.test.ts` (6 cases, per `cfe622a`). Also: the 3 legacy show-tell duplicates are **not** retro-removed (the fix only prevents new ones — matches the commit).
- **NEW observation (near-duplicate not caught):** the one finding run 2 *did* create — `e8418788`, prose, anchor "She let them sit…" — describes the **same** "has changed" tense clash as the existing `b92055ea` (anchor "She never read them…"). Different anchor text → `anchor+category` dedup treats them as distinct, so **two near-identical prose findings now sit side-by-side at the top of the list**. Not a D-107 regression (D-107 targets identical normalized anchor), but a disclosed limitation of anchor-exact dedup.

### 42d — D-113 (report metadata stamping) — CAPTURED, fix confirmed with disclosed scope limit
- **Before (`42d-report-stale-prefix.png`):** the newest DEV_EDIT_REPORT (`81f4d171`, written 2026-07-20 pre-fix) shows the header defect verbatim: **"Edit Date: 2025"** and **"Chapter Word Count: ~570 words"** — real chapter is 704.
- **Code confirmed:** `stampReportMetadata()` (editorial-text-hygiene.ts) overwrites only existing `Word Count:` / `Date:` **header lines** — replacing the value with the denormalized `chapter.wordCount` (verified **704** via API) and `now.toISOString().slice(0,10)` (**2026-07-26**). It never injects headers and deliberately leaves body prose byte-identical.
- **After (`42d-report-fresh.png`, run 2, same doc id rewritten today):** the model wrote the report in a **different, header-less structure** ("Finding Summary" table + prose, no `Edit Date:`/`Chapter Word Count:` header lines). Consequently the stamp was a **no-op** — there was no header to correct.
  - Good: **no wrong "Edit Date: 2025"** header appears (the header defect is gone).
  - Disclosed residual: the report's **prose** still says **"Chapter length (~570 words)"** while the real count is 704. `stampReportMetadata` is header-scoped by design, so a wrong count stated in prose is not corrected, and neither "704" nor "2026-07-26" appears in this report.
- **Net:** I could not capture the ideal "704 / 2026-07-26 stamped header" in a live report, because run 2's report format lacked the stampable header lines. The header-stamp behavior itself is verified by `editorial-text-hygiene.test.ts` (stampReportMetadata block, 7 cases) + the 704 word-count wiring above. The pre-fix header defect and the prose residual are both captured/disclosed.

### 42e — return-writer dashboard (D5-adjacent) — CAPTURED
- `42e-dashboard.png`: Writing Dashboard — Total Words **704**, Today/Streak/Weekly stat tiles, Last-30-Days chart, Daily/Weekly/Total goal cards, Story Health **77% healthy** (Drafting 1/1 ✓, Editorial Coverage 1/1 ✓, Beta 0/1 ✗, "6 findings need review" — pre-run count, Foundation ✓Style ✓Bible ✓Architecture), Writing Sprint, Marketing Kit. Clean single shot.
- `42e-book-overview.png`: book overview surface.

---

## NEW defects observed (describe, don't number — register assigns numbers)

1. **Discuss reply control-token leak on a malformed `<<<REMEMBER>>` delimiter.** When the quick-assist/discuss model emits the memory delimiter with **two** closing angle brackets (`<<<REMEMBER category="preference">>`) instead of three (`>>>`), `parseDiscussResponse`'s start-delimiter regex `^<<<REMEMBER(\s+category="[^"]*")?>>>$` fails to match. Result: (a) the raw control block `<<<REMEMBER …>> … <<<END>>>` renders **verbatim inside the assistant bubble** (internal agent syntax shown to the writer — visible in `42a-discuss-thread.png` / `42b-discuss-capped-full.png`); (b) the intended "I'll remember: …" constraint chip **never appears**; (c) the constraint is **never persisted to writer memory** — the whole REMEMBER mechanism silently no-ops. Reproduced on **2 of 3** turns on `036a088d`; the 1 correctly-formatted turn (`b92055ea`) rendered the chip cleanly (`42a-discuss-constraint-chip.png`), so this is intermittent model-format drift against a brittle exact-`>>>` parser. Adjacent to D-104 (same discuss-reply parser); distinct failure mode — over-full leaked bubble rather than a blank one. The recovery-probe reply used the correct `>>>` and parsed fine, confirming it is drift, not a total break.

2. **D-113 residual — wrong word count survives in report prose.** The fresh dev-edit report states "Chapter length (~570 words)" though the chapter is 704. The metadata stamp only rewrites labeled header lines, so a wrong count in narrative prose is untouched; and when the model writes a header-less report, the stamp corrects nothing at all. The persistent "~570" (real 704) appears to be a model carry-over the report keeps repeating.

3. **Anchor-exact dedup lets a semantic near-duplicate through.** The dev-edit rerun created a second prose finding on the same "has changed" tense issue but a different anchor sentence, so `anchor+category` dedup did not merge it with the pre-existing one — two near-identical prose findings now coexist in the list.

---

## Billable usage (disclosed)
- **Discuss turns:** 4 total LLM calls — 3 on `036a088d` (turn1 Playwright, turn2 direct API probe, turn3 Playwright) + 1 on `b92055ea` (OpenRouter recovery probe). BYOK qwen, cheap.
- **Dev-edit runs:** 2 (run1 `bc119843` stalled at report-write and was cancelled after accruing partial cost ≈$0.02–0.03 of tool passes; run2 `d8299d21` full completion). BYOK qwen `openrouter-qwen36/sonnet`.

## Persona state changed by this capture (disclosed)
- `036a088d`: now has a 3-turn discuss thread (capped) and an **armed revision** (`newText` written back by the discuss route on turn 3's `<<<REVISION>>>`), which surfaced a "text changed" badge on the card. The revision was **not** accepted (only the message was sent).
- `b92055ea`: now has a 1-turn discuss thread + a stored constraint.
- New finding `e8418788` created by dev-edit run 2 (pending, prose).
- DEV_EDIT_REPORT `81f4d171` rewritten by run 2 (today).
- No `qa-seed-personas.ts` run; no other persona data touched.

## Environment anomalies / harness notes (disclosed)
- **ENV-01 warmup applied:** touched the discuss + findings route files, then a throwaway discuss GET (8.79s cold → 0.10s warm, 200) before capture. No cold 404 hit during capture.
- **OpenRouter outage mid-session:** run 1 stalled ~40 min at WriteDocument on repeated "OpenRouter is experiencing temporary issues — will retry"; recovered ~23:15 local; a fresh discuss probe (200, correctly parsed) confirmed recovery before run 2. This is why the fresh report came from run 2, not run 1.
- **Playwright wait flakiness:** my `page.waitForFunction` on the discuss bubbles occasionally timed out during React-Query re-render even though the reply had persisted (verified via API GET); the clean thread/cap shots were taken after a full reload. Two early transitional/failed shots were discarded (not in the final set). The reply-bubble selector had to be corrected twice — placeholder is "Explain **your** intent…" (not "Explain intent…"), and reply bubbles are `<p class="… mr-6/ml-6">` inside a nested `div.space-y-2`.
- Chat-widget FAB (bottom-right) overlaps the far corner of some full-page shots; it is app chrome, not the surface under test.

---

## Follow-up (2026-07-27)

The raw `<<<REMEMBER …>>` control-token leak first captured here (shot 42a, NEW defect #1 above,
registered **D-157**) was fixed in `d625d51` and re-shot on camera as the **43-series** —
see [`UI-CAPTURE-2026-07-27-d157.md`](./UI-CAPTURE-2026-07-27-d157.md). `43c-retro-drift-clean.png`
is the direct post-fix counterpart of `42a-discuss-thread.png`: same finding, same stored drifted
bytes, raw syntax gone and the constraint chip recovered.
