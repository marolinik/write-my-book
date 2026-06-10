## [high] PUT success returns re-read currentVersion instead of this save's version — silent-overwrite window
**File:** D:/Projects/wmb-pub/src/app/api/books/[id]/chapters/[chapterId]/content/route.ts:123

The route stamps the client with `result.document.currentVersion`, but `DocumentService.update` produces `result.document` via a fresh `findUnique` AFTER the CAS transaction commits and after the live storage.write (document-service.ts:134-138). If an unguarded writer (agent WriteChapter, import, finding apply, restore) commits between our CAS commit and that re-read, the returned currentVersion is the OTHER writer's version. The client (saveContent at manuscript-editor.tsx:366 and Keep-mine at save-conflict-dialog.tsx:76) adopts a version stamp whose content it has never seen; its next stamped autosave CAS-passes and silently overwrites the other writer's content — exactly the agent-rewrite clobber Part A exists to prevent, converted from a detected 409 back into silent loss. The window is small (ms between commit and re-read) but the trigger scenario (agent rewriting while the editor autosaves) is the feature's headline case. Fix is trivial and deterministic: return `result.version.version` (the DocumentVersion row created inside the transaction, always expectedVersion+1), not the re-read document.currentVersion.

**FIX:** In D:/Projects/wmb-pub/src/app/api/books/[id]/chapters/[chapterId]/content/route.ts line 123, change `version = result.document.currentVersion;` to `version = result.version.version;`. This uses the DocumentVersion row created inside the CAS transaction (always exactly expectedVersion+1 under the lock), so the client is stamped with the version of the content it actually wrote, and any concurrent unguarded write correctly triggers a 409 on the next stamped save instead of being silently overwritten. No other change needed: the create branch already returns the deterministic 1, and the agent tool path already uses updated.version.version.

---

## [medium] Torn read of DB version vs storage content in 409 body and GET — can produce a false no-op (silent data loss) or a stale 'Load theirs'
**File:** D:/Projects/wmb-pub/src/lib/documents/document-service.ts:111-124 (writer); route.ts:126-139 and :51-58 (readers)

Writers commit currentVersion in the DB transaction first and write live storage content second (the A3 reorder makes this ordering mandatory). `svc.read` — used by both the 409 handler and GET — reads the DB row, then storage, with no consistency guarantee. In the winner's commit→storage-write gap (a full network hop to S3-style storage, plausibly 50-300ms), a losing save's 409 body pairs the NEW currentVersion with the OLD content. Two consequences: (a) if that stale serverContent string-equals the loser's md (dirty-but-identical content: typed-then-undone, or two tabs saving the same text), the client no-op check falsely fires — it adopts the new version stamp while holding old content, and its NEXT save CAS-passes and silently overwrites the winner's write. This is the false-no-op → silent-data-loss failure the review flags as unacceptable; rare but structurally reachable. (b) In the real-conflict path the dialog diffs stale content labeled v(N+1), and 'Load theirs' installs stale content stamped with the new version — the next save then silently overwrites the winner. GET has the same torn window (client loads vN content stamped vN+1 → first save CAS-passes over content it never saw). A consistent fix: in the 409 handler (and GET), read serverContent from the DocumentVersion snapshot whose version equals the currentVersion just read (its storageKey is deterministic via getVersionStoragePath), since snapshots are written inside the transaction; or re-read the DB version after the storage read and retry on mismatch.

**FIX:** Pin reader content to the DB version via the version snapshot (written inside the createVersion transaction, so it is consistent with any committed currentVersion). Add to DocumentService (D:/Projects/wmb-pub/src/lib/documents/document-service.ts):

```ts
/**
 * Read content consistent with currentVersion. The live key is written
 * AFTER the version transaction commits (see update()), so DB-version +
 * live-key pairs can tear; the snapshot at currentVersion is written
 * inside the transaction (version-manager.ts) and cannot.
 */
async readPinned(documentId: string) {
  const document = await db.document.findUnique({ where: { id: documentId } });
  if (!document) return null;
  const snap = await this.storage.read(
    getVersionStoragePath(documentId, document.currentVersion)
  );
  if (snap !== null) return { document, content: snap };
  // Fallback: docs whose snapshot is missing (e.g. create()'s brief v1
  // window, or legacy/imported docs) — live key, best effort.
  const content = await this.storage.read(document.storageKey);
  return { document, content: content ?? "" };
}
```

