# Fix review — D-173 / D-174 / D-175 (P6 45-series follow-ups)

**Branch:** `qa/bulletproof-2026-07-17` · **Commit:** `921cb90` (code + tests) ·
**Source:** `evidence/p6-owen-rejudge/UI-CAPTURE-2026-07-27.md` §"NEW defects" (45a / 45b4 / 45f1) ·
**Canonical accounting join:** `evidence/fix-reviews/D-160-D-161-D-163-p6-setup-surface.md`
(this lane closes the two halves that register left open: the fourth recommendation
surface and the missing cache invalidation).

**Gates:**
* `npx tsc --noEmit` — **no error attributable to this lane**. The 12 errors present are
  pre-existing at HEAD `3a2897c` (11 in `cowork/…/p6-owen-rejudge/scripts/shot45c.ts` /
  `shot45e.ts` capture harness, untouched here) plus 1 in a concurrent lane's in-flight
  RED spec (`tests/unit/discuss-stream-client.test.ts` → module not written yet).
* `npx vitest run` — **1544 tests / 185 files, 1540 passed**. The 4 failures are all in the
  concurrent discuss-stream lane's own untracked RED files
  (`discuss-stream-client.test.ts`, `discuss-stream-bubble.test.tsx`); nothing this lane
  touches fails. This lane's four spec files run **59/59 green**
  (`overview-recommendation` 11, `setup-surface` 21, `usage-aggregation` 21,
  `setup-wizard-settings-invalidation` 6).
* `npx eslint` on every touched file — **0 errors**, 4 warnings, all pre-existing
  (2 × `react-hooks/set-state-in-effect` in `setup/page.tsx`, already disclosed in the
  D-160 review; 1 `@typescript-eslint/no-explicit-any` in the billing page's *byAgent*
  block). The byModel `any` that the D-175 edit replaced is **gone**, so the warning
  count on that file drops by one.

**Not pushed** (per instruction). Nothing written under `evidence/` except this file.
Dev server (:3001) and the BullMQ worker were left running; no `.env` change, no LLM or
network call in this lane.

---

## D-173 — post-setup overview still solicits the skipped setup step (S3)

### Mechanism

D-160 gave the app one accounting (`src/lib/onboarding/setup-surface.ts`) and routed the
sidebar badge and the ProactiveGuide ladder through `nextSetupWorkflow()`, which returns
`null` once `setupComplete`. The server-rendered overview kept its **own fourth ladder**
inline (`books/[bookId]/page.tsx`, old lines 160-211):

```ts
if (!hasFingerprint) { nextWorkflowId = "capture-style"; … }
else if (!hasBible)  { … } else if (!hasArch) { … } else { /* chapter pipeline */ }
```

`setupComplete` was never an input, so the 45a state (`setupComplete=true`, 2/5 steps
resolved, style deliberately skipped) still rendered
`Recommended: Capture Style — Capture your writing style fingerprint to guide all AI
agents [Start]`. Same file the D-160 counter fix edited (the banner at :467-499, which
*was* correctly gated), a different block — which is exactly how a fourth accounting
survives a fix for the first three.

### Shape

The ladder is **extracted whole** into `src/lib/onboarding/overview-recommendation.ts`
(pure, dependency-free, imports only `setup-surface`) and the page calls
`nextOverviewRecommendation({ setupComplete, hasFingerprint, hasStoryBible,
hasArchitecture, chapters, pendingFindings })`. Two consequences:

1. **The setup half is no longer duplicated** — it is `nextSetupWorkflow()`, the same
   expression the sidebar and ProactiveGuide use. A future change to the semantics moves
   all four surfaces at once. Equivalence when `setupComplete === false` is exact (same
   artifacts, same priority order).
2. **It is testable at all.** Inline in an `async` server component it was reachable only
   by rendering the page against a database; as a module it has 11 assertions.

