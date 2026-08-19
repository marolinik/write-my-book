# 46-series — D5 closed on camera: the finding-discuss turn streams (2026-07-27)

Sibling to [`UI-CAPTURE-2026-07-26.md`](./UI-CAPTURE-2026-07-26.md) (42-series) and
[`UI-CAPTURE-2026-07-27-d157.md`](./UI-CAPTURE-2026-07-27-d157.md) (43-series). Same persona, same
book, same identity mechanism.

**Persona** P1 (Maya) · **Book** "The Salt Letters QA P1 93181fd1" `4116055c-6183-4675-926a-e04f31126951`
· Chapter 1 · BYOK OpenRouter, `openrouter-qwen36/haiku` was the slot actually served.

**Under test:** `eeb1fd8` — *feat(editorial): stream discuss turns via first-text-gate SSE (P1/P6 D5 floor)*.
This is the live re-capture that `evidence/fix-reviews/D5-discuss-streaming.md` §6 listed as **owed**;
all seven items are answered below, in order, including the two disclosed warts.

**Baseline being replaced:** one blocking `POST …/discuss` with nothing on screen but a disabled input —
**157.2 s** at baseline and **61.6 s** on camera (P6 shots 42d / 45d).

**Harness:** Playwright chromium headless, 1280×1000 @2× DPR, `extraHTTPHeaders {x-e2e-test-secret,
x-e2e-clerk-id: user_qa_p1}`, `nextjs-portal{display:none}` (capture protocol v8), ENV-01 warm before
every leg, dev server `:3001`. **`.env` untouched** (`DEV_CLERK_ID` still `user_qa_p5`; the header
identity takes precedence). Drivers committed: `scripts/shot46.ts`, `shot46e.ts`, `shot46f.ts`, plus
the free probes `peek46.ts` / `peek46b.ts`.

The stream is measured **three independent ways** so nothing rests on the client's own state:

1. Playwright `response` events — status, `content-type`, `Server-Timing`;
2. an in-page `fetch` **tee** (`res.clone()`; the app consumes the untouched body) — per-SSE-frame
   arrival timestamps, i.e. cadence is *observed*, not reported;
3. a **25 ms DOM sampler** on `[data-testid="discuss-live-bubble"]` — what the writer's bubble actually
   showed, plus a tripwire that fires the instant `<<`, `>>`, `REMEMBER` or `REVISION` reaches the thread.

---

## Verdict

| Owed (fix review §6) | Shot | Result |
|---|---|---|
| 1. time-to-first-word, `text/event-stream`, `Server-Timing: ttft` | 46a | **PASS** |
| 2. token cadence, comparable to ghost text's 141 ms median | 46a | **PASS** — 32 / 32 / 98 ms medians |
| 3. a REMEMBER turn with no raw control syntax on screen mid-stream, chip at settle | 46b | **PASS** — 0 tripwire hits |
| 4. a REVISION turn: card arming at `done` + settle-tail duration (wart 2) | 46c | **PASS** — tail 984 / 488 / 279 ms |
| 5. the 3rd turn hitting the cap, cap notice replacing the input | 46d | **PASS** (+ 409 pre-stream probe) |
| 6. exactly one `discuss` usage row per delivered turn, registry id, on the panel | 46e | **PASS** — 3 turns → 3 rows |
| 7. abort mid-stream: nothing persisted, nothing billed, turn still available (wart 1) | 46f | **PASS** |

**It streams. It did not fall back to blocking JSON on any turn.** All four POSTs answered
`200 text/event-stream` with a `Server-Timing: ttft;dur=…` header.

---

## 46a — the numbers

One 3-turn thread on finding **`5c20c0e1-e763-43b6-b2f6-a6aaefbc7a9c`** (`show-tell`, `pending`,
**0 prior replies** — deliberately virgin, and *not* `036a088d`, whose legacy drifted turns the
43-series already spent). Sent through the real `ConversationInput` with Enter.

