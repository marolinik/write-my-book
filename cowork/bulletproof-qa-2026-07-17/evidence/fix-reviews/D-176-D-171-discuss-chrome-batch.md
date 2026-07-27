# Fix review — P1/P6 v3 consensus wave: the discuss wait, plus the cheap batch

**Branch** `qa/bulletproof-2026-07-17` · **lane** fix-lane (concurrent with the batch lane and the
story-bible lane; no files shared) · **date** 2026-07-27

Drivers: `evidence/judging/P1-REJUDGE-V3-AGGREGATE.md` (6.5 unanimous, floor **D5 @6.5 driven by
D-176 3/3**, co-floor **D9 @6.5** = D-165 evidence gap + **D-171** one-way-glass memory) and
`evidence/judging/P6-REJUDGE-V3-AGGREGATE.md` (7.0 unanimous, floor **D5 @7.0, driver D-176 3/3**,
co-drivers D-139 FAB + the Skip-only D4 walk). Both panels' *next-action consensus* was the same
single lever: **make the 19–36 s pre-first-token discuss wait legible, alive and cancellable**, then
prove it on camera. P6 asked for the "2-line D-139 FAB offset fix" in the same pass; P1 asked for the
"near-free" `WriterMemoryPanel` mount.

Nothing here touches the first-text gate.

---

## 1. D-176 (S3, THE floor driver for both personas) — the wait is now measured, alive, cancellable

### What was wrong
`ttft;dur=` **25 356 / 19 343 / 36 129 ms** across three consecutive streamed turns (46-series), during
all of which the live bubble showed one unchanging line — `"The editor is replying…"`. No elapsed
signal, no phase, no way out. The prose itself then landed in 431–722 ms. A 61.6 s *blind* wall had
become a ~20–36 s *honest* wall, and the dominant term was still unmeasured on screen.

### The one design decision worth arguing about: why the liveness signal is client-side

The wave brief suggested reusing the SSE keepalive channel, or adding a `heartbeat` frame "every ~3 s
in the gate loop". **That is not possible without giving up the first-text gate**, and the gate is
exactly what the D5 fix bought:

`route.ts` awaits `gateDiscussTurnStream(...)` *before it constructs a `Response`*. That is the whole
point — until the first prose delta exists, the route can still answer an honest `409` (cap crossed
mid-flight) or `502` (D-04 empty turn) as JSON with **no byte flushed**. There is no open HTTP
response to write a heartbeat frame into during the reasoning phase. Emitting one would mean
committing `200 text/event-stream` before we know prose will arrive, i.e. reverting the gate and
re-opening the "streamed 200 that turns out to be a failure" class.

The keepalive that *does* exist (`QUICK_ASSIST_KEEPALIVE_MS`, `discuss-stream.ts:74`) starts only
after the first delta, and is a proxy-idle guard, not a writer-facing signal.

So the wait is instrumented from the only clock that is both available and honest during that window:
**the writer's own**. Nothing is inferred about provider internals, and the copy quotes the *measured*
band rather than a hope.

### Shape

| Piece | File | Note |
|---|---|---|
| Phase + cancel copy (pure) | `src/lib/editorial/discuss-wait-phase.ts` (new) | 3 bands: `<8 s` "The editor is replying… / Thinking before the first word."; `8–39 s` "The editor is still thinking… / This editor reasons before it writes — the first words usually land 20–40s in."; `≥40 s` "…/ Longer than usual. You can cancel and keep your turn — nothing is saved until a reply arrives." Plus `formatWaitElapsed` (`9s` → `1m 35s`). |
| Ticking counter | `src/hooks/use-elapsed-seconds.ts` (new) | Interval samples the clock; elapsed is **derived** from `now − startedAt` at render, so a throttled/backgrounded tab reports true elapsed time, not a tick count. |
| Turn clock + abort handle | `src/hooks/use-finding-discussion.ts` | `turnStartedAt`, `cancel()`, `AbortController` on the POST + `consumeDiscussStream`. |
| Wait chrome | `src/components/editorial/finding-conversation.tsx` | Counter inside the live bubble; heartbeat dot + phase hint + **Cancel** in a sibling row (`discuss-turn-controls`) that mounts/unmounts with the bubble in one commit. |
| Fallback-path honesty | `.../discuss/route.ts` | see below. |

