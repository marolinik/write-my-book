# D5 lift spec — ghost-first first-text-gate SSE (design-panel synthesis)

**Date:** 2026-07-26 · **Lane:** wf_ab8cc8f5-377 (3 opus proposals -> 3 opus judges -> synthesis; Fable orchestrating)
**Panel scores:** stream-first 8/6.5/8 · honest-wait 7/7.5/6 · **ghost-first gate 9/8/9 (winner on every lens)**

**NEW DEFECT REGISTERED — D-142 (S2, billing integrity):** ghost-text AND inline-edit
routes call `client.messages.create(baseParams)` with NO `signal` (ghost route L125-129) —
a typing-resumed client abort completes server-side anyway and STILL writes a
`usage_record` + advances the free-tier meter. Writer pays for suggestions that were
never rendered. Verified by all three judges against the tree. Fixed by graft #3 of this
spec (thread `req.signal` on both routes) — must land with Stage 1. Next free: **D-143**.

---

I have everything verified against the tree. Here is the final implementation spec.

---

# Spec: Streaming Quick-Assist — Ghost-First First-Text-Gate SSE (P5 D5 lift)

**Status:** ready to implement · **Branch base:** `qa/bulletproof-2026-07-17` · **Effort:** Stage 1 ~3 days, Stage 2 ~+3 days (charted)
**Target:** P5 free-tier phone persona, D5 `responsiveness/latency honesty` (platform MIN 5.0; TRUST judge low 4.0) — lift the flagship ghost-text moment to read as a 9 with tokens visibly flowing on camera, with zero regression to the 5-round-stabilised honesty/billing machinery.

## 1. Decision

**Chosen: Proposal 3 — Ghost-first streaming via a first-text-gate SSE.** Panel: `9 / 8 / 9` (grade-lift, engineering-risk, writer-experience) — the top score on every lens. It ships the literal remedy the panel named (token flow) on the exact surface that has been the floor for eight rounds, at the lowest effort and the smallest attack surface, and it is the only design whose failure path keeps a **real HTTP status while streaming**.