**Which of the two allowed outcomes was chosen:** the solicitation **disappears** and the
card shows the chapter-pipeline step instead (for the 45a state: `discuss-chapter`,
"Ch. 1 is ready to be discussed with the AI"). That is the documented D-160 semantics —
*skipped artifacts stay reachable offers, never "Recommended/Next Step" solicitations*.
Reachability after the change is unaffected: the Style page (sidebar nav), the Setup
wizard, and ProactiveGuide's "Run N setup agents" batch offer all still list the skipped
artifacts (`setupWorkflows` was deliberately left alone by D-160). A *downgraded* offer
card was considered and rejected for this lane: it needs new copy on a surface whose
recommendation strings are English-hardcoded, i.e. new i18n debt for a card the writer
already has three routes to.

**One behaviour hardened beyond the literal defect (deliberate, in-lane):** the
fall-through terminal used to be `publishing-check` — "All chapters complete — run a
pre-publication check" — for a book with **zero** chapters. Pre-fix that state was nearly
unreachable (setup artifacts always gated first); post-fix `setupComplete` falls through,
so it becomes reachable, and shipping the fix without answering it would have traded a
solicitation defect for a fresh lie. A chapterless book now gets
`discuss-chapter` / "No chapters yet — start Chapter 1 by discussing it with the AI",
matching `use-book-state`'s existing greenfield branch. `pendingFindings` keeps priority
over that branch, preserving pre-fix behaviour for orphaned findings.

### Changes

* **new** `src/lib/onboarding/overview-recommendation.ts` — `nextOverviewRecommendation()`,
  `OverviewRecommendationInput` (extends `SetupArtifactState`), `RecommendationChapter`.
* `src/app/(app)/books/[bookId]/page.tsx` — 43 lines of inline ladder replaced by the
  call; `let` → `const`; the now-unnecessary `nextWorkflowId!` assertion on
  `StartWorkflowButton` dropped. The query already selected
  `settings.setupComplete` (D-160), so no data-fetch change was needed.

### Tests (`tests/unit/overview-recommendation.test.ts`, 11 assertions)