| | turn 1 | turn 2 | turn 3 |
|---|---|---|---|
| `content-type` | `text/event-stream` | `text/event-stream` | `text/event-stream` |
| `Server-Timing` | `ttft;dur=25356` | `ttft;dur=19343` | `ttft;dur=36129` |
| **first text frame at the tee** | **25 426 ms** | **19 416 ms** | **36 192 ms** |
| first text **rendered in the DOM** | 25 467 ms | 19 469 ms | 36 267 ms |
| render lag (byte to pixel) | **41 ms** | **53 ms** | **75 ms** |
| text frames | 16 | 17 | 4 |
| distinct chunk arrivals | 14 | 10 | 4 |
| median inter-frame gap (all frames) | 28 ms | 8.5 ms | 98 ms |
| **median gap between distinct arrivals** | **32 ms** | **32 ms** | **98 ms** |
| prose span (first to last text frame) | 462 ms | 431 ms | 722 ms |
| **settle tail** (last text to `done`) | **984 ms** | **488 ms** | **279 ms** |
| `done` frame at | 26 872 ms | 20 335 ms | 37 193 ms |
| HTTP body closed at | 26 892 ms | 20 369 ms | 37 232 ms |
| live bubble replaced by settled turn | 26 979 ms | 20 448 ms | 37 447 ms |
| streamed prose | 177 chars | 177 chars | 160 chars |

**Measurement caveat, disclosed:** the tee timestamps **chunk arrivals**, so several SSE frames sharing
one TCP chunk carry the same timestamp and read as a 0 ms gap. That is why the all-frames median
understates spacing; the "distinct arrivals" median is the honest network cadence. Both are reported.

The caret and the growth are real, not inferred — from the 25 ms sampler on turn 1
(`46-turn1.json`, `domGrowth`):

```
+8 241 ms   "The editor is replying…"            <- honest one-liner, never a blank bubble (D-104)
+33 672 ms  "Not▍"                       6 chars
+33 678 ms  "Noted. Per▍"               13
+33 703 ms  "Noted. Per your memory▍"   25
+33 763 ms  …                           36
+33 781 ms  …                           41
+33 905 ms  …                           89
+33 927 ms  …                          108
+33 954 ms  …                          116
+34 013 ms  …                          125
+34 028 ms  …                          143
+34 059 ms  …                          156
+34 106 ms  …                          171
+34 137 ms  …                          178 chars  (full prose)
```

Fourteen visible growth steps for one reply. `46-turn1-a-prefirsttoken.png` is the waiting line,
`46-turn1-b-midstream.png` the half-written bubble with the caret, `46-turn1-c-settled.png` the
settled turn.

**Against the baseline:** the writer now sees an honest waiting line immediately and real prose
appearing word by word at 19–36 s, versus a bare spinner for 61.6 s. But 19–36 s of that is a
**static** line with no progress and no elapsed time, and that is a structural consequence of the
first-text gate on a reasoning model — see **D-176**. An improvement, not a solved wait.

## 46b — the leak-proofing, attacked with real machine syntax

Both control blocks were genuinely emitted by the model this session. Verbatim from `finding_replies`:

```
turn 1 (assistant):  Noted. Per your memory preference, I'm dropping the show-tell flag …cadence:
                     <<<REVISION>>>
                     suggestion: She weighed the rush-toward-feeling against the architecture …
                     why: Trims the repetitive clause-chaining …
                     <<<END>>>

turn 2 (assistant):  Understood. The deliberate flatness is the point—…and withdraw the flag.
                     <<<REMEMBER category="preference">>>
                     Preserve Imogen's retreat into abstraction and taxonomy at emotional peaks as
                     deliberate characterization; do not flag interior classification as a show-tell lapse.
                     <<<END>>>
```

**None of it reached the screen.** The 25 ms tripwire (`<{2,}|>{2,}|\bREMEMBER\b|\bREVISION\b`, scanning
the whole thread wrapper on every tick) recorded **0 violations on all three turns**, and the same
regex over each settled card's full text also matches nothing. The streamed prose stops exactly at the
`<<<REVISION>>>` line — turn 1's stream ends `"…just tightens the syntax and cadence:\n\n"` — and the
block body and terminator are never emitted. The streamed text is a verbatim prefix of the settled
bubble on all three turns (asserted).

