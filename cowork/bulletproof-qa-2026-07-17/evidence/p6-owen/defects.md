# P6 Owen — CANDIDATE defects (no D-numbers assigned; team-lead owns the register)

Local IDs C-1..C-8. All repro'd as `user_qa_p6` on book `6d69fd7c-f7a4-4e3d-bf49-1415d81f5326`, dev server :3002, 2026-07-18.

## C-1 [S2] Setup wizard "Finish Setup" silently no-ops → paste-in writers permanently walled from all non-setup workflows

- **Symptom:** the exact request the wizard sends (`src/app/(app)/books/[bookId]/setup/page.tsx:142`) — `PATCH /api/books/:id/settings {"setupComplete": true}` — returns 200, UI toasts "Setup complete!", but `setupComplete` stays `false` (verified via GET). `updateSettingsSchema` (`src/lib/validation.ts:119`) has no `setupComplete` field; Zod strips unknown keys silently. (`setupImportSkipped`, sent at `setup/page.tsx:128`, has the same fate.)
- **Impact:** SETUP-07 guard (`api/books/[id]/agent/route.ts:112-134`) blocks every non-setup workflow (incl. line-edit) unless FINGERPRINT+STORY_BIBLE+ARCHITECTURE all exist. A stylist who pastes a finished manuscript and skips bible/architecture is told setup is complete but 422-blocked forever, with no honest path out. Line-edit's own prerequisites are only FINGERPRINT+content — the wall is the guard, not the workflow.
- **Repro:** `api-traces/setup07-probe.json` (422 → PATCH 200 → GET setupComplete:false).
- **Severity:** S2 (journey-blocking for the P6-class segment + success response lies).

## C-2 [S2] Provider outage mid line-edit converts to fake-success: session "completed", 0 tokens, chapter advanced to line_edited

- **Symptom:** during a real OpenRouter outage, the SSE honestly emitted `error: "OpenRouter is experiencing temporary issues. The request will be retried automatically."` — but the retry resolved as an EMPTY success: `complete / findingsCreated 0 / tokensInput 0 / tokensOutput 0 / costUsd 0 / endReason "natural"`. DB: agent_sessions `9cb75913` status `completed`, 0/0 tokens, $0. Chapter 5 status **advanced to `line_edited`**; **no LINE_EDIT_REPORT document** exists for it.
- **Impact:** silently degraded paid run presented as a clean pass. In a batch/overnight context (P4) the digest would report a successful child on a chapter that was never edited. Trust-breaking for exactly the money-path the campaign guards.
- **Evidence:** `transcripts/line-edit-ch5-pass1-sse-raw.json` + `-reattach.json`; session row + chapters/documents dumps referenced in `journey-log.md`.
- **Severity:** S2 (fabricated success state; adjacent to S1 if it lands in a billed batch digest).

## C-3 [S3] POST /api/books/:id/chapters non-atomic; observed partial write behind a 500; P2002 unmapped

- **Symptom (observed once, live):** first-ever chapter create for the new book returned 500 `{"error":"Failed to create chapter"}` yet persisted a partial row — chapter existed with **title NULL** (submitted title lost) and `chapterCount` not incremented. Identical immediate probe succeeded (201, title intact).
- **Code:** route runs `db.chapter.create` then `db.book.update` increment with **no transaction** (`api/books/[id]/chapters/route.ts:57-71`); any throw between them leaves inconsistent state. Unique-violation (P2002) falls into the catch-all 500, so a user retry after this 500 hits the ghost row and 500s again instead of a 409.
- **Evidence:** `api-traces/phase0.json` (the 500 + baseline), `api-traces/phase0b.json` (repair), DB row inspection in journey-log.
- **Severity:** S3 (one-shot flake but code-provably non-atomic; recovery path is a dead end).

## C-4 [S3] Ghost text broken on reasoning models: ~50% empty-but-billed, 28-44s latency, 25-40× token cost vs design

