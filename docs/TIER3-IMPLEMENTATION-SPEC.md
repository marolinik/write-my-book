# Phase 3 Implementation Plan — wmb-pub (`feat/tier1-agent-wiring`)

Scope: (A) optimistic locking on chapter autosave with writer-safe conflict UX; (B) graceful cost-limit degradation in the agent orchestrator. All anchors verified against the working tree.

---

## 1. VERIFIED FACTS

### A — Autosave race surfaces (today: pure last-write-wins, silent)

- **Pipeline:** TipTap `onUpdate` → `paneStore.markDirty()` (`src/components/editor/manuscript-editor.tsx:239-243`) → 2s-debounced effect (`:335-351`, **no `isSaving` guard** — overlapping saves possible) → `useSaveChapterContent` PUTs `{ markdown }` only (`src/hooks/use-documents.ts:23-42`) → route calls `DocumentService.update` (`src/app/api/books/[id]/chapters/[chapterId]/content/route.ts:109-117`). PUT returns `{ wordCount }`; GET returns `{ markdown, wordCount, documentId }` — **no version ever reaches the client**. Autosave errors are silently swallowed (`manuscript-editor.tsx:321-333`; only signal is the "Unsaved" status-bar icon, `editor-status-bar.tsx:186-209`).
- **Write order bug (verified):** `DocumentService.update` writes live content to storage at `document-service.ts:107` **before** versioning at `:110-111`. `VersionManager.createVersion` (`version-manager.ts:16-51`) is the **only** site incrementing `Document.currentVersion`, inside a `db.$transaction` — the natural CAS choke point. Every write is snapshotted as a `DocumentVersion` (`schema.prisma:230-248`), so conflicts are always recoverable; only "current" content gets clobbered.
- **Racing writers (≥5):** editor autosave per tab; immersive-mode 30s sync feeding the same autosave (`manuscript-editor.tsx:526-562`); agent `WriteChapter` via the same `DocumentService.update`, **not** the PUT route (`src/lib/agents/tools.ts:1087-1138`); import (`import/route.ts:107-141, 281-297`); finding apply (server read-modify-write with its own text-anchor 409, `findings/[findingId]/route.ts:129-178`); version restore.
- **Worst case today:** editor loads content exactly once per chapter (`contentLoadedRef`, `manuscript-editor.tsx:288`) and ignores query invalidations — a dirty editor **silently overwrites a fresh agent rewrite** on the next autosave.
- **Conventions to reuse:** sonner toasts (`agent-panel.tsx:355-357`); controlled Dialog + DiffView (`version-history-panel.tsx:193-258`); 409 with descriptive body (findings route `:155-163`); `fetchJson` discards HTTP status (`api-client.ts:5-19`); GET sanitizes U+FFFD→em-dash on read only (`content/route.ts:10-12`).

### B — Cost-limit behavior (today: mislabeled, but nothing is lost)

- **What persists at "cost-kill":** everything written before the stop. `CreateFinding` persists immediately (`tools.ts:1161-1330`), `WriteDocument` commits in a `$transaction` immediately (`tools.ts:967-1023`). The budget guard (`orchestrator.ts:439-445`, verified) emits SSE `type:"error"` and **`break`s — never throws** — so `runAgent` returns `success:true`, `onComplete` runs, post-session processing runs, DB `AgentSession.status="completed"`, tokens/`actualCostUsd`/usage recorded.
- **What's lost/broken:** the client maps any `"error"` SSE to status `"failed"` (`use-agent-stream.ts:99-119`) and the background SSE route closes the stream on `"error"` (`stream/route.ts:122-136`) — so the trailing `"complete"` payload (findings count, suggestedNext) never arrives; UI shows a destructive failure banner while DB says completed. No wrap-up turn happens; the agent is cut mid-thought with no summary of remaining work.
- **Budget enforcement is effectively broken (verified):** `agent/route.ts:440` passes `maxSessionCostUsd: Infinity` (inline) and `:384` passes `sessionCostLimit: Infinity` into BullMQ — **JSON serialization turns Infinity into null**, so background sessions silently fall back to the $10 default (`orchestrator.ts:28, 95`). Specialists are hardcoded $5 (`tools.ts:1832`). No user/book setting exists.
- **Other facts:** timeout path behaves identically (error SSE + advisory abort; no signal passed to `client.messages.stream` at `orchestrator.ts:352`); the budget check counts only the coach's own tokens, not `sharedCostTracker` specialist spend (`orchestrator.ts:416-439`); mid-loop user-text injection is proven by the max_tokens handler (`orchestrator.ts:485-495`); `createSessionBrief`/`formatBriefsForPrompt` (`session-brief.ts:37-102`) and `addUserMessage`/`addAssistantMessage` (`session-manager.ts:142-182`) are dead code — **transcript resume does not exist**; worker `"complete"` metadata flattens `resultMeta` so background sessions already lose the Session Complete card data (`agent-worker.ts:506-518` vs `use-agent-stream.ts:58`).