The promise still lands: at settle the chip reads, verbatim from `46-turn3-c-settled.png`

> *On "Keep as-is", I'll remember: "Preserve Imogen's retreat into abstraction and taxonomy at emotional
> peaks as deliberate characterization; do not flag interior classification as a show-tell lapse."*

Cross-evidence that the 43-series memory is live: turn 1's reply opens **"Per your memory preference,
I'm dropping the show-tell flag"** — that is `writer_memories.d6ae40cc` (stored by the 43-series
"Keep as-is") being fed back through `formatWriterMemoryForPrompt`.

## 46c — the REVISION card arms at `done`, and the settle tail is ~1 s, not 4.4 s

Turn 1's revision produced the **AI Rewrite Comparison** card (`46-turn1-c-settled.png`,
`46-turn3-c-settled.png`): `ORIGINAL (50 WORDS)` vs `AI REWRITE (34 WORDS)`, `-16 words`, word-level
diff, `Edit / Reject / Accept Rewrite`, plus `Use it` / `Keep as-is` in the action bar.

Wart 2 measured: the settle tail (last text frame to `done` — the window in which the full prose is on
screen but the revision card and "Use it" are not yet armed) is **984 / 488 / 279 ms**, an order of
magnitude below the 4.4 s the fix review warned about. `message_stop`-derived settle is doing its job
and the D-143 dead zone did not reappear.

D-41b write-back fired from the streamed path (DB, after the wave): `edit_findings.5c20c0e1.new_text`
is now the streamed revision (`"She weighed the rush-toward-feeling against the architecture…"`) and
`original_text` was narrowed to the anchor quote, exactly the D-105 span rule. Nothing was applied to
the chapter (no `edit_actions` row, `status` still `pending`).

## 46d — the cap, both halves

After the 3rd delivered turn the input is **replaced** by the notice, in the same frame as the revision
card and the chip (`46-turn3-c-settled.png`):

```
3-exchange cap reached — decide above, or undo to revise.
```

And the server half, probed immediately afterwards (free — the precheck rejects before any provider call):

```
POST …/findings/5c20c0e1…/discuss   ->  409  in 57 ms   application/json
{"capped":true,
 "assistantMessage":"You've discussed this finding thoroughly (3 exchanges). Ready to make a decision?",
 "userTurns":3}
```

**409, `application/json`, 57 ms, no `text/event-stream`** — the cap is decided before a stream is ever
constructed, as the fix review claims.

## 46e — billing on the streamed path (D-172 for the SSE route)

P1 had **zero** `discuss` usage rows before this wave (D-172 was only ever exercised on P6's blocking
turn). Three delivered turns produced exactly three rows:

```
agent_type | model                   |  in |  out | cost         | key_source | book_id     | recorded_at
discuss    | openrouter-qwen36/haiku | 563 | 1894 | 0.004706055  | user       | 4116055c…   | 03:32:34.724
discuss    | openrouter-qwen36/haiku | 693 | 1388 | 0.003528705  | user       | 4116055c…   | 03:35:28.000
discuss    | openrouter-qwen36/haiku | 799 | 1003 | 0.002634915  | user       | 4116055c…   | 03:37:31.341
                                                    ---------
                                                    0.010870
```

Registry slot id preserved (D-44), `key_source=user`, book attributed. On the writer's own panel
(`46e-usage-discuss-row.png`, `46e-assertions.json`):

```
Discuss    3 sessions    $0.01    2.1K in / 4.3K out
```

**Ordering note, stated because it differs from 45d:** on the streamed path the replies persist first
and the usage row lands after (`03:32:34.704` replies then `03:32:34.724` usage, +20 ms), whereas 45d's
blocking turn billed 96 ms *before* persisting. Both are bill-once-at-settle; the streamed route
deliberately writes the terminal frame before the billing round-trip (fix review §2.4) so the writer's
"Use it" never waits on Postgres. Not a defect — but a judge diffing the two waves should know the order
is path-dependent by design.