Then in D:/Projects/wmb-pub/src/app/api/books/[id]/chapters/[chapterId]/content/route.ts replace both torn reads: in the 409 handler (line 129) `const current = await svc.readPinned(existingDoc.id);` and in GET (line 51) `const result = await svc.readPinned(doc.id);`. No client changes needed — the 409 body and GET response now always pair currentVersion with the exact content of that version, so the no-op equality check, the conflict diff, 'Load theirs', and the initial version stamp are all consistent. Bonus: this also fixes a pre-existing hazard where two unguarded writers' live-key S3 writes land out of commit order, leaving the live key permanently stale relative to the DB version. (The alternative — re-read currentVersion after the storage read and retry on mismatch — also works but is loop-based and still racy under sustained writes; the snapshot pin is single-shot and exploits an invariant already guaranteed by version-manager.ts:54-57.) Suggested test: stub storage so update()'s post-commit live write is delayed; fire a losing PUT during the delay and assert the 409 body's serverContent equals the winner's content, not the previous version's.

---

## [medium] Async save resolution not guarded against chapter switch — pane store polluted with the previous chapter's version/conflict
**File:** D:/Projects/wmb-pub/src/components/editor/manuscript-editor.tsx:354-406

The pane store is keyed by paneId and survives navigation; `setChapter` re-targets it to the new chapter and clears documentVersion/saveConflict. But a save in flight at navigation time resolves its continuation against the store unconditionally: (a) success or no-op-409 → `setDocumentVersion(<old chapter's version>)` stamps chapter A's version onto chapter B's pane — the next autosave either 409s spuriously (confusing wrong-chapter dialog) or, at coincidentally equal small version numbers, CAS-passes; `setLastSaved` also clears isDirty, stranding any edits already typed into chapter B; (b) real 409 → `setSaveConflict` records chapter A's serverContent/serverVersion on chapter B's pane: the toast/chip/dialog then diff chapter A's server content against chapter B's editor, and 'Load theirs' would set chapter A's content into chapter B's editor stamped with A's version, after which a coincidental version match would save chapter A's text over chapter B's document. The mutation continuation (use-documents onSuccess) is chapter-scoped, but every pane-store write in saveContent's continuation is not. Fix: at each resolution point compare `paneStore.getState().chapterId` with the chapterId captured by the closure (prop) and drop the result on mismatch. The 409-during-navigation trigger is realistic exactly when agent workflows are rewriting chapters.

**FIX:** In saveContent (D:/Projects/wmb-pub/src/components/editor/manuscript-editor.tsx:354-406), capture the target chapter at dispatch time from the STORE (not the prop — the useCallback closure's chapterId prop goes stale after in-place route-param updates) and drop the resolution on mismatch, resetting isSaving because setChapter does not (otherwise the `if (isSaving) return;` guard at line 413 deadlocks the new chapter's autosave):

const saveContent = useCallback(async () => {
  if (!editor) return;
  const md = getMarkdownFromEditor(editor);
  const dispatchedChapterId = paneStore.getState().chapterId;  // NEW
  const expectedVersion = paneStore.getState().documentVersion ?? undefined;
  paneStore.getState().setSaving(true);
  // Chapter switched while the save was in flight — the store now belongs
  // to another chapter; drop the result (server write already landed on the
  // correct chapter's route).
  const isStale = () => paneStore.getState().chapterId !== dispatchedChapterId;  // NEW
  try {
    const res = await saveMutationRef.current.mutateAsync({ markdown: md, expectedVersion });
    if (isStale()) { paneStore.getState().setSaving(false); return; }  // NEW
    paneStore.getState().setDocumentVersion(res.version);
    paneStore.getState().setLastSaved(new Date());
  } catch (error) {
    if (isStale()) { paneStore.getState().setSaving(false); return; }  // NEW
    if (error instanceof ApiError && error.status === 409) {
      ... existing 409 handling unchanged ...
    }
    paneStore.getState().setSaving(false);
  }
}, [editor, paneStore, showConflictToast]);