RED first (module absent → import failure). Covers: pre-fix parity while setup is
unfinished (capture-style, then bible, then architecture); **the 45a state recommends
`discuss-chapter`, not `capture-style`**; an exhaustive 2×2×2 artifact sweep asserting no
setup workflow is ever recommended once `setupComplete`; pipeline priority
(dev-edit > line-edit > beta-read > planned/discussed/undiscussed) including the
reason naming the right chapter number; pending-findings branch; `publishing-check` only
when chapters really are complete; **no "complete" claim for a chapterless book**; purity
(caller's chapter array never reordered/mutated); always returns something startable.

---

## D-174 — wizard completion invisible until reload (S4)

### Mechanism

`handleSkipImport` and `handleFinishSetup` PATCHed `/api/books/{id}/settings` with raw
`fetchJson`. React Query knew nothing about it, so `["book-settings", bookId]` — the key
`use-book-state.ts:112` reads, from which the sidebar count, the Setup/Style "Next Step"
badges and the recommendation ladder are all derived — stayed at its pre-completion
value for the rest of the SPA session. The invalidation existed
(`use-settings.ts:59-61`, inside `useUpdateBookSettings`) and the wizard simply bypassed
it. Hence 45b4: the frame right after "Start Writing!" still showed
`Getting Started 2/5` and `Style [Next Step]` — the same pixel-identical pre/post symptom
D-160 was raised for, now caused by the cache rather than by the arithmetic.

The skip-import PATCH had the same defect one step earlier and it was **visible inside
the wizard**: the step bar's Import tick reads `setupProgress.importComplete`, which is
`hasChapters || settings.setupImportSkipped` — so a skip-only walk left its own step bar
stale too.

### Shape

Route both PATCHes through the existing mutation instead of adding a second
invalidation call next to the raw fetch:

```ts
const { mutateAsync: patchSettings } = useUpdateBookSettings(bookId);
…
await patchSettings({ setupImportSkipped: true });   // Skip Import
await patchSettings({ setupComplete: true });        // Start Writing!
```

Chosen over a local `queryClient.invalidateQueries(...)` because the defect *is*
duplicated persistence logic: one hook owning "PATCH settings ⇒ invalidate the settings
cache" cannot drift, whereas a second call site can be forgotten again. `mutateAsync`
resolves after `onSuccess` fires, so the invalidation is issued before `router.push`.

`BookSettingsData` gains `setupImportSkipped` / `setupComplete` (documented as the D-35
wizard flags) — they were always part of the API payload and of
`updateSettingsSchema`, just missing from the client type, which is *why* the wizard
hand-rolled a fetch in the first place. The mutation's `Partial<Omit<…>>` parameter now
accepts them, and the route is `.strict()`, so only the keys passed are sent.

Error paths are unchanged: skip-import stays non-fatal ("user can still proceed"), finish
still surfaces the reason on failure and does not navigate.

### Changes

* `src/hooks/use-settings.ts` — two typed fields + why-comment.
* `src/app/(app)/books/[bookId]/setup/page.tsx` — hook wired, both raw PATCHes deleted,
  `useCallback` deps updated (`patchSettings` in place of `bookId` for skip-import).
  `fetchJson` is still imported for the authoritative chapters GET in D-161's
  create-or-open path.

### Tests (`tests/unit/setup-wizard-settings-invalidation.test.tsx`, 6 assertions)

RED first: the two source guards failed against the pre-fix wizard. jsdom +
`renderHook` + a real `QueryClient` (the `save-flush-keepalive` pattern), `fetchJson`
mocked. Covers: a successful PATCH marks `["book-settings", bookId]` invalidated; the
request is a `PATCH` to the right URL carrying **only** the given key (the route is
strict); a failed PATCH leaves the cache untouched and un-invalidated (no optimistic
lie); the two setup flags are typed on `BookSettingsData` (enforced by `tsc`, asserted at
runtime for visibility); and two source guards on the wizard — it imports
`useUpdateBookSettings`, and it contains no hand-rolled `fetchJson` call to a
`/settings` endpoint. The guards are what stop this specific bypass from being
reintroduced; they are deliberately narrow (only the settings endpoint).

---

## D-175 — "Usage by Model" lists the same model twice (S4)

### Mechanism

`/api/usage` rolls `usage_records` up by `r.model`, the **registry id**. Three
`openrouter-qwen36/*` slots (haiku / sonnet / opus) all carry
`modelId: "qwen/qwen3.6-27b"` and `displayName: "Qwen 3.6 27B (OpenRouter)"`, and the
panel renders `formatUsageModelLabel(model)` = `displayName (modelId)` — so two distinct
keys produced two rows reading *identically* with different numbers
(`$0.02 / 9.7K` and `$0.43 / 821.4K` in 45f1). The writer's question — "what did this
model cost me?" — had two contradictory answers and no discriminator. Note this is the
mirror image of D-119: the label was made writer-friendly by dropping the slot id, which
is correct, and that is precisely what made aliasing slots collide.

### Shape

Fold on the finest distinction the panel actually shows (the rendered label) rather than
on the storage key, and disclose the fold:

`foldUsageModelsForDisplay(groups)` in `src/lib/llm/usage-aggregation.ts` — pure,
immutable — groups rows by label, sums `tokensInput` / `tokensOutput` / `costEstimate` /
`sessionCount`, records the contributing registry ids (sorted), and returns rows sorted
by spend descending with a `label` tie-break so the order is deterministic instead of
insertion-order roulette. Unknown/legacy ids (`text-embedding-3-small`) pass through as
their own row, exactly as `formatUsageModelLabel` passes them through verbatim.

The panel renders one row per fold, and **when more than one slot is behind it** a muted
second line: `Combined across 2 configured slots: openrouter-qwen36/haiku,
openrouter-qwen36/sonnet`. Merging alone would have been silent (two lines the writer
previously saw become one); the disclosure keeps the number auditable while the headline
answer stays a single truthful total. It is a rendered line, not a `title` tooltip, so it
survives touch (D-151 family).

Money is not recomputed anywhere: stored `costEstimate` values are summed, so the panel
total is unchanged. `UsageModelTotals` makes `sessionCount` optional because the
`byModel` payload genuinely has no session count — the fold reports 0 rather than
inventing one.

### Changes

* `src/lib/llm/usage-aggregation.ts` — `foldUsageModelsForDisplay()`,
  `UsageModelDisplayRow`, `UsageModelTotals`.
* `src/app/(app)/settings/billing/page.tsx` — byModel block renders folded rows;
  `formatUsageModelLabel` import replaced (it is still exported and unit-tested, now used
  through the fold); the `[string, any]` destructure replaced by a typed cast, removing a
  pre-existing lint warning.

### Tests (`tests/unit/usage-aggregation.test.ts`, +8 assertions, 21 in file)

RED first (8 failing). Covers: two qwen slots → **one** row with the D-119 label; sums
(706 000 in / 125 100 out / $0.45 / 15 sessions); slot disclosure sorted; genuinely
different models stay separate; spend ordering with a deterministic tie-break; unknown id
passthrough; missing `sessionCount` tolerated; purity (no input mutation, empty ⇒ empty).

---

## In-lane findings and residual risks

1. **The overview recommendation strings are English-hardcoded** — pre-existing (they
   were inline in the page and are now inline in the module), and now *more* visible
   because a localized label (`t.journey.recommended`) sits directly above an unlocalized
   reason. Not registered: it is one of several English-hardcoded prose sites the
   campaign has already noted, and localizing it needs 7-locale copy for ~9 strings
   (+ the new chapterless one). Cheap follow-up if a judge reads a non-`en` locale.
2. **`nextOverviewRecommendation` duplicates `use-book-state`'s pipeline branch.** Only
   the *setup* half is now shared. Merging the pipeline half too would mean either
   importing a client hook into a server component or moving the chapter-status ladder
   into the shared module and rewiring `use-book-state` — a bigger, riskier change than
   D-173 warrants while a concurrent lane holds the checkout. The two ladders were
   verified to agree branch-for-branch (including the greenfield chapterless case, which
   was aligned deliberately). **Residual:** they can still drift; a single ladder module
   consumed by both is the correct end state.
3. **No camera.** This lane is code-only. D-173 needs a 45a re-shoot (post-setup overview
   with the pipeline card and no Capture-Style solicitation), D-174 a 45b4 re-shoot (the
   frame right after "Start Writing!" showing `✓ 2/5` and no Style badge **without** a
   reload), D-175 a 45f1 re-shoot (one Qwen row + the "Combined across 2 configured
   slots" line). All three are cheap in-pixel confirmations on the existing books.
4. **D-174's invalidation is scoped to `["book-settings", bookId]`.** That is the key the
   stale surfaces read, and it is what `useUpdateBookSettings` already promised. Surfaces
   deriving from `["book-documents", …]` / `["style-profile", …]` (e.g. a style capture
   completed in another tab) are untouched by this fix and out of scope.
5. **Books with no settings row render as `setupComplete=false`.** The overview reads
   `book.settings?.setupComplete ?? false` — the row is created lazily by
   `GET /api/books/:id/settings`, so a book that never loaded its settings client-side
   gets pre-fix behaviour (setup solicited). Correct-by-default, and it matches
   `use-book-state`'s own `?? false`, but it means D-173's fix depends on the row
   existing; every wizard walk creates it (the PATCH upserts).
6. **D-175 folds by rendered label, not by `modelId`.** If two genuinely different
   provider models ever shared one `displayName` *and* one `modelId` in the registry they
   would fold — but that is the definition of the same model. The converse (same model,
   different display names across providers) correctly stays separate. A registry entry
   with a typo'd duplicate `modelId` would now be summed instead of listed twice; the
   disclosure line names both ids, so the mistake stays visible rather than silent.
7. **Per-role cost is still unanswerable from the panel** (the unnumbered 45f
   observation: a line-edit's spend lands under *Writing Coach* because the conductor runs
   on the editor-role model). Untouched here — it is an attribution/reporting design
   question, not the duplicate-row defect.
8. **Concurrent lane in the same checkout.** `src/lib/editorial/discuss-*`,
   `src/components/editor/quick-assist-stream-client.ts`,
   `src/hooks/use-finding-discussion.ts`, `src/lib/api/sse-frames-client.ts` and the
   `tests/unit/discuss-*` specs are another lane's in-flight work; they were left
   unstaged and account for the 4 red tests and 1 tsc error in the gate output above.
   Only this lane's 9 files are in `921cb90`.
