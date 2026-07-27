# D5 — stream the finding-discuss turn (P1 / P6 floor driver)

**Branch** `qa/bulletproof-2026-07-17` · **base** `3a2897c` · **status** code + tests landed, **live capture still owed**

## 1. The defect being closed

`POST /api/books/:id/editorial/findings/:findingId/discuss` was one blocking
request. Live twice: **157.2 s** at baseline and **61.6 s** on camera (shot 42d),
with nothing on screen but a disabled input — no bubble, no token, no progress,
no honest "still working" line. Meanwhile the in-editor quick assist streams at
~141 ms median token gaps through the D5 Stage-1 first-text-gate SSE
(`01192a3`, `1de4ef0`). The P1 and P6 judges independently named this turn as
the remaining D5 lever, so the same proven pattern is now applied to it.

## 2. Shape chosen

### 2.1 Server: the same first-text gate, reused not re-implemented

`gateDiscussTurnStream` (in `src/lib/editorial/discuss-llm.ts`) calls the
**existing** `gateQuickAssistStream` from `src/lib/llm/quick-assist-stream.ts`.
That is deliberate: the gate, its `message_stop`-derived settle accumulator
(D-143), its "thinking deltas are never forwarded" channel isolation and its
abort handling are already camera-proven, and there is now exactly one
implementation of them.

Consequences, all preserved from the blocking turn:

- The provider stream is consumed **server-side** until a real text delta lands.
  Until then no byte of body is flushed, so a turn that produces no usable text
  still answers the historical **502 JSON** (`emptyTurnResponse()`), and a client
  that already went away still answers **499**. The route only commits to
  `200 text/event-stream` once it knows there is prose to deliver.
- The **doubled-budget retry** (D-04) survives: a text-less attempt that stopped
  on `max_tokens` is retried once at `DISCUSS_MAX_TOKENS * 2`; every other empty
  outcome is a hard fault a bigger budget cannot fix.
- **Bill-at-settle (D-172), bill-once**, summed across every attempt the turn
  made (the retry is a real second charge), carrying the **registry** model id
  (D-44) and the book id. No usable text ⇒ no row (the deliberate D-04/D-38
  line), and the wasted spend is `console.warn`ed rather than silent.
- **D-142**: `req.signal` threads into `client.messages.stream(...)` and into the
  gate. A writer who leaves stops the provider call.

### 2.2 Control-block leak-proofing — the load-bearing decision

A discuss reply is prose **plus** machine control blocks the writer must never
see (`<<<REVISION>>>`, `<<<REMEMBER category="…">>>` … `<<<END>>>`, plus the
D-157 drift where the model closes with **two** brackets).

**The rejected shape** was "stream raw deltas, let the client re-run the settled
sanitizer". It leaks by construction, not by accident: every stripper we own
(`parseDiscussResponse` and the `sweepUnparsedControlBlocks` belt-and-braces
pass) needs a **complete span**. An opener whose terminator has not arrived is
deliberately left alone — it reads as prose — and that is exactly the state a
half-written block is in for the whole time the model spends writing it. The
client would paint `<<<REMEMBER category="preference">>` on screen for seconds
and then retract it. `assistantBubbleText`'s last-resort `return content` branch
would re-leak it too.

**The chosen shape** is a server-side prose gate
(`src/lib/editorial/discuss-prose-gate.ts`) that emits only text it can *prove*
the settled parser keeps:

1. A **complete line** is classified by `controlDelimiterKind()` — newly exported
   from `discuss-prompt.ts` and now the **single** recognizer used by both the
   settled sweep and the gate. An opener suppresses output until its terminator;
   delimiters and block bodies are never emitted.
2. An **incomplete line** may only be emitted when it can no longer become a
   delimiter. Both delimiter regexes are anchored at `^<`, so the test is exactly
   "the first non-whitespace character exists and is not `<`". Whitespace-only
   and `<`-leading partials are held until the newline resolves them.

Why that is airtight rather than hopeful:

- `CONTROL_OPEN_RE` / `CONTROL_END_RE` are strict **supersets** of the strict
  block regexes (2-4 opening brackets vs 2-4, **1**-4 closing vs 2-4, attributes
  optional). There is no line the settled parser would strip that the gate can
  emit — including the D-157 two-bracket drift.
- The gate is stateful across chunk boundaries, so a delimiter delivered two
  characters at a time is still recognised (asserted at chunk sizes 2, 3, 5, 6, 7).
- The streamed text is therefore always a **subset** of the settled prose. The
  swap on `done` can only *add* text; it can never retract machine syntax.

### 2.3 Client: swap through the settled sanitizer, not around it