Reading dispatchedChapterId from the store at dispatch time is safe: an autosave for the new chapter cannot fire before the setChapter effect (line 295) has run, because setChapter clears isDirty and the autosave effect requires isDirty. The dropped save's server write is still correct (the PUT targeted the old chapter's route via the mutation instance captured in saveMutationRef at dispatch). Optionally, the same staleness pattern could harden SaveConflictDialog.handleKeepMine, but the modal overlay makes mid-resolve navigation an edge case.

---

## [medium] Conflict-pending state suspends autosave indefinitely with no unload guard — unbounded unsaved work, while the toast promises safety
**File:** D:/Projects/wmb-pub/src/components/editor/manuscript-editor.tsx:414-416

While `saveConflict` is set, autosave is fully suspended and the user can keep typing — by design (spec §4.1). But there is no `beforeunload` handler anywhere in src/ (verified by grep), so everything typed after the conflict exists only in TipTap memory: navigation (which also silently clears the conflict via setChapter), tab close, or crash loses an unbounded amount of work — potentially an entire writing session if the user dismisses or never notices the toast/chip. The toast copy 'Your words are safe here' overstates this. The same applies in immersive mode: the 30s sync keeps marking dirty but nothing persists while the conflict is pending, so immersive data-at-risk is no longer bounded to ~32s as the in-code comment claims. Minimum fix honoring spec §4.2 ('never lose local words'): register a beforeunload prompt while `saveConflict && isDirty`, and/or snapshot the editor content to localStorage when a conflict is recorded.

**FIX:** Minimal fix, three small pieces in src/components/editor/manuscript-editor.tsx: (1) beforeunload guard — add an effect: `useEffect(() => { if (!saveConflict || !isDirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [saveConflict, isDirty]);` (covers tab close/reload; consider keying on isDirty alone to also cover the ordinary 2s window). (2) localStorage snapshot for crash/nav safety — in the real-conflict branch of saveContent (after setSaveConflict, ~line 390) write `localStorage.setItem("wmb-conflict-draft-" + chapterId, md)`, refresh it inside the suspended-autosave path (replace the bare `if (saveConflict) return;` at :416 with a branch that snapshots current editor markdown before returning), and remove the key in both dialog resolutions (handleKeepMine/handleLoadTheirs in save-conflict-dialog.tsx). Even without a restore UI this makes the safety promise approximately true; a follow-up can offer "Restore draft" on chapter load when the key exists and differs from server content. (3) Honest copy — change the toast description at :345 from "Your words are safe here." to something like "Your words are kept in this editor — review to resume saving." Optionally (worth it given setChapter silently clears the conflict): gate the in-editor prev/next/breadcrumb router.push calls behind a window.confirm when `saveConflict && isDirty`. Also fix the now-false immersive comment at :631 (~32s bound does not hold while a conflict is pending) or surface a minimal conflict indicator inside the immersive top bar.

---

## [high] Final wrap-up turn's tool calls are silently dropped, contradicting the FINAL nudge
**File:** D:/Projects/wmb-pub/src/lib/agents/orchestrator.ts:546-549, 626-759

FINAL_TURN_NUDGE_TEXT (orchestrator.ts:47-51) explicitly instructs the model to '(1) File any unfiled findings with CreateFinding. (2) Save any in-progress documents with WriteDocument.' on its final turn. But on that wrap-up turn the guard runs immediately after the stream completes and `if (finalTurnRequested) break;` (line 546-549) executes BEFORE the stop_reason handling, so any tool_use blocks in the wrap-up response are never executed — exactly the findings/documents the nudge told it to save are lost. Worse, the streaming phase already emitted `tool_use` SSE events for those blocks (lines 390-399: content_block_start), with no matching `tool_result` SSE ever sent, leaving orphaned tool spinners in the UI. Since cost/time are monotonic, this break fires on EVERY wrap-up turn that contains tool calls — and a compliant model following the nudge will almost always emit tool calls. The spec (TIER3 §2 B2) anticipated this ('restrict the tools array to {CreateFinding, WriteDocument} for the final iteration' was the optional mitigation) but as implemented the nudge instructs work the loop then discards. Fix: either execute the wrap-up turn's tool calls once before breaking (with a second-and-final break after), or restrict/remove tools on the final request and reword the nudge to text-only summary.

**FIX:** Minimal fix in orchestrator.ts: replace the bare `if (finalTurnRequested) break;` (:546-549) with a one-shot execution of persistence tools from the wrap-up response, tool_result SSE for every tool_use block (so spinners clear), then break — no messages.push, no extra model turn, so zero added model cost and the exception-free contract (spec §4 risk 10) is preserved:

```ts
if (finalTurnRequested) {
  // Wrap-up turn: persist the work the FINAL nudge instructed, clear UI spinners, then stop.
  const WRAP_UP_TOOLS = new Set(["CreateFinding", "WriteDocument"]);
  const wrapUpToolUses = finalMessage.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  for (const tu of wrapUpToolUses) {
    let resultText = "Session ended — tool skipped during wrap-up.";
    if (WRAP_UP_TOOLS.has(tu.name)) {
      try {
        const r = await executeTool(tu.name, toolCtx, tu.input as Record<string, unknown>);
        if (r !== APPROVAL_SENTINEL) resultText = r;
      } catch { /* exception-free at 100% — never throw (spec §4 risk 10) */ }
    }
    options.onMessage({
      type: "tool_result",
      content: resultText.length > 500 ? resultText.slice(0, 500) + "..." : resultText,
      metadata: { tool: tu.name, toolUseId: tu.id },
    });
  }
  break;
}
```

The allowlist is load-bearing: it excludes DelegateToSpecialist (would spawn a paid sub-agent after budget exhaustion) and RequestApproval (would block up to 10 min via APPROVAL_TIMEOUT_MS). Iterating content blocks (rather than gating on stop_reason === "tool_use") also covers a max_tokens-truncated wrap-up turn; truncated tool input JSON simply fails inside the try/catch. Also update the orchestrator unit test expectation in the TIER3 §5 plan from "second crossing breaks" to "second crossing executes CreateFinding/WriteDocument once, emits tool_result SSE for all wrap-up tool_use ids, then breaks." Alternative (smaller but worse) fix: strip the tools array on the final request and reword FINAL_TURN_NUDGE_TEXT to summary-only — honest, but abandons the spec's intent of letting the agent file its remaining findings.

---

## [medium] FINAL wrap-up nudge is lost when the limit-crossing turn ends with max_tokens (or any non-tool_use stop)
**File:** D:/Projects/wmb-pub/src/lib/agents/orchestrator.ts:566, 575-620, 546

When the budget/time limit is crossed on a turn whose stop_reason is `max_tokens`, the guard sets `finalTurnRequested=true` and `pendingNudge=FINAL_TURN_NUDGE_TEXT` (line 555-566), but the max_tokens recovery block (575-620) then pushes its own user message (truncation error tool_results or 'continue' text) and `continue`s WITHOUT consuming `pendingNudge` — pendingNudge is only ever flushed in the tool_results push at 750-758. On the next turn `finalTurnRequested` causes an immediate break (546), so the wrap-up instructions are never delivered: the model's 'final turn' is a blind truncation-retry whose retried tool call is then also dropped (see finding 1), and `wrapUpSummary` captures whatever fragment of the confused retry was text. The same nudge-never-delivered exit happens for any other stop_reason (e.g. refusal): guard arms the final turn, then line 762-763 breaks the loop the same turn. endReason is still correctly 'budget'/'timeout' in these paths, but the promised graceful wrap-up never happens. Fix: in the max_tokens branch, append pendingNudge to the recovery user message; for other stop reasons, don't arm a final turn that can't occur.

**FIX:** Two minimal changes in src/lib/agents/orchestrator.ts:

(1) Flush pendingNudge in both max_tokens recovery branches. In the truncated-tool-call branch (around line 607):

  const recoveryContent: Anthropic.ContentBlockParam[] = [...errorResults];
  if (pendingNudge) {
    recoveryContent.push({ type: "text", text: pendingNudge });
    pendingNudge = null;
  }
  messages.push({ role: "user", content: recoveryContent });

In the pure-text truncation branch (lines 611-617), append the nudge to the continue prompt:

  let continueText =
    "Your previous response was cut off because it exceeded the length limit. " +
    "Please continue exactly where you left off. Do not repeat what you already wrote. " +
    "IMPORTANT: Continue in the SAME language you were writing in.";
  if (pendingNudge) {
    continueText += `\n\n${pendingNudge}`;
    pendingNudge = null;
  }
  messages.push({ role: "user", content: continueText });

(This also benignly delivers the 80% BUDGET/TIME nudge one turn earlier when a max_tokens turn intervenes.)