Output/input ratios (1894 out on 563 in, and so on) are the **D-100 / D-116 / D-117 reasoning-token
family** on `qwen/qwen3.6-27b`, the same signature 45d documented. Not new.

## 46f — abort is all-or-nothing, on camera

Second virgin finding **`e8418788-bd31-452b-ab93-0de3e77ea105`** (`prose`, `pending`, 0 replies). One
turn sent, the stream allowed to begin delivering prose (`46f1-midstream-before-leaving.png`), then the
writer **walks away** — a hard navigation to the book overview at **+55 184 ms**, mid-stream.

Network log, verbatim: `POST …/discuss -> 200 text/event-stream (Server-Timing: ttft;dur=54734)`, then
`POST … failed: net::ERR_ABORTED`.

Ground truth 20 s later, and again after re-opening the thread:

* `finding_replies` for `e8418788`: **0 rows** — nothing persisted.
* `usage_records` `agent_type='discuss'` for P1: still **3** rows / **$0.010870** — **no row for the
  aborted turn**.
* `GET …/discuss`: `userTurns: 0`, `canDiscuss: true` — **the turn was not consumed.**
* `46f3-turn-still-available.png`: the thread re-opens virgin, opening line only, composer offered.

That is wart 1 exactly as declared: the writer loses the turn's *output* but is charged nothing and
keeps the turn. The provider **was** paid for the tokens it produced (a ~55 s generation, so comparable
to a delivered turn, roughly $0.004) and that spend is invisible in-app — the disclosed honesty
boundary, restated here rather than glossed.

Harness honesty: the script's `inputStillOffered` assertion returned **false** and is *wrong* — it
grepped `innerText` for the composer's `placeholder`, which is an attribute, not text. The API's
`canDiscuss: true` and `46f3` are the real evidence. One attempt, no retry, per protocol.

---

## NEW defects (register of record; next free was D-176)

**D-176 — S3 — the streamed discuss turn still opens with a 19–36 s static, unquantified wait.**
The first-text gate cannot emit before the provider's first *text* delta, and `qwen/qwen3.6-27b` is a
reasoning model whose reasoning deltas are (correctly, per the channel isolation the gate inherits)
never forwarded. Measured across three consecutive turns: `Server-Timing: ttft;dur=` **25 356 / 19 343 /
36 129 ms**, during the whole of which the bubble shows one unchanging line, `"The editor is replying…"`
— no elapsed counter, no "still thinking", no cancel. The prose itself then lands in 431–722 ms. So the
fix converted a 61.6 s blind wall into a ~20–36 s *honest* wall plus a fast reveal; the dominant term is
unchanged and unmeasured on screen. Cheapest fixes, none of which touch the gate: an elapsed-seconds
counter in the waiting line; forwarding a reasoning-phase heartbeat as a progress frame (the keepalive
channel already exists); or routing discuss off the reasoning slot the way quick assist was routed off it
(`unfitForQuickAssist`, `d51514c`). Evidence: `46-turn{1,2,3}.json` (`ttftMs`, first two `domGrowth`
samples), `46-turn2-a-prefirsttoken.png`.

**D-177 — S4 — at settle the finished reply is briefly re-covered by the waiting line.**
The fix review claims the swap "clears `streamingText` in the SAME commit … no gap, no flash". The 25 ms
sampler shows a third state: after the full prose is displayed, the live bubble's own text reverts to
`"The editor is replying…"` and *then* the bubble is removed. Measured on all three turns — the revert
happens +991 / +514 / +293 ms after the last prose update and persists for **50 / 56 / 189 ms** before
unmounting. Mechanism: `onSuccess` does append the raw reply and clear `streamingText` in one commit, but
the live bubble is only *unmounted* when `isSending` flips, which react-query defers until `onSettled`'s
`invalidateQueries` resolves — so for that window the settled bubble and a waiting-line bubble are both
mounted. Below the perceptual threshold at 50 ms; at 189 ms (turn 3) it is a visible blink, and it will be
worse on a slow device or a slow invalidation. Fix shape: gate the live bubble on
`isSending && streamingText.length > 0`, or unmount it from the same state the settled append uses instead
of from `isPending`. Evidence: `46-turn{1,2,3}.json` `domGrowth` tail (178 chars → 23 chars
`"The editor is replying…"` → 0).