The `done` frame carries the same payload the blocking 200 returned **plus
`raw`** — the reply exactly as persisted. `useFindingDiscussion` appends that raw
string into the query cache and clears `streamingText` **in the same commit**, so
the finished turn is rendered by `assistantBubbleText(raw)`: the identical code
path a page reload takes. One sanitizer, one render, no gap, no flash.

The live bubble and a settled assistant bubble share one class constant
(`ASSISTANT_BUBBLE_CLASS`), so committing the turn cannot shift the thread under
the writer's thumb (D-147 clamp family). Before the first delta the bubble says
"The editor is replying…" rather than sitting blank (the D-104 rule about honest
one-liners instead of empty bubbles). D-169 stays satisfied: the new element is
non-interactive and lives inside the thread wrapper that already
`stopPropagation()`s, and a regression test clicks it to prove no navigation.

### 2.4 Frame protocol

```
{ type: "text",  text }                     prose-safe delta
{ type: "done",  …parsed, raw, userTurns,   settled turn (same body as the old 200)
                 capped:false, elapsedMs }
{ type: "error", status, … }                terminal failure / cap race
: keepalive                                 every 15 s (long turns outlive idle proxies)
```

Ordering (D-143): the terminal frame is written **before** the billing
round-trip, so the settled bubble and its "Use it" control never wait on
Postgres. A billing failure yields a delivered-but-unbilled turn (honest
direction), never an error frame after `done`.

### 2.5 Degradation (no feature-detect break)

- **Server**: `typeof client.messages.stream !== "function"` → `unsupported`; any
  throw before the first delta (connect error, a LiteLLM/proxy route that refuses
  streaming) is logged and falls through to `runDiscussTurn`. Worst case is
  byte-identical to the behaviour this fix replaces.
- **Client**: `content-type` feature-detect. A JSON body is consumed exactly as
  before, and the live bubble still shows the honest waiting line (so the
  fallback path also loses the bare spinner).

## 3. Files

| File | Change |
|---|---|
| `src/lib/editorial/discuss-prose-gate.ts` | **new** — incremental prose gate (leak-proofing) |
| `src/lib/editorial/discuss-stream.ts` | **new** — SSE pump, done-before-billing, abort/settle rules |
| `src/lib/editorial/discuss-stream-client.ts` | **new** — `consumeDiscussStream` state machine + boundary narrowing |
| `src/lib/api/sse-frames-client.ts` | **new** — SSE record reader extracted from the ghost reader (one parser) |
| `src/lib/editorial/discuss-prompt.ts` | exports `controlDelimiterKind` — one recognizer for sweep + gate |
| `src/lib/editorial/discuss-llm.ts` | `resolveDiscussClient` extracted; `gateDiscussTurnStream` + `bill()` added; `runDiscussTurn` behaviour untouched |
| `src/app/api/books/[id]/.../discuss/route.ts` | `settleTurn` shared by both paths; SSE response; 499/502 gate outcomes; `CAP_MESSAGE` / `emptyTurnResponse()` de-duplicated |
| `src/components/editor/quick-assist-stream-client.ts` | now a thin typed wrapper over the shared reader (logic identical) |
| `src/hooks/use-finding-discussion.ts` | stream-aware mutation, `streamingText`, raw-into-cache commit |
| `src/components/editorial/finding-conversation.tsx` | live bubble + shared bubble class constants |

## 4. Tests (TDD — RED first, 14 of 18 failing before implementation)

**`tests/unit/discuss-prose-gate.test.ts` (13)** — recognizer on exact + drifted +
prose-with-brackets lines; prose passes delta-by-delta; REMEMBER/REVISION blocks,
bodies and terminators never emitted (chunk sizes 2/3/5/6/7); structured-only turn
emits nothing; emission resumes after `<<<END>>>`; stray terminator withheld;
`<`-leading partial held then flushed as prose; whitespace-only partial held;
empty delta no-op; **streamed ⊆ settled prose**.

**`tests/unit/discuss-stream-route.test.ts` (13)** — 200 + `text/event-stream` +
`Server-Timing`; multiple text frames then one `done` with parsed payload, `raw`,
`userTurns`; both replies persisted with the **raw** assistant content; drifted
REMEMBER never in a text frame while `done` still carries the constraint; one
usage row with the registry id and real tokens; **done frame readable while the
billing write is still in flight**; cap 409 and rate-limit 429 both before any
stream is constructed; retry doubles the budget and bills 1400/2720 across both
attempts; no usable text → 502, nothing persisted, nothing billed; abort
pre-first-text → 499 + `mstream.abort()`; abort mid-stream → nothing persisted or
billed; provider cannot stream → blocking JSON with identical body and billing;
revision write-back (D-41b) still fires from the streamed path; cap crossed
mid-stream → terminal 409 frame with nothing persisted.

