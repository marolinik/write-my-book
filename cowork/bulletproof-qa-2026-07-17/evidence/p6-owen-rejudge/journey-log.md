# P6 "Owen" — Literary Stylist REJUDGE journey log

**Persona:** `user_qa_p6` (Owen, craft-serious literary stylist, indie plan, BYOK).
**Book:** "The Keeper's Arithmetic" `6d69fd7c-f7a4-4e3d-bf49-1415d81f5326`, ch5 = pre-registered planted probe.
**Date:** 2026-07-20 (all API times server-local from traces; DB timestamps are UTC, server-local = UTC+2).
**Method:** raw HTTP via tsx driver (`scripts/_client.ts`) reading `process.env.E2E_TEST_SECRET`; headers `x-e2e-test-secret` + `x-e2e-clerk-id: user_qa_p6`. Read-only on `src/` (no edits). Direct DB reads via `pg` (raw SQL, DATABASE_URL from env) for finding/session/memory rows.
**Worker:** ONE worker, bracketed — leaf `src/worker.ts` runtime PID **61892** at 13:22 pre-run AND 13:5x post-run, no restart (`worker-proof.txt`).
**Model:** persona BYOK keys on account (disclosed, masked): OpenRouter `sk-or-v...705e` (default `openrouter-qwen36/sonnet` = qwen3.6-27b) + Anthropic `sk-ant-...jgAA` (`anthropic/opus`). Plan-free personas are NOT key-less. All line-edit voice verdicts qwen3.6-conditional.

Focus: re-verify the **voice moat / line-editor** (findings anchor verbatim → D8 misquote cap; deliberate stylistic devices not flattened; discuss adapts) and re-test each baseline floor-driver defect LIVE.

Pre-registration reused verbatim: `../p6-owen/manuscripts/device-registry.md` (6 devices V1–V6 + 6 planted errors E1–E6). ch5 content confirmed **byte-identical** to the planted probe before the run (`p1a-state-and-restore.json`, v4, matchesPlanted:true).

---

## Phase 0 — Honesty-surface re-tests (no worker) — `api-traces/p0-honesty.json`