**D-178 — S4 — the writer's message is on screen twice for the whole turn.**
`ConversationInput.handleSend` only clears its textarea *after* `await onSend(...)` resolves, while
`useFindingDiscussion.onMutate` optimistically appends the same text as a writer bubble immediately.
Pre-streaming this duplication hid behind a spinner; now it is legible for the entire 20–37 s turn — the
sent bubble and the still-populated (disabled, muted) composer show identical text, and a writer cannot
tell whether the message was actually sent. Visible in `46-turn1-b-midstream.png` (bubble "I'm not
attached to that line…" above a composer containing the same sentence). Fix shape: clear the textarea
optimistically on submit and restore it on error (the error path already keeps the value for retry).
S4, but it undercuts the confidence the streaming fix is meant to buy.

**Observations (no number, per protocol):**
* Turn 3 delivered its whole 160-char reply in **4** frames (98 ms median) while turn 2 used 17 frames
  (32 ms). Felt smoothness is provider-chunk-shaped, exactly as fix-review wart 8 says; no client-side
  re-chunking was added and none should be faked.
* `Server-Timing: ttft` and the independent tee agree to within 60–70 ms on all four requests, so the
  product's self-reported latency header is trustworthy.
* Wart 2 (the 4.4 s `finalMessage()` settle tail) did **not** manifest: 279–984 ms. Either OpenRouter
  emitted `message_stop` on all three turns, or the fallback is faster than feared. Not proof it cannot
  happen — proof it did not here.
* The D-169 family holds on the streamed thread: no click inside the conversation navigated away during
  any of the four turns.

---

## Persona state changed by this capture (disclosed)

* **`5c20c0e1`** — was virgin `pending` with 0 replies. Now a **3-turn thread, capped**
  (`canDiscuss: false`) with an **armed revision**: `new_text` was overwritten by turn 1's discuss
  revision and `original_text` narrowed to the anchor quote (D-41b / D-105 write-back). Status still
  `pending`; nothing applied, no `edit_actions` row, chapter text untouched.
* **`e8418788`** — **unchanged**: 0 replies, `userTurns: 0`, `canDiscuss: true` (the aborted turn).
* **3 new `usage_records`** rows, `agent_type=discuss`, **$0.010870** on Maya's real BYOK key, plus one
  aborted generation the provider charged for and the app did not record (roughly $0.004, not measurable
  in-app).
* **No new `writer_memories` row** — the chip was rendered but "Keep as-is" was never clicked, so the
  constraint is offered and unstored, which is the correct pre-decision state. `036a088d`, `b92055ea`,
  `73b2781c`, `5c20c0e1`'s siblings: all untouched.
* **No `qa-seed-personas.ts` run.** No other persona's data touched. `.env` untouched.

## Harness note worth keeping (durable fix for a recurring bug)

The 42- and 43-series both hit `ReferenceError: __name is not defined` inside `page.evaluate`. Root cause
found and fixed for good: tsx/esbuild runs with `keepNames`, which rewrites an arrow named by its object
key — `{ value: (x) => x }` becomes `{ value: __name((x) => x, "value") }`. A `__name` shim cannot help,
because **the shim's own arrow gets wrapped too**. Every in-page snippet in `shot46*.ts` is therefore a
raw JS **source string** (`addInitScript({ content })`, `page.evaluate("(function(){…})()")`), which
bypasses the transform entirely. `shot45h.ts` / `shot45i.ts` use the shim variant, which works only
because their probe bodies contain no key-named arrows.
