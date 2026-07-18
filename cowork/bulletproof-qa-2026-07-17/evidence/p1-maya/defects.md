# P1 "Maya" — Defects

Evidence-only. Severity uses the campaign S-scale (S1 data-loss/overcharge/leak/bypass/crash > S2 journey-blocking/fabricated-output/false-positive > S3 friction > S4 cosmetic). Raw traces in `api-traces/` and `transcripts/`.

---

## D-04 (canonical; filed in this doc as D-02 before renumbering) — Discuss endpoint returns HTTP 200 with a genuinely empty reply, for every turn, on this campaign's own BYOK validation model

> **STATUS UPDATE (2026-07-18): FIXED-VERIFIED.** Re-run after the `discuss-llm.ts` fix (`max_tokens` 700→2500, retry-once with doubled budget on empty+`max_tokens` finish reason, `DiscussLLMEmptyError`→honest 502 that persists nothing and does not consume a turn) produced 3/3 real, non-empty, substantive discuss replies with structured `suggestedConstraint` blocks — full reversal of the symptom below. Turn-cap re-confirmed correct (409 on turn 4, no LLM call). WriterMemory persistence chain (dismiss → row appears, content matches last turn's `suggestedConstraint`) verified working end-to-end for the first time this campaign. Caveat: the new 502 path itself was not live-triggered in the re-run (no failures occurred) — it remains verified at the unit-test level only (`tests/unit/finding-discuss-route.test.ts`, `"maps DiscussLLMEmptyError to 502 without persisting or consuming a turn"`). Full evidence: `journey-log.md` "Step 1 RE-RUN (2026-07-18)", `transcripts/d8-rerun-turn{1,2,3}.json`, `api-traces/d8-rerun-memory-after-dismiss.json`.
>
> **However, fixing D-04 surfaced a distinct new defect — see D-13 below.** The discuss/memory plumbing now works, but the dev-editor still re-raises a dismissed, memory-backed, non-critical finding on unchanged content the very next time it runs — in direct violation of its own explicit system-prompt instruction not to. This means the actual end-user promise D8 tests ("tell the AI editor your intent once, it remembers going forward") still does not hold, even though the specific empty-reply bug is gone.

> Campaign defect register: D-01 = malformed JSON → 500 (P8), ENV-01 = depth-5 route-table incident (environment, a.k.a. P2's in-file D-02 cross-ref), D-03 = export body-swap after reorder (P2, S1), **D-04 = this defect**.

**Class:** S2 — journey-blocking / silent failure. Not a crash, not a leak — worse in one respect: it reports success (200) while doing nothing useful, so the client has no signal to distinguish "the writer's message was understood and answered" from "nothing happened."

### Root cause (evidenced, not 100% confirmed without server-side logging)

`src/lib/editorial/discuss-llm.ts`, `runDiscussTurn()`:

```ts
const response = await client.messages.create({
  model: model.modelId,
  max_tokens: 700,
  system: args.system,
  messages: [{ role: "user", content: args.user }],
});
const textBlock = response.content.find((b) => b.type === "text");
return textBlock && "text" in textBlock ? textBlock.text : "";
```

`max_tokens: 700` is a hard cap on the *entire* response, including any internal reasoning tokens the model emits before its answer. This campaign's persona is configured with `openrouter-qwen36/sonnet` (underlying `qwen/qwen3.6-27b` via OpenRouter), which — like other 2026-era reasoning-capable open models — can consume its full token budget on reasoning before emitting a `text`-typed content block. When that happens, `response.content` contains no `type:"text"` block, `.find()` returns `undefined`, and the function returns `""`. The calling route (`.../discuss/route.ts`) does not treat an empty string as an error — it stores it as the assistant's `FindingReply` and returns 200.

Ruled out as the cause: bad model-resolution fallback (`resolveCheapModelFor` correctly resolves to `openrouter-qwen36/haiku`, confirmed present in `model-registry.ts` — no silent fallback to an unconfigured `anthropic/haiku`), and route-level error swallowing (no try/catch wraps the `runDiscussTurn()` call specifically — a thrown error would surface as 500, not a "successful" empty 200).

### Repro (3/3, independent turns, real LLM round-trips)

```
POST /api/books/{bookId}/editorial/findings/{findingId}/discuss
Headers: x-e2e-test-secret, x-e2e-clerk-id: user_qa_p1, Content-Type: application/json
Body: {"writerMessage": "<authorial-intent message>"}
```
Turn 1: 200, `assistantMessage:""`, 8.745s elapsed. `transcripts/discuss-turn1-retry.json`
Turn 2: 200, `assistantMessage:""`, 13.426s elapsed. `transcripts/discuss-turn2.json`
Turn 3: 200, `assistantMessage:""`, 9.676s elapsed. `transcripts/discuss-turn3.json`

The 4th turn correctly 409s (`MAX_USER_TURNS=3` cap fires independent of reply content), confirming the turn-counting/locking logic is sound — the defect is isolated to the LLM-call layer.

### Suggested fix (evidence-gathering only — not applied, per task constraints)

Raise `max_tokens` substantially for reasoning-capable models (or set a model-specific budget via the registry), and/or explicitly detect a reasoning-only response (empty text block) and retry once or surface a clear "the AI editor didn't have a response — try again" error instead of a silent empty 200.

### Why this matters for trust

This is not an edge-case model — `openrouter-qwen36/sonnet` is this campaign's own designated BYOK validation configuration for the Indie persona. Any real Indie-tier writer using a modern reasoning-capable OpenRouter model gets a **completely non-functional discuss feature**: every conversational turn silently no-ops, burns their turn cap (3 max) and their 24h rate limit, and never produces the `WriterMemory` constraint the UI implies it will. The downstream effect is severe: the entire "tell the AI editor your intent once, have it remembered" promise — which is the whole point of the discuss feature — cannot function for this user segment at all. See journey-log.md Step 1 for the full D8 loop failure this causes.

---

## D-01 — Malformed JSON request body returns 500 instead of 400/422 (cross-reference: already documented by P8 Rita, `evidence/p8-rita/defects.md`)

Not a new defect — re-confirmed here on a 3rd, previously-untested route (`PATCH /api/books/{id}`) and a different persona/plan tier (Indie, not Professional), to check the fault is genuinely architectural and not scoped to the two routes/actor Rita tested.

### Repro 3 — PATCH /api/books/{id}

```
PATCH /api/books/{bookId}
Headers: x-e2e-test-secret, x-e2e-clerk-id: user_qa_p1, Content-Type: application/json
Body (raw, intentionally invalid): {"title": "Salt Letters Revised"  bad json here}}}
```
Expected: 400/422. **Actual: 500**, `{"error":"Failed to update book"}`. `api-traces/d01-repro-books-patch.json`

Control (`api-traces/d01-repro-control-get.json`): immediate `GET` on the same book shows `name` unchanged — confirms `req.json()` threw *before* reaching `db.book.update()`, so no partial/corrupt write occurred. Consistent with Rita's root-cause finding: `req.json()`'s `SyntaxError` matches neither the `Unauthorized` nor `ZodError` special cases in the catch block and falls through to the generic 500.

First repro attempt on `POST /api/books` (Maya's own quota-gated route) hit her 2/2 Indie book cap first (403, before body parsing) — same precedence-not-a-bug pattern Rita documented for the professional-vs-indie split. Not counted as a repro; superseded by the clean one above.

---

## D-13 (S2) — Dev-editor re-flags a dismissed, memory-backed, non-critical finding on unchanged content, in direct violation of its own system-prompt instruction

> **STATUS UPDATE (2026-07-18): FIXED-VERIFIED (outcome-level).** Re-verified after the deterministic persist-time suppression landed (`src/lib/agents/tools.ts:1283-1317`: non-critical findings matching a DISMISSED finding's whitespace-normalized `originalText` + `category` on the same chapter are not persisted; empty `originalText` never suppresses). Protocol: confirmed chapter 1 byte-stable (704 words, critiqued passage verbatim-present), WriterMemory row still active, dismissed the pre-fix re-raise `d0f79766` too (arming suppression against both lineage entries), then ran dev-edit #4 (session `4bd0654f`, 147.7s, `final_status:"complete"`). Result: **zero re-raises** — the only new finding (`f1b35402`) targets a different passage, different category, no byte/normalized `originalText` match against either dismissed entry — and the editor still produced 1 genuinely-new finding, so no over-suppression. Caveat, stated honestly: the model didn't attempt the dismissed critique this run (2 CreateFinding attempts, both on the new passage; 0 suppression messages in SSE), so the deterministic gate wasn't live-triggered — it remains the unit-verified backstop (`tests/unit/finding-redismiss-suppression.test.ts`, 5/5 green incl. critical-exception, empty-originalText, and cross-chapter cases) for the stochastic re-raise case that dev-edit-3 exhibited. Side observation from the same run: a pre-existing CreateFinding input-validation gap (omitted `paragraphNumber` → raw `TypeError ... (reading 'normalize')` tool error instead of a corrective REJECTED message; model self-recovered) — described in `journey-log.md` "D-13 RE-VERIFY", assigned **D-33** (see entry below). Full evidence: `journey-log.md` "D-13 RE-VERIFY (post-fix, 2026-07-18)"; `api-traces/d13-reverify-*.json`; `transcripts/d13-reverify-dev-edit-4-*.json`.

**Class:** S2 — journey-blocking / false-positive. Assigned by team-lead 2026-07-18; code trace confirmed, hash-variation control confirmed unnecessary (root cause is structural, not stochastic — see point 4 below).

Discovered during the 2026-07-18 D8 re-run, *after* confirming D-04's discuss/WriterMemory plumbing is fixed. This is a materially different failure mode from D-04 (which was an empty API response); here the full context chain works correctly and the model still disobeys its own explicit rule.

**Setup:** Real 3-turn discuss thread on finding `25499afe` (fragment-endings/prose critique), Maya stating a lean-chapters intent each turn. Last assistant turn emitted a `suggestedConstraint`. Finding dismissed via `PATCH .../findings/25499afe`. `GET /api/memory` confirmed exactly 1 new `WriterMemory` row, `source:"conversation"`, content verbatim-matching the `suggestedConstraint`, `findingId` linked, `active:true`.

**Repro:** Fresh `dev-edit` run (session `11d0cf46-e688-4627-9e8b-5c6a83550316`, chapter content byte-identical to before — no edit was made in between) via `POST .../agent {"workflowId":"dev-edit","chapterNumber":1}`, polled to completion over SSE (437.1s, 798 events, `final_status:"complete"`).

Expected: the dismissed critique is not re-raised (or is explicitly re-raised only because it's now critical — it isn't). **Actual:** new finding `d0f79766` appears, `originalText` byte-identical to `25499afe`'s, same `category` ("prose"), same paragraph, functionally the same suggested edit. Severity `"suggestion"` (not critical). The finding's own `rationale` text paraphrases awareness of the writer's stated preference ("For a writer who confirmed the chapter should remain short and sparse...") — proving the model *read* the relevant context — yet created the finding anyway.

**Root cause, traced through code (not inferred):**
1. WriterMemory reaches the prompt unconditionally: `assembleAgentPrompt()` (`src/lib/agents/prompt-assembler.ts:1445`, called from `src/lib/agents/orchestrator.ts:169`) injects `formatWriterMemoryForPrompt()` output at Section 5b (priority 90, no profile gate).
2. `<finding_history>` also reaches the prompt for this specific agent type: `loadFindingHistory()` (`prompt-assembler.ts:1403-1437`, Section 11, priority 50) is gated by `profile.findingHistory && chapterNumber` — confirmed `dev-editor`'s `contextProfile.findingHistory: true` in `src/lib/agents/definitions.ts:201` (the only agent profile with this flag true).
3. dev-editor's own system-prompt template contains, verbatim (`prompt-assembler.ts` ~333-337, and near-identically at ~485-489, 576-580, 722-726 for other agent types):
   ```
   ## FINDING HISTORY AWARENESS
   - Check <finding_history> before creating findings
   - DO NOT repeat issues marked [APPLIED] — those are already fixed
   - If an issue was [DISMISSED], the writer chose to keep their text — do not re-flag UNLESS it's critical severity
   - If the writer replied to a finding, read their reasoning and adjust your analysis accordingly
   ```
   `25499afe` was dismissed, and both it and the new `d0f79766` are severity `"suggestion"` — the critical-severity exception does not apply. The model violated its own instruction.
4. Content-hash dedup (`src/lib/agents/tools.ts:1250-1269`) does not excuse this: `computeFindingHash(chapterNumber, category, description)` hashes the model's freshly-generated `description` text, confirmed to differ in wording between `25499afe` and `d0f79766` despite critiquing the same passage — so the hash differs and dedup never fires. Dedup provides no real protection against this class of re-raise.

**Distinct from D-04:** D-04 was a plumbing failure (200 response, empty payload, nothing ever persisted to WriterMemory). That is fixed. This defect occurs *with the plumbing fully working* — memory persisted correctly, history correctly injected, explicit anti-re-flag rule present and demonstrably read — and the model still violates its own rule. This is an instruction-following failure in the dev-editor's finding-creation behavior, not a missing-context or dead-code problem.

Evidence: `journey-log.md` "Step 1 RE-RUN (2026-07-18)"; `api-traces/d8-rerun-findings-after-devedit3.json` (contains both `25499afe` and `d0f79766` full JSON); `transcripts/d8-rerun-dev-edit-3-sse-raw.json`; `transcripts/d8-rerun-turn{1,2,3}.json`; `api-traces/d8-rerun-memory-after-dismiss.json`.

**Hash-variation control:** not run. Judged unnecessary — this is not the ambiguous "finding wasn't re-raised, could be memory OR could be dedup" case the control exists to disambiguate. It is the opposite: an unambiguous re-raise, with a code-traced root cause independent of any content-hash question.

**Severity:** should be treated as no less severe than D-04 was — it directly negates the D8 grading dimension's core promise ("tell it once, it remembers"), the loop still fails end-to-end for the end user even though the underlying transport bug is fixed.

**Status: FIXED-VERIFIED (2026-07-18).** Deterministic persist-time suppression landed and re-verified via dev-edit #4 — see the STATUS UPDATE block at the top of this entry for the full re-verification protocol, verdict, and the live-trigger caveat.

---

## Retracted (false positives, self-corrected this session)

Two suspected defects raised earlier in this session — em-dash "mojibake" in discuss turn 1/2, and U+FFFD corruption in a finding's `description` field after dismiss — were **retracted after direct re-inspection of the raw evidence JSON files** (via file-read tools, not console printing). Both were artifacts of the Windows Git-Bash console silently re-encoding non-ASCII characters (em-dash U+2014, en-dash U+2013) as `�` on **display only**; the underlying JSON/DB bytes were correct UTF-8 throughout. Caught the same failure mode reproducing live in Step 3 on an unrelated hardcoded source string, which prompted re-checking the earlier claims rather than trusting the first read. See journey-log.md for the full self-correction note.

---

## Confirmed clean (explicitly recorded, not just omitted)

- **Turn-cap enforcement is correct and content-independent.** 4th discuss turn 409s exactly as designed even though turns 1-3 never produced real content — the cap logic and the LLM-call logic are cleanly separated.
- **Invalid BYOK key rejected cleanly.** `POST /api/settings/api-keys` with a bad OpenRouter key → 400 `{"error":"Invalid API key","provider":"openrouter"}`, no leak of internal validation detail.
- **Tier gate on series creation is clean and blast-radius-free.** Indie-plan `POST /api/series` → 403 with a clear upgrade message; the book the writer already owns remains fully accessible immediately afterward (no collateral lockout).
- **Return-visit dashboard math is real, not faked.** Backdated yesterday + today word counts sum exactly to the actual chapter word count; streak, best-streak, and weekly-average all compute correctly from the real `document_versions` deltas.
- **Malformed-JSON D-01 causes no partial/corrupt writes** — confirmed via control read immediately after the failed PATCH.
- **Worker singleton guarantee held for the entire session**, including through an unplanned app-server restart.

## D-33 (S3) — CreateFinding crashes with raw internal TypeError when model omits paragraphNumber

**Found by:** p1-reverify during D-13 re-verify dev-edit #4 (2026-07-18), SSE ev#570-573, toolUseId call-955d8ca6. **Pre-existing** — not introduced by the D-13 fix.

**Mechanism:** model omitted `paragraphNumber` + `alternatives`. `validateFinding` range check (`tools.ts:104`) passes `undefined` (both comparisons false) → `paragraphs[NaN]` yields `undefined` (`tools.ts:110`) → `fuzzyMatch` throws at `haystack.normalize` (`tools.ts:62`). Tool returns raw `"Error executing CreateFinding: Cannot read properties of undefined (reading 'normalize')"` instead of corrective guidance.

**Impact (contained):** wrapper caught it; model self-recovered on attempt 2; run completed. But: raw internal error leaked to model, rejected-row analytics write (`tools.ts:1240`) bypassed, weaker model might not recover. Missing-alternatives alone WOULD be cleanly rejected (`tools.ts:139`) — only missing paragraphNumber reaches the throw.

**Evidence:** both attempts' toolInputs verbatim in `transcripts/d13-reverify-dev-edit-4-sse-raw.json`.

**Fix direction:** explicit presence/type validation of paragraphNumber before range check; rejection message naming the missing field; keep analytics write on the rejection path.