Details worth flagging:

* **Screen readers.** The bubble stays `aria-live="polite"` for the phase label, but the per-second
  counter is `aria-hidden` — a polite live region re-announcing a number every second is unusable.
  Asserted.
* **Cancel is real.** `cancel()` sets a `cancelledRef` *then* aborts the controller. The abort
  reaches the route as `req.signal`, whose all-or-nothing path (D-142, already proven) settles
  nothing, persists nothing and consumes no exchange. Asserted at the state level (the fetch's own
  `AbortSignal` is observed going aborted).
* **Cancel stays available mid-stream** (the abort is honest at any point); the counter/hint retire
  once prose is on screen, because the prose itself is the liveness signal.
* **Copy honesty.** The cancel hint promises only what the abort proves — *nothing saved, no exchange
  used*. It deliberately makes **no billing claim**: the provider charged ≈$0.004 for the aborted
  46-series turn and the app could not record it. A test asserts the string never grows the words
  bill/charge/free/cost.
* **The blocking fallback was a hole in that promise.** When the provider route cannot stream, the
  route falls back to `runDiscussTurn`, which takes no signal (the remaining half of D-142). A cancel
  there would have aborted the client fetch while the server happily persisted the turn — the copy
  would have been a lie. Added guard: `if (req.signal.aborted) return 499` **before** `settleTurn`.
  The turn is now all-or-nothing on both paths. New route test `(l)`.
* **Founder-call registered (both panels, unchanged by this fix):** the only lever that shortens the
  19–36 s *term itself* is routing discuss off the reasoning slot the way quick assist was
  (`unfitForQuickAssist`, `d51514c`). This wave makes the wait honest; it does not make it short.

## 2. D-177 (S4) — the settled reply can no longer be re-covered by the waiting line

The live bubble unmounted from react-query's `isPending`, which stays true until `onSettled`'s
`invalidateQueries` resolves — so for **50 / 56 / 189 ms** the settled bubble and a waiting-line
bubble were both mounted and the finished prose visibly reverted to "The editor is replying…".

Fix: a hook-owned `turnActive` flag, flipped false in `onSuccess`/`onError` **in the same React commit
that appends the settled reply** (automatic batching). `isSending` is still exported, documented as
"react-query's own flag — use `turnActive` for anything the writer can see". Regression test asserts
over *rendered state snapshots* that no frame exists where a settled assistant reply coexists with an
active turn (or with leftover `streamingText`).

## 3. D-178 (S4) — the writer's message is no longer on screen twice for 20–36 s

`ConversationInput.handleSend` cleared the textarea only after `await onSend(...)` resolved, while the
hook optimistically appended the same text as a writer bubble immediately. Now it clears on submit and
**restores on rejection** (the reason the old code held it), and the thread says what happened:
`discuss-turn-notice.ts` maps cancel → muted "Turn cancelled — nothing was saved, and none of your 3
exchanges were used", `rate_limited` → writer language, anything else → the server's own writer-facing
sentence. Without that notice, an optimistic clear would have swapped a duplicate-message wart for a
silent-wall (D-129) defect.

## 4. D-183 (S3-if-real, B+C converging) — no settle can race an in-flight REMEMBER

Dismiss reads only *persisted* replies, so a "Keep as-is" clicked mid-turn would settle the finding
against a thread that does not yet contain the in-flight REMEMBER. Both thread settle buttons
(`Use it`, `Keep as-is`) and the **card's own** `Apply`/`Dismiss`/`Undo` are now disabled while a turn
is in flight, from one source of truth: `FindingConversation` reports `turnActive` up through
`onTurnActiveChange`, which folds into `FindingCard.isMutating`. Disabled buttons carry a `title`
explaining the wait ("cancel the turn to decide now"), so it never reads as a dead control — and
Cancel is right there. The effect releases the parent guard on unmount, so collapsing the thread
mid-turn cannot strand the card's buttons.