Onto that base we graft the best ideas from Proposals 1 and 2 (all three judges' `bestIdeasToGraft` converge on the same list; every item below was verified feasible against the tree):

1. **First-text-gate** (P3 core) — hold the HTTP response server-side until the first real text delta; reasoning-only/cut-off return a true `422`/`502` JSON body *before any byte flushes*. The definitive answer to "streaming can't retro-change status."
2. **Text-vs-thinking channel isolation** (P1/P3) — consume only `text_delta`; drop `thinking_delta`/`redacted_thinking`. Verified: `MessageStream` emits separate `text` and `thinking` events (`lib/MessageStream.d.ts` L9/L12).
3. **Fix the verified abort-bills bug** (P2 headline) — the routes today call `client.messages.create(baseParams)` with **no signal** (ghost `route.ts` L125-129), so a typing-resumed abort completes server-side and writes a `usage_record` + advances the free meter. Thread `req.signal` on **both** routes.
4. **Warmup ping on editor mount** (P2) — the only lever that attacks the pre-first-token / cold-start window (streaming still waits full latency before token 1).
5. **Measured-latency disclosure** (P2) — `Server-Timing` header + `elapsedMs` in the `done` frame + a subtle timing chip. Delivers the panel's *second* named lever ("measured prod latency + honest cold-start story").
6. **Accept-armed-only-on-`done`** (P1/P3) — Tab/tap are no-ops until settle; partial fragment insertion becomes impossible by construction, so streaming cannot worsen **D-140**.
7. **Canonical `done` frame replaces accumulated deltas** (P1/P3) — the terminal frame carries the authoritative suggestion; the client swaps its delta accumulation for it before arming accept, so any delta-normalisation drift self-heals and D-130 join / D-132 tap operate on the final string.
8. **`settleQuickAssist()` shared refactor** (P1) — fold the duplicated `422`/`502` reasoning-only/cut-off branch out of both routes into one pure function reused by routes + stream engine.
9. **Attempt-stream-then-fallback-to-`create()`** (P1/P3) — degrade to today's exact non-streaming JSON on any of the 5 BYOK routes that can't stream. A lift with a floor.
10. **No-silent-hang watchdog** (P2 + the agent route already models it at `stream/route.ts` L131-162) — client `>8s` "still writing…" **top-anchored in the cursor overlay** (not a bottom sonner toast — stays D-139-clean) + a bounded server `timeout`.

## 2. Rejected ideas (one line each)

- **Proposal 1 full STREAM-FIRST (both endpoints)** — rejected: commits `200` immediately so `422`/`502` must ship as in-band error frames (weaker on the exact TRUST axis driving the floor), and spends most of a 10-day budget streaming inline-edit JSON-Lines, a higher-risk surface that has never reached camera and closes no uniquely-named gap.
- **P1 inline JSON-Lines prompt change (`one object per line`)** — rejected for Stage 1: many models emit pretty-printed/array JSON that breaks per-line parsing; the progressive feature may never fire while a whole-buffer fallback silently masks it. Deferred to a Stage-2 delimited protocol.
- **Proposal 2 self-calibrating progress bar** — rejected: a bar driven by a rolling *average* rather than real token production is an estimate dressed as progress; on a tail-latency request it stalls at 90% and becomes the D5 sin inverted. Against a panel that named streaming, a cleverer spinner caps D5 at ~7. (Its *measurement plumbing* and *warmup* are grafted; the *bar* is dropped — real token motion supersedes it.)
- **Proposal 2 as the primary approach (atomic-only)** — rejected: best floor, weakest ceiling; "read as a 9, flagship-moment feel" is not reachable with an absence-of-annoyance affordance. Its honesty edge is neutralised by the gate, which keeps real HTTP status *while* streaming.
- **EventSource transport** — rejected: POST body required; use `fetch` + `ReadableStream` reader.
- **Edge runtime for these routes** — rejected: Prisma + SDK require `runtime = "nodejs"`.
- **Streaming inline-edit in Stage 1** — rejected/deferred: not the phone lever, not on camera, higher grade-per-day risk. Charted for Stage 2 via the shared helper.

## 3. Architecture — the first-text-gate

The route consumes the provider stream **server-side** and does not commit the HTTP response until it knows whether usable text exists:

- **First text delta arrives** → return `200 text/event-stream` and pump the rest live (token frames → canonical `done` frame).
- **Stream ends with no text** (reasoning-only or cut-off) → the outcome is known *before any body byte flushes* → return the historical `422`/`502` **JSON** verbatim, travelling the client's existing `!res.ok` path.
- **Only residual in-band failure**: a provider error *after* the first text delta (rare at a 60-token budget) → a single terminal `error` frame, unbilled.

This is strictly more honest than committing `200` up front (P1), on exactly the TRUST dimension that owns the D5 4.0 low.

**Verified SDK substrate (`@anthropic-ai/sdk@0.74.0`):** `client.messages.stream(body, { signal, timeout })` → `MessageStream` which is `AsyncIterable<MessageStreamEvent>` and exposes `.aborted`, `.abort()`, `.done()`, `.finalMessage()`, and separate `text`/`thinking` events. `client.messages.create(body, { signal, timeout })` accepts the same `RequestOptions` (`request-options.d.ts`: `signal`, `timeout`, `maxRetries`).

## 4. Transport & frame protocol

New quick-assist SSE headers — note **`X-Accel-Buffering: no` and `no-transform` are NOT in the current agent-route `SSE_HEADERS`** (`agent/[sessionId]/stream/route.ts` L22-26 has only `Content-Type`/`Cache-Control`/`Connection`) — they must be **added**, not "copied":

```
Content-Type:      text/event-stream
Cache-Control:     no-cache, no-transform
Connection:        keep-alive
X-Accel-Buffering: no          // defeat proxy/CDN buffering so token 1 flushes
```

Frame shape (`data: {json}\n\n`, discriminated by `type` to match the repo's agent-route idiom; `: keepalive\n\n` every 15s reused verbatim):

```
data: {"type":"token","text":"…text delta…"}\n\n
data: {"type":"done","text":"…canonical full suggestion…","elapsedMs":1843}\n\n
data: {"type":"error","status":502,"error":"…","retryable":true}\n\n   // post-first-text drop only
: keepalive\n\n
```

The `error` frame body field names (`error`, `code`, `upgradeToTier`, `retryable`) are byte-compatible with today's HTTP error bodies, so `quickAssistErrorNotice(frame)` (`quick-assist-client-errors.ts` L33) maps it unchanged — no client seam.

## 5. File-by-file change list

### New — server

**`src/lib/api/sse-quick-assist.ts`** (~40 lines) — `QUICK_ASSIST_SSE_HEADERS` (above), `writeFrame(controller, encoder, obj)`, `keepalive(controller, encoder)`. Small, shared by ghost (Stage 1) and inline (Stage 2).

**`src/lib/llm/quick-assist-stream.ts`** (~140 lines) — the gate + the SSE body builder.

```ts
export interface GatedStream {
  firstText: string;                       // ≥1 non-empty text delta already received
  rest: AsyncGenerator<string>;            // subsequent TEXT deltas only (thinking dropped)
  final: () => Promise<Anthropic.Message>; // authoritative usage / stop_reason / content
}
export type GateResult =
  | { ok: true; gated: GatedStream }
  | { ok: false; reasoningOnly: boolean; truncated: boolean };

// Iterates the MessageStream; forwards ONLY content_block_delta where delta.type==="text_delta";
// silently drops thinking_delta / redacted_thinking. Resolves on the FIRST non-empty text delta
// (ok:true, `rest` continues the SAME iterator) OR on stream end with no text (ok:false; classify
// via isReasoningOnly(final.content) + stop_reason==="max_tokens"). Honors signal.aborted.
export async function gateQuickAssistStream(
  stream: MessageStream, signal: AbortSignal
): Promise<GateResult>;

// Builds the ReadableStream: firstText token frame → drain gated.rest as token frames →
// await gated.final() → settleQuickAssist(final.content, final.stop_reason) →
// bill iff kind==="ok" && !signal.aborted → done frame (canonical text + elapsedMs).
export function sseQuickAssistBody(
  gated: GatedStream, signal: AbortSignal,
  meta: { userId: string; bookId: string; model: ModelDefinition; isFree: boolean; startedAt: number }
): ReadableStream;
```

**Fallback (constraint #5):** if `client.messages.stream(...)` throws at connect or the gate rejects with a stream-unsupported error *before* first text (defensive; LiteLLM-proxy for openai/gemini/grok is the risk), the route catches and calls today's exact `client.messages.create(baseParams, { signal, timeout })` path, returning the **existing JSON `200 {suggestion}`** (or `422`/`502`). Worst case across all 5 routes = today's behavior, byte-identical. The client's content-type branch renders it with no stream reader.

### Edit — server

**`src/lib/llm/quick-assist.ts`** — add one pure function; keep every existing export:
```ts
export function settleQuickAssist(
  content: readonly ContentBlockLike[], stopReason: string | null
): { kind: "ok"; text: string } | { kind: "reasoning-only" } | { kind: "empty"; truncated: boolean };
```
Folds the currently-duplicated 422/502 branch (ghost `route.ts` L140-163, inline `route.ts` L181-…) into one source of truth reused by both routes + the stream engine.

**`src/app/api/books/[id]/ghost-text/route.ts`** — **all pre-flight logic byte-identical** (requireUser 401, `ghostTextRequestSchema.parse` 400, ownership 404, `checkQuota("ghost_text")` 429 wall with `upgradeToTier`/`remainingToday`, `resolveQuickAssistModelFor`, key load, `route.route==="none"` 400, `createLLMClient`, `systemPrompt`, `baseParams` `{model, max_tokens:60, system, messages}`). Add the `?warmup=1` branch (§7). Replace only the `create()` + empty-guard + billing block (L125-190) with:

```ts
const startedAt = Date.now();
const mstream = client.messages.stream(
  route.route === "openrouter" ? withQuickAssistReasoning(baseParams) : baseParams,
  { signal: req.signal, timeout: QUICK_ASSIST_TIMEOUT_MS }   // 12_000
);
const gate = await gateQuickAssistStream(mstream, req.signal);

if (req.signal.aborted) return new Response(null, { status: 499 });   // client bailed pre-first-token; no bill
if (!gate.ok) {
  const ms = Date.now() - startedAt;
  if (gate.reasoningOnly)
    return NextResponse.json(
      { error: modelNoQuickSuggestMessage("ghost-text"), code: MODEL_NO_QUICK_SUGGEST_CODE },
      { status: 422, headers: { "Server-Timing": `llm;dur=${ms}` } });
  return NextResponse.json(
    { error: gate.truncated
        ? "The suggestion was cut off before any text was produced. Please try again."
        : "No suggestion was generated. Please try again.",
      retryable: true },
    { status: 502, headers: { "Server-Timing": `llm;dur=${ms}` } });
}
return new Response(
  sseQuickAssistBody(gate.gated, req.signal, { userId: user.id, bookId, model, isFree: quotaResult.isFree, startedAt }),
  { status: 200, headers: { ...QUICK_ASSIST_SSE_HEADERS, "Server-Timing": `ttft;dur=${Date.now() - startedAt}` } });
```

**`src/app/api/books/[id]/inline-edit/route.ts`** — **Stage 1: stays atomic JSON** (no streaming, no prompt change). Two additive edits only: (a) thread the signal — `client.messages.create(params, { signal: req.signal, timeout: QUICK_ASSIST_TIMEOUT_INLINE_MS })` (20_000) and add `if (req.signal.aborted || (err as Error).name === "AbortError") return new Response(null, { status: 499 })` to the catch — closes the verified abort-bills bug here too; (b) add `elapsedMs` to the success/`422`/`502` bodies + `Server-Timing`. Migrate its 422/502 block to `settleQuickAssist`. Stage 2 (later) streams it via the same helper.

*No changes* to `quota-checker`, `free-tier-meters`, `client-factory`, `model-registry`, `validation` schemas, `translateProviderError`.

### New — client

**`src/components/editor/quick-assist-stream-client.ts`** (~60 lines) — `async function* readQuickAssistFrames(res, signal)`: `res.body.getReader()` + `TextDecoder`, buffers across chunk boundaries, splits on `\n\n`, ignores `:` keepalive lines, `JSON.parse`s each `data:` payload → yields `{type:"token"|"done"|"error", …}`. Robust to a frame split across two reads; returns silently on reader `AbortError`.

### Edit — client

**`src/components/editor/ai-ghost-text.tsx`** — add `const [streamDone, setStreamDone] = useState(false)`, reset to `false` at each fetch start and in every dismiss path (handleUpdate abort L243-247, selectionUpdate dismiss L294-298, Escape/typing L400-405, disabled cleanup L146-151). In `fetchSuggestion` (L153-223): the `!res.ok` branch is **unchanged** (still handles real `422`/`502`/`429`-wall/`400` via `quickAssistErrorNotice`). Replace the `data = await res.json()` success block (L193-205) with a content-type branch:
- `text/event-stream`: `for await (const f of readQuickAssistFrames(res, controller.signal))` — on first `token`: `setPending(false)`; accumulate into a ref, `setSuggestion(buf.slice(0, MAX_SUGGESTION_LENGTH))`; on `done`: `setWallNotice(null); wallSinceRef.current = null; setSuggestion(f.text.slice(0, MAX_SUGGESTION_LENGTH))` (canonical replaces accumulation), `setStreamDone(true)`, feed `f.elapsedMs` to the timing chip; on `error`: `surfaceError(quickAssistErrorNotice(f)); setSuggestion(null)`. Keep the `controller.signal.aborted` rechecks between awaits.
- else (non-stream `200`, i.e. fallback): existing json path, then `setStreamDone(true)`.

`acceptSuggestion` (L345), the Tab handler (L396-399), and `handleOverlayPointerUp` (L382-387) each early-return `if (!streamDone)`. The accept pill (`acceptHint`, both overlays L487/L505) renders only when `streamDone`; while streaming, live text shows **without** the pill (add a thin pulsing caret). Pending dots (L511-524) unchanged — they cover the pre-first-token window. **D-138 `buildPlacement` path untouched** (overlay anchored at the stable caret; growing text wraps inside the already-clamped `maxWidth`; no per-delta reposition). Abort semantics unchanged (typing/selection → `abortRef.current.abort()` → server sees `req.signal` abort → `mstream` aborted → reader `AbortError` swallowed). Add the `>8s` top-anchored "still writing…" watchdog (§7) inside the cursor overlay.

**`src/hooks/use-inline-edit.ts`** + **`src/components/editor/inline-edit-popup.tsx`** — **no change in Stage 1** (mutation + `Loader2` spinner stay). Stage 2 adds a `streaming` phase between `loading` and `results`.

### Tests (new/edited) — see §11.

## 6. Billing decision table

**Invariant (unchanged intent — D-04/D-36/D-38):** `usageRecord.create` + `recordDailyUse` advance **only** on a genuine, non-empty, *delivered* result. The write merely relocates from after `create()` to inside `sseQuickAssistBody`, after `await gated.final()`, computed on `final.usage`, gated on `settle.kind==="ok" && !signal.aborted`, **bill-once**.

| Scenario | usage_record | free meter | Upstream provider | HTTP wire | Honesty rationale |
|---|---|---|---|---|---|
| Success: ≥1 text delta, stream completes, `done` emitted | WRITE 1 (`final.usage`) | +1 if `isFree` | full call | `200` stream | canonical suggestion delivered + accept armed |
| Reasoning-only at end (thinking only) | none | none | full call | `422` JSON `MODEL_NO_QUICK_SUGGEST` | no deliverable; **real status via gate** |
| Cut-off / empty at end (`max_tokens`, no text) | none | none | full call | `502` JSON `retryable` | no deliverable; real status via gate |
| Provider error **before** first text | none | none | (translated) | `502`/`500` JSON | gate resolved not-ok; no body flushed |
| Provider drop **after** first text (partial shown) | none | none | aborted | `200` + `error` frame | accept never armed (`streamDone=false`) — nothing acceptable delivered |
| **Client abort before first token** (typing/selection/unmount) | none | none | **aborted** (`req.signal`→`mstream`) | `499` (client gone) | nothing delivered; we cancel upstream to minimise BYOK token cost |
| **Client abort mid-stream** (tokens seen, before `done`) | none | none | **aborted** | `200` truncates | accept was never armed, suggestion discarded, never kept — advancing a free user's meter for a suggestion they never completed would be dishonest |
| 429 cap wall / 400 no-key / 404 / 401 / zod 400 | none | none | not called | real status, **pre-stream** | unchanged pre-generation gates (D-134 banner intact) |
| Warmup ping (`?warmup=1`) | none | none | not called | `200 {warmed:true}` | returns before `checkQuota`; no LLM, no DB write |

**Mid-stream abort — explicit honesty statement (constraint #1):** on `req.signal` abort we call `mstream.abort()` immediately to stop upstream generation (minimising the user's own real BYOK per-token charge for tokens they will never see) and write **neither** a `usage_record` **nor** a meter increment. Accept is arm-gated on `done`, so no fragment the writer could act on was ever delivered; billing sits strictly after `finalMessage()` behind `!signal.aborted`, so a `final` that resolves post-abort cannot bill. The one residual we **disclose rather than hide**: a provider may still charge the user's own key for the handful of pre-cancellation tokens — that unavoidable cost never touches our meter or `usage_record`, which is what the quota and the "paid for silence" complaint are about.

## 7. Cold-start, warmup, measurement, watchdog

**Streaming does NOT fix cold-start** — the gate still waits the full route-compile/lambda-cold + time-to-first-token latency before token 1. Three grafts answer the other half of the D5 complaint:

- **Warmup ping** — `if (req.nextUrl.searchParams.get("warmup")==="1")` branch placed *after* `requireUser()` (still authed, no anon probe) but *before* `checkQuota`/key-load/LLM → `return NextResponse.json({ warmed:true }, { status:200 })`. Reaching the handler JIT-compiles the route module. Fired fire-and-forget once on editor mount (`ai-ghost-text.tsx` mount effect) and on inline-popup open, `keepalive:true`, never awaited, never bills. **Honest caveat (do not oversell):** on Vercel a warmup warms whichever lambda instance it lands on, not necessarily the instance the real call routes to — a single-instance/dev win, best-effort in multi-instance prod. The real cold-start *honesty* comes from measurement below, not from claiming warmup eliminates it.
- **Measured latency** — `Server-Timing: ttft;dur=<ms>` on the `200` stream (time-to-first-text), full `llm;dur=<ms>` on `422`/`502` error bodies and as `elapsedMs` in the `done` frame. Client renders a subtle timing chip on the accept pill gated to `elapsedMs > 2500` so warm hits stay clean — the literal "measured latency surfaced in UI" the panel asked for by name.
- **No-silent-hang watchdog** — server `timeout` (12s ghost / 20s inline) turns an infinite hang into a deterministic `502 retryable`; client `>8s` "still writing…" (`role=status`, `aria-live=polite`) rendered **top-anchored in the cursor overlay, not a bottom sonner toast** (stays clear of the D-139 occlusion class). This is the piece that lets the design make an honest **D2/reliability** claim, since streaming otherwise adds reliability surface.

## 8. Error / status design (constraint #2)

Two tiers, neither depending on retro-changing an HTTP status:

- **Pre-generation (real HTTP status, before the stream opens):** `401`/`400`-zod/`404`/`429`-wall/`400`-no-key are decided before `stream()` and returned as ordinary `NextResponse.json`. The client's existing `!res.ok` branch → `surfaceError(quickAssistErrorNotice(body))` is untouched, so the **D-134 persistent wall banner**, the `wallSince`/`WALL_RETRY_MS` suppression window, and every pre-flight copy string are preserved exactly.
- **Post-generation no-text (real HTTP status, via the gate):** reasoning-only → `422 {code:"MODEL_NO_QUICK_SUGGEST"}` (byte-identical to today, `openSettings` deep-link preserved), cut-off/empty → `502 {retryable:true}`. Chosen before any byte flushes.
- **Success streams `200`**, terminal frame is `done` (never an error — the gate guaranteed text). The single residual in-band case (provider drop after first text) is an `error` frame mapped through the same `quickAssistErrorNotice`.

## 9. Reasoning models (constraint #3)

`gateQuickAssistStream` forwards only `content_block_delta` where `delta.type==="text_delta"`; `thinking_delta`/`redacted_thinking` are dropped — streamed reasoning is structurally incapable of rendering as prose (never read). `withQuickAssistReasoning({enabled:false})` still attaches on the OpenRouter route to suppress thinking at source. Reasoning-only-at-end is classified via the existing `isReasoningOnly(final.content)` on `finalMessage()` → the real `422`, identical to today, just evaluated post-`finalMessage` instead of post-`create`. `resolveQuickAssistModelFor` (routing around `unfitForQuickAssist` D-116/D-117) is untouched.

## 10. Client state machine (ghost)

`idle → pending(dots, pre-first-token) → streaming(growing ghost, caret, NO pill, accept DISARMED) → settled(full ghost + pill, accept ARMED)`. Transitions: first `token`→ dots off; `done`→ `streamDone=true`, canonical text, wall cleared, chip if `>2.5s`; `error`→ surfaceError + clear; typing/selection/Escape/disable → abort + reset `streamDone`+`suggestion`. Accept (Tab / tap / pointerup) is inert unless `streamDone`; on accept, `joinGhostSuggestion(charsBefore, suggestion)` (D-130) inserts the canonical string once, then `focus()` — unchanged. `>8s` without `done` → top-anchored "still writing…".

## 11. Test plan

**Unit (Vitest; mirror the hoisted-mock pattern in `tests/unit/ghost-text-empty-billing.test.ts`; stub `client.messages.stream` to a fake `MessageStream` = async-iterable of scripted events + `finalMessage()`):**
- `quick-assist-stream.test.ts` — gate: (a) text-first → `ok:true`, `firstText` = first non-empty delta, `rest` yields the remainder; (b) thinking_delta then text_delta → thinking dropped, `firstText` = the text; (c) thinking-only, `max_tokens` → `ok:false, reasoningOnly:true`; (d) empty/whitespace, `max_tokens` → `ok:false, truncated:true`; (e) abort before first text → generator ends, no throw leak; (f) channel isolation — interleaved thinking+text → forwarded text === text-channel concatenation only.
- `ghost-text-stream-route.test.ts` — (a) success → `200 text/event-stream`, decoded frames = token…+`done` with canonical text, `usageRecord.create` **exactly once** with `model.id`+`final.usage`, `recordDailyUse("ghost")` once iff `isFree`, zero when paid; (b) reasoning-only → `422 MODEL_NO_QUICK_SUGGEST`, not billed; (c) cut-off → `502 retryable`, not billed; (d) `checkQuota` !allowed → `429` unchanged, `stream()` never constructed; (e) `route==="none"` → `400`; (f) **abort before first token** → `499`, not billed, `mstream.abort()` called; (g) **abort after first delta** → not billed, no `recordDailyUse`; (h) stream() rejects at connect → falls back to `create()`, identical billing + JSON body.
- `quick-assist.test.ts` — `settleQuickAssist` decision table (ok / reasoning-only / empty-truncated / empty-not-truncated).
- `quick-assist-stream-client.test.ts` — frame split across chunk boundaries reassembles; multiple frames per chunk; `:` keepalive ignored; `error` frame → `quickAssistErrorNotice` → `openSettings` for `MODEL_NO_QUICK_SUGGEST`; reader `AbortError` → silent.
- `inline-edit` route — abort → `499`, not billed; success adds `elapsedMs`.
- **Regression:** `ghost-text-join`, `quick-assist-routes`, `quick-assist-client-errors` green; update `ghost-text-empty-billing.test.ts` so its not-billed assertions run through the gate (invariants identical).

**Component (RTL, fake `ReadableStream`):** dots before first delta; ghost grows on `token`; accept **disarmed** until `done` (Tab/tap no-op mid-stream) then armed; `error` frame → `422` Open-Settings / `502` retryable copy; typing during stream → abort+dismiss; pre-flight `429` → wall banner unchanged.

**On-camera (P5 v7 phone bundle — the literal D5/D10 lever; iPhone ~390px emulation, gif harness like `wf_1e6a24aa`, Sam persona):**
1. **GIF-1 "token flow" (headline):** type >50 chars → 1.5s pause → pending dots → ghost text growing word-by-word → settled ghost + "Tap to accept" pill. Rebuts "stares at pending dots with no token flow."
2. **Network shot:** one POST `/ghost-text`, `Content-Type: text/event-stream`, EventStream tab showing `token×N` then `done` (proves streaming, not polling).
3. **ttft / cold-start shot:** first call after restart, dots→first-token timestamped from `Server-Timing: ttft`; annotate the D-128 dev-compile caveat (real prod number is a prod-only measure task, constraint #6).
4. **Timing chip:** a warm reveal with the subtle `~1.Ns` chip (gated `>2.5s`).
5. **Tap-accept:** tap pill inserts the canonical joined suggestion (D-130 join + D-132 tap intact through the `done` path).
6. **Billing-integrity pair (TRUST shot):** `usage_records`/meter **+1** after a settled stream vs **UNCHANGED** after an aborted (resume-typing) stream vs **+0** at the 429 wall.
7. **Backstop carries:** staged reasoning-only flag → real `422` copy + Open Settings; `429` top-anchored wall banner unchanged (D-134).

## 12. Phased delivery

**Stage 1 — next session (~3 days), ships the win:** `sse-quick-assist.ts` + `quick-assist-stream.ts` + `settleQuickAssist()` refactor; ghost-text route → gate + warmup + measurement + timeout; `quick-assist-stream-client.ts`; `ai-ghost-text.tsx` streaming state machine + accept-on-settle + watchdog + chip + warmup-on-mount; **inline-edit route abort-signal + timeout + `elapsedMs`** (atomic, closes the abort-bills bug on both routes). Full unit/component/integration suite + the on-camera bundle.

**Stage 2 — later (~+3 days), charted:** inline-edit progressive streaming via the shared gate + a delimited protocol (stream rewrite #1 prose, sentinel, then `{label}`+alternatives JSON tail); `inline-edit-popup.tsx` gets a `streaming` phase; optional D-140 sentence-boundary trim applied at the `done` settle point. Deferred because inline-edit is the secondary surface, not on camera, and is the JSON-streaming risk.

**Separate lanes (not this spec, already registered):** D-138 overlay layout, D-139 toast anchoring, inline-edit-on-touch capture, non-seeded manuscript run — cheap presentational/evidence wins that stack on top of Stage 1.

## 13. Open questions (near-zero — all decided; two are prod-verify, not design)

1. **Vercel streamed-Response buffering** — decided path (`X-Accel-Buffering: no` + `no-transform` + fallback), but the sub-800ms ttft target must be **verified on the real prod deploy** (dev is unbuffered). If a platform layer buffers, the ttft artifact exposes it honestly and the fallback still ≥ today. *Verification, not a decision.*
2. **Cold-start prod number** — measured via `Server-Timing: ttft` in prod only (D-128 scope rule); dev-compile latency is explicitly excluded from the artifact. *Prod-only measure task.*
3. **Founder decisions required: none.** BYOK pre-abort token cost is decided (never touches our meter/usage_record; disclosed). Warmup prod efficacy is decided (best-effort, not oversold; measurement carries the honesty).

---

**Verified codebase facts this spec rests on** (read this session): `@anthropic-ai/sdk@0.74.0`; `messages.stream(body,{signal,timeout})`→`MessageStream` (`AsyncIterable`, `.aborted`/`.abort()`/`.finalMessage()`, separate `text`/`thinking` events — `lib/MessageStream.d.ts` L9/L12); `messages.create(body,{signal,timeout})` supports `RequestOptions.signal`/`timeout`. Ghost route calls `create(baseParams)` with **no signal** at L125-129 → the live abort-bills bug all three judges cite. Pre-flight order (401/400/404/429-wall/400-none) all resolve before the LLM call. Agent SSE route (`agent/[sessionId]/stream/route.ts`) ships the `data:{json}\n\n` + `: keepalive` + terminal `type` + `_req.signal` abort convention, but its `SSE_HEADERS` (L22-26) **lacks `X-Accel-Buffering`** — must be added. `quickAssistErrorNotice` (`quick-assist-client-errors.ts` L33) reads `error`/`code`/`upgradeToTier` off an arbitrary object → the error-frame seam is free. Relevant files (all absolute): `D:\Projects\wmb-pub\src\app\api\books\[id]\ghost-text\route.ts`, `…\inline-edit\route.ts`, `…\agent\[sessionId]\stream\route.ts`, `D:\Projects\wmb-pub\src\lib\llm\quick-assist.ts`, `…\client-factory.ts`, `…\index.ts`, `D:\Projects\wmb-pub\src\components\editor\ai-ghost-text.tsx`, `…\inline-edit-popup.tsx`, `…\quick-assist-client-errors.ts`, `D:\Projects\wmb-pub\src\hooks\use-inline-edit.ts`, `D:\Projects\wmb-pub\cowork\bulletproof-qa-2026-07-17\evidence\judging\P5-REJUDGE-V6-AGGREGATE.md`.

