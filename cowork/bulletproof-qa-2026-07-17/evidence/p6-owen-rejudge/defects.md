# P6 Owen REJUDGE — defect re-test ledger (2026-07-20)

All repro'd as `user_qa_p6` on book `6d69fd7c-f7a4-4e3d-bf49-1415d81f5326`, dev :3002, ONE worker (leaf PID 61892, bracketed). Read-only on `src/`. No D-numbers assigned by me; team-lead owns the register. Provisional IDs for genuinely-new items are `N-1`, `N-2`.

## PART A — Baseline defects re-tested LIVE

### CLOSED (verified live)

| ID | Baseline sev | Proof file | Live result |
|---|---|---|---|
| **D-35** wizard "Finish Setup" no-op | S2 | `api-traces/p0-honesty.json` (10/11/12) | PATCH `{setupComplete:true}` → 200 with `setupComplete:true`; GET after persists `true`; `setupImportSkipped` persists too. `updateSettingsSchema` now carries both fields. **CLOSED.** |
| **D-39** silent unknown-key drop + ZodError leak | S3 | `p0-honesty.json` (20); `p2-discuss-apply.json` (D39-finding-bad-action-real) | Settings PATCH unknown key → 400 `formErrors:["Unrecognized key…"]` (`.strict()`); finding PATCH bad action → 400 `fieldErrors:{action:[…]}`. Clean field/form messages, **no ZodError internals**. **CLOSED** (both routes). |
| **D-44** BYOK usage panel $0 | S3 | `p0-honesty.json` (30) | openrouter key `usage {734983 tok, $0.375, 15 sess}`; anthropic `{583208, $10.21, 4 sess}` — real spend surfaced (prefix-match bug fixed). **CLOSED.** |
| **D-41 / D-41a** empty-newText destructive apply | S4 | `p2-discuss-apply.json` (D41a…) | apply with blank `overrideText` → **422** honest copy, refuses to delete the passage. **CLOSED.** |
| **D-41b** discuss revision not persisted | S4 (baseline C-7) | `p2-discuss-apply.json` (D41b…); `transcripts/discuss-crit-holdground-b48e321f.json` | discuss `revisedSuggestion` now written back onto the finding's `newText` (before≠after). **CLOSED.** |
| **D-50** LINE_EDIT_REPORT self-talk | S3 | `p1c-inspect-findings.json` (report-hygiene-scan) | ch5 report scan: 0 self-talk phrases, 0 glitch tokens. **CLOSED.** |
| **D-55** rejectedAt stamped on writer dismissals | S4 | `p3-dismiss-memory.json` (D55-finding-row) | dismiss → `rejected_at: null`, `dismiss_reason` stored, `applied_at: null` (direct DB read). **CLOSED.** |

### STILL OPEN (verified live)

#### D-43 [S3] — editor-model override never governs line-edit (silent paid-model misroute)
- **Live proof:** `api-traces/p5-d43-routing.json` + `transcripts/d43-lineedit-ch3-editoroverride-sse.json`. Set `modelEditor:"anthropic/opus"` (resolvable registry id) → 200. Ran a line-edit; **every `cost_update` streamed `openrouter-qwen36/sonnet`**, and `usage_records` recorded `agent_type: writing-coach / model: openrouter-qwen36/sonnet / $0.035` (qwen pricing, not opus). Line-edit runs entirely on the conductor (coach role); the editor role is never delegated, so the editor override is silently ignored. A BYOK user who buys a premium key and sets "editor model" gets the cheaper default with no error/warning. Same mechanism as baseline C-9/D-43 — architecture unchanged.

#### D-49 [S3] — editorial rationales fabricate quotations of the fingerprint doc
- **Live proof:** `api-traces/p1d-fingerprint-quote-check.json`. This run's critical finding `b48e321f` rationale AND the persisted ch5 LINE_EDIT_REPORT quote the narrator's voice as `"clipped, procedural, emotionally controlled"`. Grep of the live FINGERPRINT document (`6302d754`, 24,969 chars): phrase **absent** verbatim AND case-insensitive. Same fabricated-quotation class the baseline P6-func judge #3 named (identical phrase). A paying stylist reads invented text presented as a quotation of their own captured fingerprint. (Milder same-class instance: `"almost entirely avoids abstract psychological vocabulary"` in acaf7362 adds words inside quotes around the real phrase `"avoids abstract psychological vocabulary"`.)