Deliberately **not** disabled: `Hide`/close. A writer must always be able to leave; the turn keeps
running server-side and appears when the thread is reopened (disclosed as a residual below).

## 5. D-185 (S4, pixel-proven) — the revision card is anchored to the turn that emitted it

`selectLatestStructuredFields` now also returns `latestRevisionIndex`, and the thread renders the
`AIRewriteComparison` card **inside the emitting turn's block** instead of after the whole thread.
Test asserts document order: emitting bubble → card → later turn.

The dangling lead-in: `assistantBubbleText` now closes a lead-in whose object was lifted into the card
("Here's a tighter version:" → "Here's a tighter version."), and only when that turn actually carries
a revision (`closeDanglingLeadIn`, exported and unit-covered for the `e.g.:` double-period edge).

---

## 6. The cheap batch

| Defect | Shape | Files |
|---|---|---|
| **D-171** (S3, P1 co-floor) | `WriterMemoryPanel` had **zero mounts** — the discuss loop wrote WriterMemory rows nobody could read, correct or revoke ("retreat into arithmetic" is still live and wrong). Mounted on `/settings` directly under the vector-memory card: with no `bookId` the existing route returns **every** active row (global + all books), which is the only view in which "everything the AI carries about me" is true — and it adds no route, no nav entry, no chrome to the already dense book dashboard. Revoke was hover-only (`opacity-0 group-hover:…`) so a touch writer could never reach it: now always visible below `sm`, and both icon buttons carry aria-labels ("Forget memory: …"). | `src/app/(app)/settings/page.tsx`, `src/components/memory/writer-memory-panel.tsx` |
| **D-179** (S4) | "1 chunks" → `pluralNoun` from `src/lib/i18n/plural.ts` (the D-163 helper this surface missed). | `src/components/memory/memory-stats-card.tsx` |
| **D-181** (S4) | "Your Key Savings" over a figure the body called *spend* → title **"Your AI Spend — Your Keys"**, description "What you paid your AI providers directly, at their rates", and the amount now carries its own label line ("Total spent (last 30 days)") *above* it. The zero-markup claim survives as a claim about the rate, not the total. | `src/app/(app)/settings/billing/page.tsx` |
| **D-182** (S4) | ASCII `--` → em dash across **29 writer-facing sites**: the 3 the panel named (billing badge, "BYOK —", the wizard's "Manuscript imported — 1 chapter") plus the marketing page (5), the FAQ (5), a toast, an editor error, and all **7 locale dictionaries** (12 strings). Code comments and prompt delimiters (`--- CHAPTER 1 ---`) left alone. Guarded by a test that scans the copy files (comments stripped) so the next surface cannot regress. | `ui-strings.ts`, `billing/page.tsx`, `setup/page.tsx`, `app/page.tsx`, `faq-accordion.tsx`, `agent-panel.tsx`, `manuscript-editor.tsx` |
| **D-139** (S3, 3rd recurrence) | The fixed companion bubble occludes whatever ends bottom-right — the chapters table's Action column reads "Ed…". The scrolling shell column now reserves clearance: `pb-20` desktop, `pb-32` mobile (h-14 nav + bubble), and **nothing** on full-width surfaces (chapter editor, editorial review) which own their own scroll regions — padding those would add a phantom scroll tail under a full-height editor. Pure helper `mainBottomPaddingClass` so the branch is unit-testable, and it emits at most one `pb-*` class (two Tailwind paddings on one element resolve by stylesheet order, not class order). | `src/lib/layout/fab-clearance.ts` (new), `src/app/(app)/layout.tsx` |

---

## 7. Tests

RED first, then green. 12 files, **65 new assertions-bearing tests**:

`discuss-wait-phase` (8) · `discuss-turn-notice` (4) · `elapsed-seconds` (5) · `discuss-wait-liveness`
(14: counter advances 0→12→36, phase changes, counter aria-hidden, Cancel wired, mid-stream Cancel,
D-169 propagation, no chrome when idle, D-177 no-re-cover, 4× D-183, 2× D-185) ·
`discuss-turn-cancel` (4: signal handed to POST + aborted + rollback + sentinel; mid-stream cancel ≠
truncation; real truncation still honest; D-177 snapshot proof) ·
`conversation-input-optimistic-clear` (4) · `writer-memory-panel-mount` (5) · `memory-chunk-plural`
(2) · `billing-spend-label` (2) · `copy-em-dash` (11) · `fab-clearance` (5) · plus route case `(l)`.
`discuss-stream-bubble`'s hook mock was updated to the new contract (`turnActive`/`turnStartedAt`/
`cancel`) and all 5 of its cases still pass unchanged.

