# D-169 / D-170 / D-172 — discuss-surface batch — FIX LANE

Date: 2026-07-27 · Branch: `qa/bulletproof-2026-07-17` · Lane: code fix (no capture, no LLM/network calls, no `.env` change)
Register entry: `fix-reviews/D-169-D-172-p1-43series-observations.md` · Capture: `p1-maya-rejudge/UI-CAPTURE-2026-07-27-d157.md` (43d) + `43d-keep-as-is-assertions.json`
Base: `36f3825` · Commits: **`1ce1c6b`** (D-169) · **`b484615`** (D-170) · **`e75996e`** (D-172) — all LOCAL, not pushed.

Common thread with D-157: the discuss surface makes a promise in the writer's own words
("I'll remember…", "Keep as-is") and the system quietly does something else — navigates away,
drops the memory, or spends money nobody can see. All three fixes are about the moment of
honesty, not about the model.

---

## D-169 (S2) — in-thread controls navigated out of Editorial Review

### Mechanism (confirmed at source + live capture)

`FindingCard` renders its root `<Card>` with

```tsx
onClick={() => { setSelectedFinding(finding.id); onShowInText?.(finding); }}
```

and on the editorial surface `onShowInText` is `handleShowInText`
(`src/components/editorial/findings-panel.tsx:52-70`) which ends in
`router.push(/books/${bookId}/chapters/${chapter.id})`. Every button FindingCard owns —
Jump to text, Apply, Dismiss, Discuss, Undo — calls `e.stopPropagation()`
(`finding-card.tsx:267-348`). The discuss thread is rendered **inside the same card**
(`finding-card.tsx:358-374`) and nothing in it stopped propagation, so each in-thread control
did its job *and* bubbled to the card.

Live-proven in shot 43d: "Keep as-is" → `PATCH …/findings/73b2781c…` 200 (`status: dismissed`)
immediately followed by the in-editor findings panel and a `GET …/editorial/findings?chapterNumber=1`
(editor-scoped query). The writer is dropped into the chapter editor mid-review, loses their place
in the findings queue, and never sees the outcome of the decision they just made.

Scope was **wider than the three named controls**: the same bubbling hit the AI Rewrite
Comparison's Accept / Reject / Edit buttons (`ai-rewrite-comparison.tsx:196-203`) and the message
input + send button (`conversation-input.tsx:64-84`) — i.e. clicking into the text box to type a
reply also navigated away.

### Shape chosen

The thread is an interactive **sub-surface**, so the guard is applied at its root *and* on the
named controls:

- `FindingConversation`'s root `<div>` gets `onClick={(e) => e.stopPropagation()}` — no click
  anywhere inside the thread can reach the card (covers the revision card and the input, which a
  per-button fix would have missed);
- "Use it", both "Keep as-is" branches and the close **X** also call `e.stopPropagation()`
  individually, matching FindingCard's existing pattern, so the guard survives a refactor of the
  wrapper.

Deliberately *not* changed: a click on the card **body** still selects the finding and shows it in
text. The guard is thread-scoped, not card-wide (pinned by a control test).

Behaviour note: clicking inside the thread no longer sets `selectedFindingId` as a side effect.
That side effect was never intentional — "Discuss" itself already stops propagation, so opening a
thread never selected the card either.

### Tests

`tests/unit/finding-conversation-nav-propagation.test.tsx` (**8 tests**, jsdom + Testing Library).
Mounts the **real `FindingCard`** (the component that actually owns the navigation handler) with an
`onShowInText` spy, opens the thread, and for each control asserts *both* halves: the control still
does its own job **and** navigation never fires.

- "Keep as-is" → dismiss mutation fires, `onShowInText` not called
- "Use it" → apply fires with `{ findingId, overrideText: <revision> }`, no navigation
- close **X** → thread closes (control disappears), no navigation
- revision card **Accept** → apply fires, no navigation (separate test for **Reject** → dismiss)
- message input click **and** send click → no navigation
- reply bubble + constraint chip click → no navigation
- **control:** card-body click still navigates (guard is thread-scoped)

RED pre-fix: 6 of 8 failed (the two that passed are the control case and the Reject case, which
failed pre-fix as part of the then-combined Accept/Reject assertion). GREEN after: 8/8.

---

## D-170 (S3) — the chip promised a memory that dismiss did not persist

### Mechanism (source-audited, UI-corroborated in 43c)

Two different readers of the same thread disagreed:

| | reads | keeps |
|---|---|---|
| chip (`computeConversationView`) | **all** assistant turns | constraint from the **last turn that carried one** |
| dismiss route (`PATCH .../findings/[findingId]`) | `findingReply.findFirst … orderBy: { createdAt: "desc" }` | constraint parsed from the **newest** reply only |