**`tests/unit/discuss-stream-client.test.ts` (7)** — deltas pushed in order then
settled payload; frame split across chunks; keepalives ignored; 409 → capped
result (not an error); other error frames throw the server's message; stream
ending with no terminal frame throws; no body throws.

**`tests/unit/discuss-stream-bubble.test.tsx` (5)** — honest pre-first-token copy
(never blank); partial reply rendered; swap to settled sanitized view with no
duplicate bubble and no `REMEMBER`/`<<<` anywhere on screen; live and settled
bubble geometry identical; D-169 click-does-not-navigate.

`tests/unit/finding-discuss-route.test.ts` re-pointed at the non-stream fallback
(its mock now returns `{ ok: false, reason: "unsupported" }`) — it pins
persistence semantics, the new suite pins the streamed contract.

**Suite: 1551/1551 across 185 files, green twice consecutively.** `tsc --noEmit`
clean for `src/**` and `tests/**` (the only errors in the repo are pre-existing,
in another lane's `cowork/**/p6-owen-rejudge/scripts/shot45*.ts` capture
scripts). `eslint` clean on all touched files.

## 5. Residual warts — disclosed, not hidden

1. **Semantic change: a mid-turn disconnect now loses the turn.** Before, the
   blocking route ignored `req.signal`, so a writer who closed the tab still had
   the reply persisted (and billed). Now abort ⇒ no persist, no bill, cap not
   consumed — all-or-nothing, per the D-142 rule. The alternative (bill and
   consume a turn nobody received) is the dishonest direction, but this *is* a
   behaviour change and should be named in the next re-judge.
2. **Settle tail on providers that never send `message_stop`.** Settle is
   `message_stop`-derived where possible (no D-143 dead-zone), but a provider that
   drops out of the lifecycle falls back to `finalMessage()`, which resolves only
   when the HTTP body closes (~4.4 s on OpenRouter when it happens). During that
   tail the writer sees the full streamed prose with the caret still blinking; the
   revision card / "Use it" arm only at `done`. Needs measuring on camera.
3. **Prose lines that genuinely start with `<`** (e.g. `<sigh> he said`) arrive one
   line late instead of character-by-character. Correctness over cadence.
4. **Inline control syntax is out of scope.** If the model writes
   `<<<REMEMBER …>>>` *mid-line*, the settled parser is line-anchored too and
   renders it as prose, so streaming it is not a new leak — it is the pre-existing
   D-157 family boundary. Candidate for a separate defect, not silently fixed here.
5. **Billing on a cap race.** A turn whose cap was taken by a concurrent turn
   between precheck and settle ends in a 409 frame but IS billed, because usable
   text was produced and the provider charged for it. Same as the blocking route.
6. **`DISCUSS_STREAM_TIMEOUT_MS = 240_000`** is a judgement call: far above the
   worst measured turn (157.2 s) so it can only kill a genuinely hung upstream.
   The blocking fallback keeps its historical no-timeout behaviour.
7. **A provider error *before* the first delta costs a second call.** The route
   degrades to a fresh blocking `runDiscussTurn`, so the failed attempt's tokens
   were charged by the provider and are invisible in-app. This is the same
   trade-off D5 Stage 1 shipped for ghost text (`stream()` reject → `create()`
   fallback) and the same honesty boundary as D-172's "unusable is not billed";
   worth naming rather than pretending the fallback is free.
8. **Word-level cadence is provider-shaped.** The gate emits per delta, so felt
   smoothness depends on the provider's chunking; no client-side re-chunking or
   artificial typewriter was added (that would be a cosmetic lie about latency).

## 6. What live re-capture must show (owed)

On the dev server as the persona, in the browser, one 3-turn discuss thread:

1. **Time-to-first-word** on a discuss turn (network panel: `text/event-stream`,
   `Server-Timing: ttft`), versus the 61.6 s all-or-nothing wall in shot 42d.
2. **Token cadence** — screenshots/GIF of the bubble filling, plus a frame-gap
   measurement comparable to the ghost-text 141 ms median.
3. **A turn that ends in a REMEMBER block**, proving no `<<<`/`>>`/`REMEMBER`
   ever appears on screen mid-stream while the constraint chip still shows at
   settle (the D-157 lane, now with a streaming attack surface).
4. **A REVISION turn**, showing the revision card arming at `done` and the
   settle-tail duration (wart 2).
5. **The 3rd turn hitting the cap** and the cap notice replacing the input.
6. **`usage_records`**: exactly one `discuss` row per delivered turn, registry
   model id, spend visible in the per-book usage panel (D-172 on camera for the
   streamed path).
7. **Abort**: navigate away mid-turn, then show no usage row, no reply persisted
   and the turn still available (wart 1 on camera).