---

## 2. CHANGE PLAN

### Part A — Optimistic locking on chapter autosave

Ordered edits; server first, client second. Single-user multi-writer; no CRDT.

**A1. `src/lib/documents/errors.ts` (new) + export from `src/lib/documents/index.ts`**
`export class VersionConflictError extends Error { constructor(public documentId: string) { super("version_conflict"); } }`

**A2. `src/lib/documents/version-manager.ts:16-51` — CAS in the existing transaction**
Add optional `expectedVersion?: number` param to `createVersion`. Replace the unconditional `tx.document.update` (`:24-27`) with a guarded `tx.document.updateMany({ where: { id, ...(expectedVersion !== undefined && { currentVersion: expectedVersion }) }, data: { currentVersion: { increment: 1 } } })`; if `count === 0` throw `VersionConflictError`. Then `tx.document.findUniqueOrThrow` to read the new `currentVersion` (updateMany returns no row). **Callers omitting `expectedVersion` keep exact current behavior** — agent (`tools.ts:1106`), import, finding apply, restore are untouched.

**A3. `src/lib/documents/document-service.ts:91-126` — reorder, thread param**
Add `expectedVersion?: number` to `update()`. **Move the live-content `storage.write` (`:107`) to after `vm.createVersion(...)`** so a rejected CAS never clobbers current content. (Trade-off: post-CAS storage failure leaves current content one version behind the snapshot — recoverable via restore; acceptable.)

**A4. `src/lib/validation.ts:195-198`**
`updateChapterContentSchema`: add `expectedVersion: z.number().int().min(1).optional()`.

**A5. `src/app/api/books/[id]/chapters/[chapterId]/content/route.ts`**
- PUT (`:109-117`): pass `data.expectedVersion` into `svc.update(...)`; wrap in try/catch for `VersionConflictError` and **return 409 before the word-count delta math at `:130-142`**. 409 body: `{ error: "version_conflict", currentVersion, serverContent }` via `svc.read(existingDoc.id)` in the catch — run `serverContent` through the same `sanitizeUnicode` (`:10-12`) used by GET so client equality checks are symmetric.
- PUT success: return `{ wordCount, version: result.document.currentVersion }` (`svc.update` already returns it — currently discarded). Create branch (`:120-127`) returns `version: 1`.
- GET (`:54-58`): add `version: result.document.currentVersion` from `svc.read`'s document.

**A6. `src/lib/api-client.ts:5-19`**
Add `export class ApiError extends Error { constructor(message: string, public status: number, public body: unknown) }`; throw it from `fetchJson`. Message stays `body.error` so existing message-sniffing (`finding-card.tsx:153`) keeps working.

**A7. `src/stores/editor-store.ts`**
Extend pane state (`:13-26`, `:50-66`): `documentVersion: number | null`, `saveConflict: { serverContent: string; serverVersion: number } | null`, plus setters. Clear both in `setChapter` (`:72-73`).

**A8. `src/hooks/use-documents.ts:23-42`**
`useSaveChapterContent` mutationFn becomes `({ markdown, expectedVersion })`; body includes `expectedVersion`; response typed `{ wordCount: number; version: number }`. Keep the onSuccess invalidation as-is.