#### D-42 [S4] — no GET session-status endpoint
- **Live proof:** `p2-discuss-apply.json` (D42-session-status-get). `GET /api/books/:id/agent/:sessionId` → **404** (framework). Only `/stream /message /approve /cancel` exist; an API/mobile client still cannot poll a session's outcome after an SSE disconnect. Unchanged from baseline.

### NOT re-reproduced / not re-tested (honest limitations)

- **D-36 [S2] outage fake-success** — NOT reproduced: no provider outage occurred this session. What I CAN attest positively: this run's completed line-edit recorded **real** tokens/cost ($0.0263, 24424/8046) with findings, and the chapter's `line_edited` status is backed by real work — the honest-completion path is intact (`p4-session-billing.json`). The fake-success failure mode (retry resolves empty → 0/0/$0/natural + status advance) requires an actual outage to trigger; **NOT-TESTABLE this run without inducing a provider failure.** Code note: `agent/route.ts` onComplete now gates `processPostSession` on `result.success && !result.cancelled` and there is an explicit "D-36: a provider-failure run must not advance chapter workflow state" guard — but the worker/background path was not exercised under a real failure here.
- **D-40 [S4] fingerprint glitch tokens + fabricated example quotes** — the fingerprint document was NOT regenerated (I re-used the baseline-captured persisted doc), so its stored glitch tokens still exist as an artifact. A fresh `capture-style` run would be needed to test whether the fix sanitizes them; NOT run (cost + would overwrite the pre-registered fingerprint the moat re-test depends on). This run's line-edit REPORT is clean of glitch tokens.

## PART B — Voice moat (D8) — re-verified, HOLDS

The standout dimension holds under fresh independent capture:
- **0 misquotes** — 3/3 anchored findings byte-verbatim (NFC) vs live ch5 → misquote cap NOT triggered.
- **6/6 registered devices survive** — V1 and-stack preserved verbatim through the critical finding's replacement; report names 4 devices as protected → flatten cap NOT triggered.
- **Recall 3/6** (E4/E5/E6) — identical to baseline qwen, no regression.
- **Discuss holds-with-compromise AND adapts-with-constraint** — both in-voice; hold-ground compromise "Light shifted to red behind the island, then gold. Visibility held good." is in-register.
- **WriterMemory loop live + cross-session** — dismiss→conversation constraint persisted; baseline constraint still active.
- **D-33/D-34 corrective loop fired live** — malformed CreateFinding → REJECTED analytics row → recovered.

## PART C — Genuinely NEW observations (adversarial, this run)

### N-1 [S4] — overlapping/duplicate findings on the same paragraph
- `acaf7362` (important, anchor "There was a palpable silence…") and `b48e321f` (critical, sunset) both target paragraph 6, and **both delete "palpable"** — b48e321f's `originalText` span (3 sentences) subsumes acaf7362's span. Applying b48e321f first makes acaf7362's `originalText` un-findable → the exact-span apply would then 409 ("Original text not found"). No data loss (the 409 guard holds), but two findings partially duplicate one edit and can dead-end each other. UX/finding-dedup wart. Evidence: `p1c-inspect-findings.json` (both spans).

### N-2 [S4] — WriterMemory accumulates near-duplicate constraints (one per finding)
- After the dangler discuss+dismiss, `writer_memories` holds TWO active `conversation` constraints for the same concept: `a49972a2` "Keep dangling modifiers when they deliberately reflect cognitive slippage or fatigue." (finding_id 42e70291, this run) and `ce63cb76`'s "Preserve dangling modifiers that mimic cognitive slippage or fatigue." (baseline). The `@@unique([userId, findingId, source])` key dedups per-finding, not per-concept, so semantically-equivalent preferences pile up as the writer dismisses the same class of finding across sessions. Prompt-bloat / conflicting-guidance risk over time. Evidence: `p3b-memory-fix.json` (writer-memories-all).

## Positive notes (not defects)
- Suggestions never auto-applied: ch5 byte-identical to what Owen wrote until an explicit apply; apply is exact-span with version bump (v4→v5) and optimistic locking (D-47 stampless-overwrite → 409 on interactive path).
- Report affirmatively PROTECTS style by name ("PROTECTED SIGNATURE DEVICE", "self-correcting recursion", the "the way" universalizing device).
- Honest billing: real tokens/cost on completed runs; usage panel now truthful (D-44).