(2) In the 100% guard (lines 551-567), only arm a final turn when a next turn can actually occur; otherwise just record endReason and let the existing break at line 763 end the session without the misleading "wrapping up" status:

  if (finalMessage.stop_reason === "end_turn") {
    // natural finish — fall through
  } else if (
    finalMessage.stop_reason === "tool_use" ||
    finalMessage.stop_reason === "max_tokens"
  ) {
    finalTurnRequested = true;
    endReason = overBudget ? "budget" : "timeout";
    options.onMessage({ /* existing budgetStop status */ });
    pendingNudge = FINAL_TURN_NUDGE_TEXT;
  } else {
    // refusal etc. — the loop breaks below regardless; no wrap-up turn possible
    endReason = overBudget ? "budget" : "timeout";
  }

Note: even with fix (1), tool calls the model makes ON its final turn are still dropped by the break at line 546 — that is the separate finding 1 and should be fixed there (e.g. execute the final turn's CreateFinding/WriteDocument calls once before breaking).

---

## [medium] User cancel still flows into onComplete(success:true): 'completed' overwrites the cancel route's 'failed' status, and the aborted turn's tokens are unrecorded
**File:** D:/Projects/wmb-pub/src/lib/agents/orchestrator.ts:421-425 (orchestrator); agent-worker.ts:489-498,544-568; cancel/route.ts:47-103

The new abort path (signal passed at orchestrator.ts:383; catch at 421-425 breaks silently) makes the loop return normally, so runAgent calls onComplete with success:true after a user cancel. Sequence (background): cancel route publishes an 'error' SSE, sets Redis status 'failed', sets the cancel flag, updates DB status 'failed' → worker checkCancellation aborts the orchestrator → the in-flight stream throws, the catch breaks, onComplete runs and writes DB status 'completed' (agent-worker.ts:492), publishes a 'complete' message into the replay buffer AFTER the cancel 'error', and overwrites the Redis status key with 'completed' (563-568). The worker's `if (cancelDetected) throw new SessionCancelledError()` (640-642) fires only after onComplete has already persisted 'completed'. This race pre-existed (the old advisory abort also reached onComplete eventually), but Part B makes it deterministic and near-instant, and the same applies to the inline path (agent/route.ts onComplete:516-525 vs cancel route step 4). Additionally new: because the abort now kills the request mid-stream, `finalMessage` never resolves, so the cancelled turn's input/output tokens are never added to totals or the shared tracker — actualCostUsd and the usage record under-report real provider spend for cancelled sessions (the old code awaited the full turn and counted it). Fix: have onComplete (or runAgent) detect `abortController.signal.aborted` and skip the status write / write 'failed', or pass a cancelled flag in AgentResult.

**FIX:** Minimal fix — make the orchestrator (the authoritative owner of abort state) report cancellation, and have both onComplete handlers respect it: (1) types.ts: add `cancelled?: boolean` to AgentResult. (2) orchestrator.ts runAgent + continueConversation: after runToolLoop returns, compute `const cancelled = this.abortController?.signal.aborted === true;` and include it in the AgentResult passed to onComplete (keep calling onComplete so already-counted tokens/cost from completed turns are still persisted). (3) agent-worker.ts onComplete: when `result.cancelled` — write `status: "failed"` (line 492 becomes `result.cancelled ? "failed" : result.success ? "completed" : "failed"`), skip the 'complete' publishMessage and the Redis `session:{id}:status = "completed"` SET (563-568), and skip processPostSession (gate the call at the top of onComplete). Still update tokensInput/tokensOutput/actualCostUsd and create the usage record. (4) agent/route.ts onComplete (516-525): same gating — when `result.cancelled`, pass success:false to completeSession (or skip it; cancelSession already notified listeners) and write status 'failed'. (5) Optional follow-up for the token under-count: in the streaming for-await loop, capture `usage` from message_start (input_tokens) and message_delta (cumulative output_tokens) events into per-turn locals, and on the aborted-catch path (orchestrator.ts:421-425) add those partials to totalInput/OutputTokens and sharedCostTracker before breaking — restores the old code's property that a cancelled turn's spend is still recorded. If only one change is possible, do (1)-(4); the status overwrite is the user-visible bug.

---

## [medium] Conductor budget guard prices specialist tokens at the conductor's (Sonnet) rate — Opus specialist spend under-counted ~5x against the budget
**File:** D:/Projects/wmb-pub/src/lib/agents/orchestrator.ts:461-468

`budgetedCost = estimateCost(this.registryId, sharedCostTracker.totalInputTokens, sharedCostTracker.totalOutputTokens)` prices ALL shared tokens at the conductor's registry rate. The shared tracker mixes tokens from specialists that run their own resolved models (tools.ts:1827-1834 passes the specialist's registryId to its own orchestrator, and its runToolLoop increments the same tracker) — if the user routes ghostwriter/editor to Opus ($15/$75 per 1M vs Sonnet's $3/$15), the guard, the 80% budget_warning, the cost_update SSE, and the new '$X / $Y (Z%)' UI all under-report real spend by up to ~5x, so actual cost can blow well past the advertised budget — the exact failure spec §2 B3 said this change was meant to prevent ('otherwise actual spend can exceed budget under Opus specialists'). The same mispricing pre-exists in the worker's final accounting (agent-worker.ts:487) but the new budget enforcement and user-facing $X/$Y display now actively rely on the wrong number. Also minor metadata inconsistency: cost_update emits shared costUsd alongside conductor-only inputTokens/outputTokens (469-481), so the displayed cost no longer corresponds to the displayed token counts. Fix: track accumulated USD in SharedCostTracker (each orchestrator adds estimateCost(its own registryId, turn tokens)) instead of raw tokens priced at the reader's rate.

**FIX:** Track accumulated USD in the shared tracker, priced by each orchestrator at its own rate (the reviewer's proposed fix is correct and minimal):

1. D:/Projects/wmb-pub/src/lib/agents/types.ts:145-148 — add `totalCostUsd: number;` to SharedCostTracker.
2. Initialize `totalCostUsd: 0` at the two construction sites: src/app/api/books/[id]/agent/route.ts:428-431 and src/lib/queue/agent-worker.ts:296-299.
3. D:/Projects/wmb-pub/src/lib/agents/orchestrator.ts:450-453 — alongside the token accumulation, add: `this.sharedCostTracker.totalCostUsd += estimateCost(this.registryId, finalMessage.usage.input_tokens, finalMessage.usage.output_tokens);` (each orchestrator — conductor and specialist — prices its own turn at its own registryId).
4. orchestrator.ts:461-468 — replace the re-pricing with: `const budgetedCost = this.delegationContext && this.sharedCostTracker ? this.sharedCostTracker.totalCostUsd : runningCost;` (specialist self-guard against its $5 sub-cap is unchanged and stays correctly priced).
5. D:/Projects/wmb-pub/src/lib/queue/agent-worker.ts:487 — use `sharedCostTracker.totalCostUsd` instead of `estimateCost(coachRegistryId, totalInput, totalOutput)` for actualCostUsd/UsageRecord.costEstimate, fixing the pre-existing DB mispricing in the same stroke (keep the token columns as-is).
6. Optional polish for the metadata inconsistency: in the conductor's cost_update (orchestrator.ts:469-481) either emit shared token totals (sharedCostTracker.totalInputTokens/totalOutputTokens) alongside the shared costUsd, or add e.g. `scope: "session"` so the client doesn't pair conductor-only token counts with session-wide cost.

---

## [high] In-editor finding Apply/Undo and version Restore now trigger false 'another writer' conflicts and suspend autosave
**File:** src/components/editor/manuscript-editor.tsx:321, 358, 390-401

The pane's documentVersion stamp is set only on initial content load (line 321, gated by contentLoadedRef) and from save responses (lines 366/383). But several first-party flows mutate the chapter document server-side via unguarded DocumentService.update while the chapter is open, bumping currentVersion without re-stamping or reloading the editor: (1) finding Apply via FindingCard inside EditorFindingsPanel (PATCH src/app/api/books/[id]/editorial/findings/[findingId]/route.ts:172, invalidates only ['editorial']); (2) finding Undo (undo/route.ts:62); (3) version Restore from the in-editor VersionHistoryPanel (useRestoreVersion invalidates ['chapter-content'] but the load effect's contentLoadedRef gate means the editor never reloads or re-stamps). After any of these, the very next autosave 409s with genuinely differing content, shows the 'Another writer (agent, import, or tab) saved a newer version' toast, and suspends autosave until the user manually resolves the dialog. Before this diff these flows saved silently (last-write-wins). Agent/import conflicts are the spec's intent, but conflicts caused by buttons inside the same editor view are a routine-flow UX regression: every in-editor Apply followed by typing now guarantees a conflict dialog, and 'Keep mine' silently reverts the applied text while the finding stays status=applied (DB/text inconsistency, previously silent, now requires interaction). Fix direction: after Apply/Undo/Restore, refresh the pane stamp (e.g. return the new version from those routes and setDocumentVersion, or reload content and re-stamp).

**FIX:** Make the editor adopt first-party server-side rewrites when it is clean, via one shared mechanism: (1) In src/hooks/use-editorial.ts, add qc.invalidateQueries({ queryKey: ["chapter-content", bookId] }) to the onSuccess of useApplyFinding and useUndoFinding (useRestoreVersion already invalidates it). (2) In src/components/editor/manuscript-editor.tsx, add a clean-resync path: when fresh chapterData arrives with chapterData.version !== paneStore.getState().documentVersion AND the pane is !isDirty && !isSaving && !saveConflict, re-run the load body even though contentLoadedRef is set — editor.commands.setContent(chapterData.markdown, { emitUpdate: false }), reset undo history via EditorState.create as the existing load effect does, markClean(), setDocumentVersion(chapterData.version), setDocumentId. This single effect fixes Apply, Undo, AND Restore (and also gracefully adopts agent/import writes while the editor is idle), while preserving the conflict dialog for the genuinely-dirty concurrent-edit case the spec targets. Remaining narrow race — the user types within the apply→refetch round-trip — degrades to today's conflict dialog, which is acceptable; if desired, the apply paths (FindingCard/AnnotationTooltip) can additionally mirror the originalText→newText replacement locally via the existing findTextPositions helper before restamping, eliminating even that window. Do NOT implement the restamp-only variant (returning the new version from the routes and calling setDocumentVersion without content sync): it would let the next autosave silently overwrite the applied text server-side while the finding stays status="applied".

---

## [medium] Autosave now retries failed saves in an infinite ~2s loop on persistent non-409 errors
**File:** src/components/editor/manuscript-editor.tsx:408-431

The autosave effect gained isSaving as both a guard and a dependency: `if (isSaving) return;` with deps [isDirty, isSaving, saveConflict, paneChapterId, saveContent]. On a failed save the catch calls setSaving(false), which flips the isSaving dep and re-runs the effect; isDirty is still true and saveConflict is null, so a new 2s timer is scheduled — save fails again — setSaving(true)/setSaving(false) re-fires the effect — repeat forever. Before this diff the deps were [isDirty, paneChapterId, saveContent], so a failed save simply stopped until the next keystroke. Permanent failures (400 from the 2MB markdown limit, 401 'Unauthorized' plain-Error path, persistent 500s, network down) now hammer PUT /content every ~2s indefinitely with no backoff — exactly the route-hammering the conflict guard comment says it wants to avoid (the guard covers only the 409-conflict case). Add a failure latch/backoff or only reschedule on isDirty transitions.

**FIX:** Add exponential backoff driven by a consecutive-failure counter ref, preserving retry-until-success for transient errors while bounding route load. In src/components/editor/manuscript-editor.tsx: (1) add `const saveFailuresRef = useRef(0);` next to saveTimerRef; (2) in saveContent, set `saveFailuresRef.current = 0;` on the success path and both 409 sub-paths (no-op adoption and real-conflict recording), and `saveFailuresRef.current += 1;` in the non-409 fall-through before setSaving(false) — optionally fire a one-time toast.error("Autosave is failing — check your connection") when the counter hits 3; (3) in the autosave effect, replace the fixed 2000 with `const delay = Math.min(2000 * 2 ** saveFailuresRef.current, 60_000);` and use it in setTimeout. The ref is read at schedule time on each effect re-run (which the isSaving dep already triggers), so no dependency changes are needed. Optionally reset the counter in the setChapter mount effect. This yields 2s/4s/8s/.../60s-capped retries: transient failures still self-heal (better than the pre-diff permanent stall), while a permanent 400/500 settles to one request per minute instead of one every ~2s.

---

## [medium] SaveConflictDialog 'Load theirs' permanently discards unsaved local edits while the copy promises both versions stay in history
**File:** src/components/editor/save-conflict-dialog.tsx:116-135, 145-147

The dialog text states 'Whichever you choose, the other version stays in version history.' That is true for 'Keep mine' (the server version was snapshotted by the agent/import write), but false for 'Load theirs': the local editor content at conflict time was never saved (the 409 rejected it, and the conflict state suspends all further autosaves), so handleLoadTheirs' setContent + markClean + undo-history reset irrecoverably destroys everything typed since the last successful autosave. Because autosave is suspended while the conflict is pending (manuscript-editor.tsx:416), the unsaved window can grow unboundedly — a writer who keeps typing after the toast and later clicks 'Load theirs' loses all of it, with UI copy that explicitly reassured them otherwise. Mitigation: save the local content as a version (unguarded changeSource 'conflict-backup') before replacing, or correct the copy and add a confirmation.

**FIX:** Make handleLoadTheirs persist the local words as a version before replacing them, so the dialog copy becomes true. (a) In src/hooks/use-documents.ts, add optional `changeSource?: string` to the useSaveChapterContent mutationFn args and include it in the JSON body — the route and updateChapterContentSchema (src/lib/validation.ts:195-201) already accept it. (b) In src/components/editor/save-conflict-dialog.tsx, make handleLoadTheirs async with setIsResolving(true) (it currently never sets isResolving): first do an UNGUARDED save `await saveMutation.mutateAsync({ markdown: getMarkdownFromEditor(editor), changeSource: "conflict-backup" })` (no expectedVersion → CAS skipped, local words snapshotted into version history); then a guarded save of the server content `await saveMutation.mutateAsync({ markdown: saveConflict.serverContent, expectedVersion: backup.version, changeSource: "conflict-resolve" })` so live content returns to the server version; then run the existing setContent / undo-history-reset / setDocumentVersion(res.version) / markClean / setSaveConflict(null) / onOpenChange(false) sequence. In catch, leave the editor and conflict state untouched and show a toast ("Could not back up your edits — nothing was changed") so words stay safe on failure; finally setIsResolving(false). Word-count deltas net out correctly since each PUT adjusts by delta. Fallback minimal alternative if the double-save is out of scope: correct the dialog copy to state that unsaved local edits will be discarded by 'Load theirs' (only the last autosaved version is in history) and require a confirmation step.

---

## [medium] 'Continue where it left off' drops the original session's chapterNumber, changing workflow scope on continuation
**File:** src/components/agent/agent-panel.tsx:699-711

The ended-early card's Continue button calls handleWorkflowSelect(workflowId) with no chapterNumber. SessionState (src/stores/agent-session-store.ts) does not record the chapterNumber the original session was started with (only workflowQueue entries carry it), so a chapter-scoped session that hit budget/timeout (e.g. dev-edit/write-chapter for chapter 7) is continued as a book-scoped session: prompt-assembler gets context.chapterNumber undefined, the chapter-content section is omitted, and getRecentBriefs falls back to unfiltered book-level briefs — the continuation may not resume the same chapter's work. Other side effects checked and OK: double-start is guarded (isStartingRef + isPending disable), and quota consumption (checkQuota 'use_agent_session' per POST) is the same as any manual start. Fix: store chapterNumber on SessionState at startSessionStore time and pass it through the Continue handler.

**FIX:** Minimal fix, exactly as the reviewer proposes — store chapterNumber on SessionState and thread it through the Continue handler (3 small edits, client-only): 1) src/stores/agent-session-store.ts: add `chapterNumber?: number` to SessionState (and to PersistedSession + persist/load helpers so it survives the sessionStorage round-trip); extend the startSession signature with an optional chapterNumber parameter and write it into the new session object. 2) src/components/agent/agent-panel.tsx handleWorkflowSelect (line ~197): pass the in-scope chapterNumber parameter into startSessionStore. 3) agent-panel.tsx:707 Continue button: change `onClick={() => handleWorkflowSelect(workflowId)}` to `onClick={() => handleWorkflowSelect(workflowId, activeSession?.chapterNumber)}`. Optional hardening (not required for the fix): in the POST route, when the workflow has requiresChapter and no chapterNumber is supplied, either reject with 422 or resolve it from the most recent AgentSession row for that workflowId — the DB already stores chapterNumber per session (route.ts:350), so a server-side fallback is available if continuation entry points multiply later.

---