- **Symptom:** `POST /api/books/:id/ghost-text` hardcodes `max_tokens: 60` (`ghost-text/route.ts:99-104`) assuming text-only models. On qwen3.6 (a reasoning model): 2/4 probes returned `{"suggestion":""}` with HTTP 200 in ~1.5s — usage rows show `tokens_output` exactly **60**, i.e. the whole budget consumed by reasoning before any visible text, and the call is still billed + usage-recorded. The 2 successful probes billed **1479 / 2440 output tokens** ($0.0036 / $0.0059) and took **28.6s / 43.8s** — unusable as an inline typing companion.
- **Register note:** when it does answer, the output is genuinely in-voice (see journey-log Phase 3) — the failure is economics/latency, not quality.
- **Cross-ref:** same mechanism family as D-04 (discuss max_tokens 700 → empty replies; fixed by raising budget + retry-on-empty + honest error). Ghost text needs the same treatment (reasoning-aware token budget or reasoning-excluded provider param, plus don't 200 an empty suggestion silently).
- **Evidence:** `transcripts/ghost-text-probes.json`, `ghost-text-retry.json`, usage_records dump in journey-log.
- **Severity:** S3 (feature-defeating on the validation model; per-call money leak).

## C-5 [S3] Pattern: state-changing routes silently drop unknown JSON keys and return 200 (Zod non-strict)

Three live instances in one journey:
1. `setupComplete` (C-1 — the worst case).
2. Finding dismissal: `PATCH .../findings/:id {"action":"dismiss","dismissReason":"…"}` → **200, finding dismissed, but the writer's keep-as-is reason silently discarded** (schema field is `reason`). The reason feeds `<finding_history>` and dismissal-preference inference — silent loss degrades D8 downstream. (Also: the 400 for a wrong `status` body leaks raw ZodError internals — `"details"` includes the full issue tree.)
3. Any typo'd field on these routes behaves the same.
- **Suggestion:** `.strict()` (or explicit 400 on unknown keys) for state-changing bodies; map ZodError to clean field-level messages.
- **Evidence:** `api-traces/setup07-probe.json`, `api-traces/memory-around-dismiss.json` (400 body), `-2.json`, dismiss_reason NULL check in journey-log.
- **Severity:** S3 (systemic contract weakness; individual instances range S2-S4).

## C-6 [S4] FINGERPRINT document persisted with model-glitch artifacts and fabricated example quotes (qwen)

- Foreign-language/token intrusions persisted into the writer-visible document: "nicht by training", "asnaczynią", "无意", "semdp-wisdom", "die-sel", "internal-monoologue". Two example "quotes" fabricated (not in corpus: "He was a man who set you waiting for the light to change", "the feeling is named: it is late-stage grief") and one near-quote ("I lift the kerosene" vs "I lifted the kerosene").
- Analysis quality is otherwise strong (see journey-log). Model-conditional; suggests a post-generation sanitation/verbatim-check pass for persisted setup documents. Fingerprint examples are advisory, so this is S4 — but note the near-quote pattern would be an S2 misquote if it occurred in a finding (it did not; findings were 0/4 misquotes).
- **Evidence:** `fingerprint.md`.

## C-7 [S4] Critical finding with empty newText + discuss revision never persisted to the finding

- Line-editor created a **critical** prose finding (`bdb80574`) with `newText` empty — rewrite-comparison UI has nothing to render, and a plain `action:"apply"` would silently flip status to applied without touching the text (advice-only fallthrough at `findings/[findingId]/route.ts:133/206-213`).
- The discuss thread produced a concrete in-voice `revisedSuggestion`, but it is not written back to the finding — the writer must hand-carry it via `overrideText` (worked, but the UI equivalent is copy-paste).
- **Evidence:** `api-traces/findings-all-after-ch5-pass2.json` (empty newText), `transcripts/discuss-weakdefense-bdb80574.json`, `api-traces/apply-and-redismiss.json`.
- **Severity:** S4 (friction; upgrade to S3 if UI renders an Apply affordance for newText-less findings).

## C-8 [S4] No API session-status endpoint; stream is the only observer

- `GET /api/books/:id/agent/:sessionId` → framework HTML 404 (route exposes only /stream /message /approve /cancel). After an SSE disconnect (long build-architecture run, provider outage) a client cannot poll outcome; must re-attach to the stream and infer. Made C-2 harder to observe; any API consumer / mobile client shares the problem.
- **Evidence:** poll loop transcript in journey-log (20× HTML 404), `transcripts/line-edit-ch5-pass1-sse-raw-reattach.json`.
- **Severity:** S4 (API ergonomics; masks S2-class states).

---

## Positive security/robustness notes (not defects)

- Invalid Anthropic key: rejected at validation (400, clean copy) and **not stored** — account kept only the validated openrouter key.
- Suggestions never auto-applied: chapter content byte-identical after every editorial pass until the writer acted; apply is exact-span with optimistic versioning.
- Provider-outage SSE error copy is honest and plain-language (the failure is what happens after it — C-2).
- D-33/D-34 hardening verified live: malformed CreateFinding (paragraphNumber out of range) → corrective REJECTED message, model recovery, analytics row, zero raw errors across 6 sessions.