Gates: **`tsc` clean** for `src/**` and `tests/**` (the only remaining errors are pre-existing in
`cowork/**/scripts/shot45{c,e}.ts` capture harnesses, plus one untracked in-flight test from the
story-bible lane). **eslint: 0 errors** on every touched file (the warnings are pre-existing unused
imports in files I edited elsewhere). **Full suite 1690 tests / 203 files: my lane and every
pre-existing test green**; the only 4 red are the story-bible lane's untracked RED-phase files
(`artifact-contract.test.ts`, `agent-artifact-honesty-route.test.ts`, D-188).

---

## 8. Residuals — what this wave does NOT fix

1. **The 19–36 s term itself.** Honest and cancellable now, still 19–36 s. Only the reasoning-slot
   reroute (founder-call) shortens it.
2. **No server-side pre-first-text progress signal** — impossible without reverting the first-text
   gate (§1). If a future protocol wants one, it needs a *pre-commit* frame type the gate can
   retract, which is a spec change, not a patch.
3. **Blocking-fallback provider spend on cancel.** The 499 guard makes the turn all-or-nothing, but
   `runDiscussTurn` still has no signal, so the provider generation completes and is billed. Copy
   makes no billing claim. Full fix = thread `signal` into `client.messages.create` (D-142's other
   half).
4. **Collapsing the thread mid-turn** leaves the turn running server-side (it lands and shows on
   reopen). Intentional escape hatch, not a silent loss.
5. **D-139 on the ghost Tab-accept hint (45e3) is NOT fixed.** That hint is cursor-anchored inside a
   full-width editor, so no shell padding can move it out from under the bubble; it needs either a
   FAB auto-hide-while-typing rule or a hint reposition. Left registered.
6. **D-184** (WriterMemory near-duplicate accumulation) untouched — the panel now makes the duplicates
   *visible and prunable by hand*, which is the honest half; dedupe/curation is its own wave.
7. **Wait copy is English-only**, consistent with the rest of the thread surface (the discuss thread
   has never been localised). Worth a pass if the thread is ever localised.
8. **D-180** (billing estimate-vs-actual 38% banner) and **D-165/D-166** (dashboard re-shot) are not
   code items in this lane — capture/triage.

---

## 9. What the live re-capture must show

1. **P1 and P6, one discuss turn each, on their own surfaces** (P6's D5 gap was "transferred
   evidence, not Owen's pixels"): frames at ~2 s / ~10 s / ~25 s showing the counter climbing and the
   phase text changing, then prose streaming, then the settled turn — with `Server-Timing: ttft`
   quoted next to the on-screen counter so the two agree.
2. **A cancelled turn, on camera**: Cancel at ~8 s → the muted "Turn cancelled…" line, the writer's
   sentence back in the composer, `GET /discuss` showing `userTurns` **unchanged** and no new
   `finding_replies` row. That is the D-176 claim's proof.
3. **The settle moment sampled at 25 ms** (the D-177 protocol): the tail must go prose → settled, with
   **no** "The editor is replying…" frame in between.
4. **D-183**: a frame mid-turn showing `Keep as-is` / `Use it` / card `Dismiss` disabled, and a frame
   right after settle showing them live again.
5. **D-185**: a 3-turn thread where the revision card sits under turn 2, with a later turn below it.
6. **D-171**: `/settings` with real rows the discuss loop wrote, one revoked on camera (DELETE 200,
   row gone, and the next agent prompt no longer carrying it).
7. **D-139**: the chapters table with the Action column fully readable at the same viewport as 45a/45g.
8. **D-179/D-181/D-182**: the Memory card at chunkCount 1, the billing spend card headline, and the
   wizard import banner.