**A9. `src/components/editor/manuscript-editor.tsx` — client flow**
- Load effect (`:287-318`): after `setDocumentId`, `setDocumentVersion(chapterData.version ?? null)`.
- `saveContent` (`:321-333`): stamp `expectedVersion` from pane store; on success `setDocumentVersion(res.version)` then `setLastSaved`. Catch `ApiError && status===409`:
  - **No-op resolution:** if `serverContent === md` (both sanitized; optionally compare against last-saved markdown snapshot to absorb TipTap round-trip noise) → `setDocumentVersion(currentVersion)` + `setLastSaved` (clears dirty). No UI.
  - **Real conflict:** `setSaveConflict({ serverContent, serverVersion })`; `setSaving(false)`; `toast.warning("Chapter changed outside this editor", { description, action: { label: "Review", onClick: openConflictDialog } })`. **Do NOT auto-open the dialog — typing must never be interrupted.** Other errors: today's silent path.
- Autosave effect (`:335-351`): add `if (isSaving) return;` (with `isSaving` as a dep so it re-fires when the in-flight save lands — prevents spurious 409s from same-stamp overlap) and `if (saveConflict) return;` (suspends autosave while unresolved; typing continues, content stays safe in the editor, route isn't hammered).
- **Agent-write interaction:** agent/import/finding/restore writers stay unguarded (last-write-wins among themselves), but they bump `currentVersion`, so the user's next stamped autosave 409s instead of silently clobbering — converting today's worst failure into an explicit choice. Expect the dialog right after "rewrite chapter" runs with the editor open; "Load theirs" must feel first-class, not like an error.
- **Immersive sync interaction (`:526-562, 891-902`):** while `immersive` is true, on 409 record `setSaveConflict` but **skip toast/dialog** (Radix Dialog overlay is z-50, under the immersive z-[100] overlay); surface on `exitImmersive`. Suspended autosave bounds immersive data-at-risk the same way as today (`immersiveHtmlRef` holds content).

**A10. Conflict dialog — new file (see §3)**
Controlled Dialog copying `version-history-panel.tsx:222-258` + DiffView pattern (`:193-220`): server content vs `getMarkdownFromEditor(editor)`. Footer:
- **"Keep mine" (primary):** re-PUT local markdown with `expectedVersion: serverVersion` (CAS passes); update version, `setLastSaved`, clear conflict. Copy reassurance: "The other version is preserved in version history." (true — every write is snapshotted).
- **"Load theirs":** `editor.commands.setContent(serverContent, { emitUpdate: false })`; reset undo history exactly as the load effect does (`EditorState.create`, `:294-298`); `setDocumentVersion(serverVersion)`; mark clean; clear conflict.
- **Cancel:** conflict stays pending; autosave stays suspended.

**A11. `src/components/editor/editor-status-bar.tsx:186-209`**
Add a persistent amber "Conflict — click to review" chip (style per the stale badge in `finding-card.tsx:181-185`) that opens the dialog — the durable affordance after the toast expires.

### Part B — Graceful cost-limit degradation

Ordered edits. Principle: **never throw, never emit `"error"` for budget; warn at 80%, one final wrap-up turn at 100%; carry "ended early" as metadata, not a new status.**

**B1. `src/lib/agents/types.ts`**
- `:125-141`: add `"budget_warning"` to `AgentStreamMessage.type`.
- `:176-182`: extend `AgentResult` with `endReason?: "natural" | "budget" | "timeout"` and `wrapUpSummary?: string`.

**B2. `src/lib/agents/orchestrator.ts` — loop changes (verified anchors)**
- Locals in `runToolLoop` (near `:340`): `budgetNudgeSent`, `finalTurnRequested`, `endReason = "natural"`, `wrapUpSummary`.
- **80% warning:** after the `cost_update` emit (`:426-436`), when `Number.isFinite(this.maxSessionCostUsd) && runningCost >= 0.8 * max && !budgetNudgeSent`: set flag, emit `{ type: "budget_warning", content, metadata: { costUsd, budgetUsd, pct } }`. Also add `budgetUsd` to `cost_update` metadata so the UI can show % continuously. Do not break.
- **Nudge injection point:** the tool-results push (`messages.push({ role: "user", content: toolResults })`, ~`:627`). When `budgetNudgeSent`, append a text block **after** the tool_result blocks in the same user message (API requires tool_results first; no mid-conversation system role — user-text is correct; precedent: `:485-495`). 80% text: "SYSTEM NOTICE: ~80% of budget used. Prioritize remaining work; file findings (CreateFinding) and save documents (WriteDocument) now; begin wrapping up." **Do not touch the max_tokens recovery block (`:447-497`)** — strict tool_use/tool_result pairing invariants.
- **100% = final turn, then exit** (replaces `break` at `:439-445`): if `finalTurnRequested` already → `endReason="budget"; break` (still exception-free). Else set `finalTurnRequested=true`, emit `{ type: "status", content: "Budget reached — wrapping up.", metadata: { budgetStop: true } }`, don't break; the next tool-results push appends the FINAL nudge: "BUDGET EXHAUSTED: final turn. (1) file unfiled findings, (2) save in-progress documents, (3) end with a 'Session Summary' of done/remaining." The crossing turn's tool calls still execute once (desired: let it finish filing). Optionally restrict the `tools` array to `{CreateFinding, WriteDocument}` for the final iteration. Accumulate final-turn text blocks into `wrapUpSummary`. If the model attempts more tool_use afterward, the guard re-fires and breaks.
- Return `{ inputTokens, outputTokens, endReason, wrapUpSummary }` from `runToolLoop`; thread into `AgentResult` in `runAgent` (`:185-191`) and `continueConversation` (`:292-298`).
- **Timeout unification (same mechanism):** replace the setTimeout error+cancel (`:119-125`) with a `deadline`; 80% elapsed → `budget_warning` with `metadata.kind="time"`; 100% → final turn with `endReason="timeout"`. Pass `{ signal: this.abortController.signal }` to `client.messages.stream` (`:352`) so **user** cancel actually aborts the request; keep `cancel()` for user cancellation only.

**B3. Budget plumbing fix (prerequisite for any of this to fire)**
- `agent/route.ts:384`: replace `sessionCostLimit: Infinity` with a finite per-workflow budget (e.g. derived from the `estimateWorkflowCost` already computed at `:351`, × safety factor) — **Infinity does not survive BullMQ JSON serialization** (→ null → `?? 10`). Validate `typeof x === "number" && isFinite(x)` in the worker (`agent-worker.ts:335`).
- `agent/route.ts:440`: same for inline `maxSessionCostUsd`.
- Decide coach-vs-shared explicitly: either compare `sharedCostTracker` totals at the guard (`orchestrator.ts:439`) so specialist spend counts, or document the cap as coach-only with the $5/specialist sub-caps (`tools.ts:1832`). Recommend the former; otherwise actual spend can exceed budget under Opus specialists.

**B4. Completion paths — persist & publish, keep status `"completed"`**
Adopt Spec 3's position over a new `"completed_budget"` DB status: **status stays `"completed"`**; early-end is metadata. This avoids touching the terminal-status consumers (`cancel/route.ts:34`, `stream/route.ts:100-103`, `message/route.ts:74`, client store union, progress list).
- `agent-worker.ts` onComplete (`:443-530`): write tokens/cost/usage as today. Extend the `"complete"` publish (`:506-518`) metadata with **top-level** `endReason` and `wrapUpSummary` (do NOT nest under `resultMeta` — the worker flattens it and `use-agent-stream.ts:58` reads `metadata.resultMeta`; known mismatch). Wire the orphaned `createSessionBrief` (`session-brief.ts:37`) with `summary = wrapUpSummary ?? "Session ended at budget limit ($X)."` and `nextSteps = postResult.suggestedNext`; wire `getRecentBriefs`/`formatBriefsForPrompt` into the prompt assembler so the **next** session sees what remains — this is the resume mechanism, since transcript resume is dead code.
- Mirror `endReason` in the inline route onComplete (`agent/route.ts:464-527`) and message route (`message/route.ts:200-227`).
- `stream/route.ts:122-136`: keep closing on `"error"` (still used by genuine onError/cancel) — budget no longer emits it, so no change is strictly required; verify `"budget_warning"` passes through and is replay-buffered.

**B5. Client**
- `use-agent-stream.ts`: handle `"budget_warning"` before the error branch — `addMessage` (and optionally a store field mirroring `updateSessionCost`, `:327-340`) but **never** `setSessionError`. In the `"complete"` handler (`:53-67`) read top-level `metadata.endReason`/`wrapUpSummary` and pass to `setSessionComplete`.
- `agent-session-store.ts:13-18`: add `endReason?: string; wrapUpSummary?: string` to `SessionResultMeta`. Status union unchanged.
- `message-stream.tsx`: add a `"budget_warning"` case in the block-builder switch (after `"status"`, `:237-239`); render as a sticky amber banner following the `TimeoutWarning` pattern (`:368-377, 446-501`). Keep the case cheap — this switch is on the throttled hot path.
- `agent-panel.tsx`: in the isComplete block (`:680`), when `resultMeta.endReason === "budget"|"timeout"` render an amber "Session ended early — budget reached ($X). Partial results saved." banner above the summary card, showing `wrapUpSummary` and a **"Continue where it left off"** button that starts a NEW session of the same `workflowId` (continuity via the SessionBrief from B4). Extend the cost span (`:525-530`) to `$X.XX / $Y (Z%)` when `budgetUsd` is known.
- `session-progress-list.tsx:126-134`: amber icon when `resultMeta.endReason` is budget/timeout instead of the green check.

---

## 3. NEW FILES

| File | Purpose |
|---|---|
| `src/lib/documents/errors.ts` | `VersionConflictError` (exported via `src/lib/documents/index.ts`) |
| `src/components/editor/save-conflict-dialog.tsx` | Conflict Dialog: DiffView (server vs local), "Keep mine" / "Load theirs" / Cancel; copies `version-history-panel.tsx` conventions |

Everything else is edits to existing files. No Prisma migration (status stays `"completed"`; `currentVersion` already exists).

---

## 4. RISKS & GUARDS

1. **Never interrupt typing (mandatory).** 409 → toast + status-bar chip only; the dialog opens only on explicit click. Autosave suspends while a conflict is pending; the editor buffer is never touched without the user choosing "Load theirs".
2. **Never lose local words on 409.** The 409 returns before any write (CAS rejects inside the transaction; storage write moved after it — **the reorder in A3 is load-bearing**, otherwise the 409 lies). Local content stays in TipTap; "Keep mine" re-stamps it; "Load theirs" still preserves local-as-overwritten only after explicit choice, and every server write is a recoverable `DocumentVersion`.
3. **Backward compat of PUT/service contract.** `expectedVersion` is optional end-to-end: agent `WriteChapter`, import, finding apply, restore, and the background worker's `DocumentService` construction (`orchestrator.ts:127-158`) pass nothing and keep exact current semantics — a thrown `VersionConflictError` is impossible on unguarded paths. Old clients PUTting `{ markdown }` still succeed. Extra `version` fields in GET/PUT responses are additive.
4. **SSE client compat with unknown types.** Unknown message types fall through to `addMessage` (`use-agent-stream.ts:121`) and pass the background publish/replay verbatim — `"budget_warning"` is safe for stale clients. Never emit `"error"` for budget/timeout: it terminates the background stream (`stream/route.ts:122-136`) and flips the client to "failed" while DB says "completed".
5. **In-flight save overlap:** without the `isSaving` autosave guard, save B stamps the same version as in-flight save A → false conflict dialogs on slow connections. Guard is mandatory.
6. **Equality-check fragility:** GET sanitizes U+FFFD, PUT stores raw, TipTap round-trips differ cosmetically — normalize both sides identically (A5/A9) or the no-op resolution misfires into spurious dialogs.
7. **Split editor:** two panes in one tab can open the same chapter with independent pane stores and will now 409 against each other; test this flow, consider keying version by chapterId later.
8. **New visible behavior:** stale-editor-after-agent-run now surfaces as a conflict (previously silent overwrite) — by design, but "Load theirs" UX must be polished. Expect more finding stale-badges after resolutions (existing machinery degrades gracefully).
9. **Budget overshoot by one turn:** the final wrap-up turn can cost up to one full model turn (~$1 Sonnet / ~$5 Opus at 64k out); 80% threshold + restricted final-turn toolset bounds it.
10. **Worker must end via onComplete:** any thrown wrap-up path triggers BullMQ's 3 retries (`agent-queue.ts:60-65`) and double-bills. The design is exception-free at both 80% and 100%.
11. **Do not touch:** max_tokens recovery block (`orchestrator.ts:447-497`), approval plumbing (`:528-602`, worker `:340-381` — do not model budget as approvals), `use-agent-stream` reconnection effect deps (`:127-169`), message-stream throttling (`:120-172`), dead `waitForApproval` (`agent-worker.ts:639-697`).
12. **`fetchJson` → `ApiError`** touches a shared utility used by 10+ hooks; subclass `Error` with unchanged message so all `.message` checks survive.

---

## 5. TEST PLAN

**Static gates:** `npx tsc --noEmit`; `npm run lint`; existing test suite green; grep that no call site emits SSE `"error"` for budget/timeout; grep that `Infinity` no longer appears in `agent/route.ts` job data.

**Unit/integration (A):**
- `createVersion` CAS: with matching `expectedVersion` increments; with stale value throws `VersionConflictError` and leaves `currentVersion` + storage untouched (assert no live-content write — verifies the A3 reorder); omitted param = unconditional (agent/import/restore regression).
- PUT route: stale `expectedVersion` → 409 `{ error:"version_conflict", currentVersion, serverContent }` with **no** word-count mutation; fresh → 200 `{ wordCount, version }`; no `expectedVersion` → 200 (legacy contract). GET returns `version`.
- `sanitizeUnicode` symmetry: content containing U+FFFD round-trips to equal strings in the 409 body vs GET.

**Unit/integration (B):**
- Orchestrator with mocked stream + `maxSessionCostUsd` fixture: crossing 80% emits exactly one `budget_warning` (one-shot) and the next tool-results message carries the appended text block after all tool_results; crossing 100% emits `status {budgetStop}`, allows one final turn, returns `endReason:"budget"` + `wrapUpSummary`, never throws; second crossing executes CreateFinding/WriteDocument once, emits tool_result SSE for all wrap-up tool_use ids, then breaks.
- Worker onComplete with `endReason:"budget"`: DB status `"completed"`, usage recorded, SessionBrief created, `"complete"` publish has top-level `endReason`/`wrapUpSummary`.
- BullMQ serialization: enqueue job with finite `sessionCostLimit`, assert worker receives a finite number.

**Manual verification:**
1. Type in a chapter; confirm normal autosave shows version-stamped saves ("Saved HH:MM").
2. Open the same chapter in two tabs; edit in both → second tab's autosave shows toast + status-bar chip, typing uninterrupted; "Keep mine" wins the CAS; "Load theirs" replaces content + resets undo; version history shows both writes.
3. With the editor open and dirty, run an agent rewrite of that chapter → next autosave 409s instead of clobbering; resolve both ways.
4. Immersive mode: trigger a conflict during the 30s sync → no dialog under the overlay; toast appears on exit.
5. Split editor, same chapter in both panes → verify the documented conflict behavior.
6. Start a background workflow with a low test budget (e.g. $0.10): observe amber warning banner at ~80%, "$X / $Y (Z%)" in the stats bar, wrap-up turn, amber "ended early" completion card with summary and "Continue" button; DB status "completed"; stream stays open until `complete`.
7. Repeat inline (conversational workflow) — verify no error-then-complete status flip.
8. "Continue where it left off" starts a new session whose prompt includes the prior SessionBrief.
9. User-cancel an inline session — confirm the request now actually aborts (signal passed).

---

**Build order:** A1→A5 (server, independently shippable; PUT stays backward-compatible) → A6→A11 (client) → B3 (budget plumbing) → B1→B2 (orchestrator) → B4 (persistence) → B5 (UI). Parts A and B are independent and can land as separate PRs.