| Driver | Baseline | Live result | Verdict |
|---|---|---|---|
| **D-35** wizard "Finish Setup" no-op | PATCH 200 but `setupComplete` stays false | PATCH `{setupComplete:true}` → 200 body `setupComplete:true`; GET after → **`true` (persists)`; `setupImportSkipped` likewise persists | **CLOSED** |
| **D-39** silent unknown-key drop + ZodError leak | 200 silently strips unknown key; dismiss 400 leaks full ZodError tree | PATCH `{bogusUnknownKey_qa}` → **400** `{formErrors:["Unrecognized key: \"bogusUnknownKey_qa\""]}` — clean, no ZodError internals | **CLOSED (settings)** |
| **D-44** BYOK usage panel $0 | openrouter key `usage:{0,0,0}` vs real spend | openrouter `usage:{totalTokens 734983, totalCost $0.375, 15 sess}`, anthropic `{583208, $10.21, 4 sess}` — **real spend surfaced** | **CLOSED** |
| D-43 read | modelEditor override inert | default `openrouter-qwen36/sonnet`, all role overrides null | (routing tested in Phase 5) |

## Phase 1 — LIVE line-edit on ch5 planted probe (session `15c82e80`) — `api-traces/p1b-*`, `p1c-*`, `transcripts/line-edit-ch5-rejudge-sse-raw.json`

Queued → worker → SSE to completion. **Honest billing** (`p4-session-billing.json`): status completed, tokens **24424 in / 8046 out**, cost **$0.0263**, agent_type `writing-coach`, model `openrouter-qwen36/sonnet`. NOT a fake-success — real work, real spend.

**Findings created: 3 pending + 1 rejected (analytics).** Full raw in `p1c-inspect-findings.json`.

| id | sev | plant | anchor verbatim? | classification |
|---|---|---|---|---|
| b48e321f | critical | E5 purple sunset | ✅ `"Behind the island the sunset bled crimson and gold across the heavens."` | SHARPEN — 3 in-voice alternatives; **V1 and-stack preserved verbatim** in the replacement |
| acaf7362 | important | E4 "palpable" AI-tell | ✅ | SHARPEN — removes modifier, keeps concrete image |
| 42e70291 | suggestion | E6 dangling modifier | ✅ | SHARPEN — rationale **reasons about the WriterMemory constraint by name** (see below) |
| 8f2bf7d9 | (rejected) | E6 (malformed) | null anchor | D-33/D-34 corrective loop: model emitted a null-anchor CreateFinding → REJECTED → re-created correctly as 42e70291 11s later |

**D8 moat metrics (byte-verified, NFC, against live ch5 content):**
- **Misquotes: 0/3** anchored findings — every `originalText`/`anchorQuote` byte-verbatim → **D8 misquote cap NOT triggered.**
- **Device precision: 6/6 survive** — no finding removes any registered device; V1 and-stack (`"the rope and the ring and the salt that held them together"`) is carried through the critical finding's newText untouched. The persisted LINE_EDIT_REPORT (`7656d011`) **names 4 devices as protected** ("Compressed paradox … a PROTECTED SIGNATURE DEVICE", "self-correcting recursion", the "the way" universalizing device, log-entry rhythm) → **flatten cap NOT triggered.**
- **Recall: 3/6** (E4, E5, E6). Missed E1 double-under, E2 small-echo, E3 filter-word — **identical to baseline qwen 3/6** (under-flagging residue, gate-driven, no regression).
- **Report hygiene: CLEAN** — `report-hygiene-scan`: 0 self-talk phrases, 0 glitch tokens (**D-50 CLOSED**; baseline ch1 report had "— wait, no, those are short)").

**D-49 STILL OPEN (reproduced live):** b48e321f's rationale AND the persisted ch5 report both quote the fingerprint as the narrator's voice being `"clipped, procedural, emotionally controlled"`. `p1d-fingerprint-quote-check.json` proves this phrase is **absent** from the live FINGERPRINT doc (verbatim AND case-insensitive false) — the exact fabricated-quotation class the baseline P6-func judge #3 named. (The real phrase `"avoids abstract psychological vocabulary"` IS present and used correctly in acaf7362; `"almost entirely avoids abstract psychological vocabulary"` in acaf7362's rationale adds words inside the quotes — a milder instance of the same class.)

## Phase 2 — Discuss (hold + adapt), apply, D-41/D-42/D-39 finding-route — `api-traces/p2-discuss-apply.json`, `transcripts/discuss-*`

- **Hold-ground** on b48e321f (weak aesthetic defense "every book gets one romantic flare"): agent held with a reason ("She observes physical phenomena, not metaphors") AND offered an in-voice compromise `revisedSuggestion: "Light shifted to red behind the island, then gold. Visibility held good."` → **D-41b: this revision was persisted onto the finding's newText** (baseline gap — writer had to hand-carry via overrideText — CLOSED).
- **Adapt** on 42e70291 (argued deliberate cognitive slippage): agent adapted — "Accepted. This aligns with your stated preference…" — and emitted `suggestedConstraint: "Keep dangling modifiers when they deliberately reflect cognitive slippage or fatigue."` (recognized the EXISTING WriterMemory preference).
- **D-41a destructive-apply guard:** apply with blank `overrideText:"   "` → **422** honest copy ("This finding has no replacement text, so applying it would delete the passage…"). Baseline's silent advice-only flip is guarded.
- **Real apply** (palpable via `overrideText`): 200, version **4→5** (bumped), palpable removed, `onlyExpectedDelta:true` (exact-span; nothing else changed), V1 and-stack + V6 wit intact. No auto-apply, byte-safe.
- **D-42 session-status endpoint:** `GET /api/books/:id/agent/:sessionId` → **404** — STILL no poll endpoint (only /stream /message /approve /cancel).
- **D-39 finding-route ZodError leak:** PATCH real finding `{action:"not-a-real-action"}` → **400** `{fieldErrors:{action:["Invalid option: expected one of \"apply\"|\"dismiss\""]}}` — clean, no ZodError internals. Baseline leaked the full tree. **CLOSED.**

## Phase 3 — Dismiss → WriterMemory (D-55) — `api-traces/p3-*`, `p3b-memory-fix.json`

- Dismiss 42e70291 with keep-as-is reason → **rejected_at NULL**, dismiss_reason stored, applied_at null (direct DB read). **D-55 CLOSED** (baseline stamped rejectedAt on writer dismissals).
- **WriterMemory loop live:** dismiss created a new `conversation` constraint (id a49972a2, `finding_id 42e70291`, content = the exact discuss suggestedConstraint, active). The baseline constraint (ce63cb76, "Preserve dangling modifiers that mimic cognitive slippage or fatigue.") is **still present + active** — cross-session persistence holds.
- ch5 restored to the planted probe (v6, matchesPlanted:true) — book left clean.

## Phase 5 — D-43 editor-model routing (definitive) — `api-traces/p5-d43-routing.json`, `transcripts/d43-lineedit-ch3-editoroverride-sse.json`

Set `modelEditor:"anthropic/opus"` (resolvable premium registry id; modelCoach/default left at qwen), ran a line-edit on ch3. Every `cost_update` streamed `openrouter-qwen36/sonnet`; usage_records row = `writing-coach / openrouter-qwen36/sonnet / $0.035` (qwen pricing, not opus $2–3). **The editor override was silently ignored** — line-edit runs entirely on the conductor (coach) role, never delegating to the editor role. **D-43 STILL OPEN.** Override reverted to null.

## Post-leg state
- Overrides null; both BYOK keys left on the account (user's own). ch5 restored to planted v6. Two new pending findings on ch5 (b48e321f critical w/ persisted revision, plus historical) — plausible writer state.
- Session spend this leg: ~$0.07 (2 qwen line-edits + 2 discuss turns + embeddings). No opus spent (D-43 misroute made the "premium" run cheap — itself the proof).
