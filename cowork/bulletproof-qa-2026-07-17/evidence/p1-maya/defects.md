# P1 "Maya" — Defects

Evidence-only. Severity uses the campaign S-scale (S1 data-loss/overcharge/leak/bypass/crash > S2 journey-blocking/fabricated-output/false-positive > S3 friction > S4 cosmetic). Raw traces in `api-traces/` and `transcripts/`.

---

## D-04 (canonical; filed in this doc as D-02 before renumbering) — Discuss endpoint returns HTTP 200 with a genuinely empty reply, for every turn, on this campaign's own BYOK validation model

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