On any thread where the writer asked for a rewrite *after* the editor offered to remember something,
the newest reply carries a `<<<REVISION>>>` and no `<<<REMEMBER>>>`. Real case, live: finding
`036a088d` — turns 1-2 carry REMEMBER, turn 3 carries REVISION only. The writer reads
*On "Keep as-is", I'll remember: …*, clicks it, gets a 200 — and **no `WriterMemory` row is written**.
Same silent-drop class as D-157, one layer up: D-157 was a parser that could not see the block,
D-170 is a route that never looked at the turn carrying it.

### Shape chosen

**One shared selector, two callers.** `src/lib/editorial/finding-conversation.ts` now exports:

- `selectLatestStructuredFields(replies)` — the single latest-wins scan over all assistant turns
  (revision + reasoning + constraint), which `computeConversationView` now delegates to (its inline
  loop is gone, so the chip's behaviour is defined in exactly one place);
- `selectLatestConstraint(replies)` — "which constraint must a dismiss persist", used by the route.

The dismiss route reads **every** assistant reply for the finding, `orderBy: { createdAt: "asc" }`
(the same order the GET `/discuss` handler feeds the UI, `discuss/route.ts:32-34`), and selects
through the shared helper. The promise and the persistence can no longer diverge by construction.
The route's `parseDiscussResponse` import is gone — it no longer parses at all.

No schema change, no migration, no data backfill: threads already stored with a trailing REVISION
turn will persist their earlier constraint correctly on their next dismiss (retroactive recovery,
free — the same property D-157's fix had).

### Tests

`tests/unit/finding-dismiss-constraint-selection.test.ts` (**7 tests**).

- constraint from an **earlier** turn is persisted when the newest turn carries only a revision
  (the exact `036a088d` shape) — asserts the full `upsertConversationConstraint` argument
- **parity test:** what `computeConversationView` shows in the chip `===` what
  `selectLatestConstraint` hands the route `===` what the route persists
- newest constraint still wins when several turns carry one
- no constraint anywhere → no upsert **and** no fabricated `suggestionFeedback` row
- query shape: assistant-only, oldest-first, scoped to the finding
- pure helper: ignores user turns, survives a corrupted/unclosed assistant row, `undefined` on empty

RED pre-fix: 6 of 7. GREEN after: 7/7.
`tests/unit/finding-apply-guard.test.ts`'s db mock follows the route from `findFirst` to `findMany`
(without it the new path threw into the route's catch and logged a spurious
`[Discuss] constraint resolution failed`).

---

## D-172 (S2) — discuss turns were real BYOK spend with zero `usage_records`

### Mechanism (live-observed)

`runDiscussTurn` (`src/lib/editorial/discuss-llm.ts`) builds its own client and calls
`client.messages.create` with **no usage or cost write anywhere in the discuss path**
(grep for `usageRecord` / `recordUsage` / `trackUsage` over `src/lib/editorial/` and the editorial
routes: no hits). Confirmed in the DB during the 43-series capture: a 24.3 s BYOK discuss turn at
`23:26` left the newest `usage_records` row sitting at `21:28` (a prior session's coach call).
Ghost-text and inline-edit both bill at settle, so the in-app spend panel silently under-reported
the writer's real provider charges every time they argued with an editor note — the concrete
mechanism behind the D-44 / D-119 "usage panel is a dishonest health surface" family, now pinned to
a specific route.

### Shape chosen — bill-at-settle, mirroring quick-assist

- `runDiscussTurn` takes `bookId` (threaded from the route) so the row is book-scoped and appears in
  the per-book usage surface. Both usage routes group by `agentType` with no allowlist
  (`api/usage/route.ts:28`, `api/usage/books/[bookId]/route.ts:42`), so `"discuss"` shows up with no
  further change.
- Each attempt returns its own provider-reported usage; `sumUsage` folds attempts into a **new**
  object (no mutation). The doubled-budget retry (D-04) is a real second charge, so a turn that only
  lands on the retry bills **both** attempts.
- One `usageRecord.create` **after** usable text is in hand, carrying the **registry** model id
  (`model.id`, D-44 — never the raw provider string) and `estimateCost(...)` from the shared
  estimator.

Honesty boundaries, each explicit in code:

1. **No usable text → no row.** Matches the deliberate D-04/D-38 line that a call which delivered
   nothing is not billed to the writer (the route also refunds the discussion turn). The wasted
   provider spend therefore stays invisible in-app — that is the honest *direction*, but it is a
   real residual gap, so it is `console.warn`-logged with the token counts instead of vanishing.
2. **Provider omitted `usage`** (some proxy routes do; the SDK types it as always present) → record
   the call anyway with the tokens we know and warn that the counts are under-reported. A visible
   call with low tokens beats an invisible one.
3. **Billing write failure → logged with full context and swallowed.** The turn is already paid for
   upstream; destroying it over a DB hiccup would be strictly worse for the writer than an
   under-counted panel. Same call as D-143(a) in quick-assist.

### Tests

`tests/unit/discuss-usage-record.test.ts` (**5 tests**, real model registry kept so the cost is a
real price lookup, not a mock).

- one row per delivered turn: `userId` / `bookId` / `agentType: "discuss"` / **registry** model id /
  exact tokens / `costEstimate` equal to the registry-priced arithmetic and `> 0`
- retry accumulation: reasoning-only first attempt (700/2500) + landed retry (700/220) → 1400/2720
- unusable turn (`DiscussLLMEmptyError`) → **no** row
- billing write rejects → turn still returned to the writer, failure logged
- provider reports no usage → row still written (0/0) and warned

RED pre-fix: 4 of 5. GREEN after: 5/5.
Existing `runDiscussTurn` callers updated for the new `bookId` arg
(`discuss-llm-empty`, `cheap-model-provider-routing`, `quick-assist-routes`); `discuss-llm-empty`'s
db mock gained `usageRecord.create` and a registry-real model id so the D-04 tests now exercise the
billing path instead of swallowing a mock TypeError.

---

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` (full suite) | **1488/1488 passed, 179 files** — two consecutive clean full runs |
| this lane's contribution | **+20 tests, +3 files** (8 + 7 + 5) → lane total **1460/1460 across 177 files** from the 1440/174 baseline |
| `npx tsc --noEmit` | clean (0 errors) |
| `npx eslint` on touched files | 0 errors; 2 pre-existing-style warnings (`_a` unused in the two `DocumentService` class mocks, matching the existing test files) |

**Suite-count note.** The observed 1488/179 includes **28 tests in 2 files that are not mine**
(`i18n-plural.test.ts`, `setup-surface.test.ts` — a concurrent lane's untracked work-in-progress in
this shared checkout). 1488 − 20 (mine) − 28 (theirs) = **1440**, matching the stated baseline
exactly. Only my six files were staged; nothing of theirs was committed.

**Flake disclosure.** Two earlier full runs each showed a single failure in one of those two
concurrent-lane files (once a collect-time import failure, once two assertion failures) while the
files were being written underneath the runner. Both pass in isolation and in the two final full
runs. Not caused by, and not related to, this lane.

---

## In-lane findings (not fixed, register-worthy)

1. **Billed-but-discarded discuss turn (cap race).** `runDiscussTurn` runs outside the transaction;
   the cap is re-checked under `FOR UPDATE` afterwards, and on a lost race the route answers 409 and
   persists no reply (`discuss/route.ts:115-166`). The provider charge is real, so with D-172 that
   turn now *does* write a `usage_records` row the writer got no text for. Honest for the ledger,
   surprising in the panel; the alternative (silently unbilled) is the exact D-172 defect. Narrow
   race, but worth a decision rather than a silent choice.
2. **Discuss has no free-tier meter and no quota gate.** `DailyMeter` is `"ghost" | "inline"` only
   (`free-tier-meters.ts:66`) and `FreeTierUsage` has no discuss column, so a discuss turn draws
   down nothing and `checkQuota` is never consulted on this route. Adding one needs a schema change
   — out of this lane, but it means "3 turns per finding" is the *only* limit on the surface.
3. **Send button has no accessible name.** `ConversationInput`'s send `<Button size="icon">` wraps a
   bare `SendIcon` with no `aria-label` (`conversation-input.tsx:76-83`), so screen readers announce
   an unnamed button — the same class the suite already pins for settings
   (`a11y-settings-button-name.test.tsx`). One-line fix, sibling of D-171's writer-facing gap.
4. **`[discuss]` warn lines in test output.** The D-04 tests' mocked responses carry no `usage`, so
   they legitimately trip the new "provider reported no token usage" warning. The behaviour under
   test is unchanged; the noise is honest, not a failure.
5. **Both usage surfaces will now show a new `agentType`.** `"discuss"` appears in the per-agent
   breakdown from the next turn onward. Any judge comparing a pre-fix screenshot to a post-fix one
   should expect the new row — it is the point of the fix, not a regression.

## Residual risk

- D-169's root guard changes click semantics inside the thread (no card-selection side effect).
  Covered by tests, and the card-body path is pinned, but it is a behaviour change a UI re-capture
  should eyeball once.
- D-170 orders by `createdAt` ascending; two replies written inside the same millisecond would have
  an ambiguous order. Replies are created sequentially per turn, so this is theoretical.
- D-172 records only what the provider reports. On routes that omit `usage` the panel is honest about
  the *call* but under-counts the *cost*; the log line is the only place that says so.
