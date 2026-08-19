# D-36 gatekeeper review -- provider failure resolves session as failed, not completed

Commit: 486bae1f58c2fc8f3eb65ae208b88aa97be40542 in worktree D:\Projects\wmb-pub\.claude\worktrees\agent-a26dd4c7e023cbfd5 (branch worktree-agent-a26dd4c7e023cbfd5, rebased onto qa tip 0dde596).

Verdict: SAFE

## Empirical verification performed
1. RED at parent. Checked out the 6 touched source files (orchestrator.ts, agent-worker.ts, both inline agent routes, use-agent-stream.ts, types.ts) to parent 0dde596 while keeping the two new HEAD test files, and ran them: 10 failed / 3 passed out of 13 -- exact match to the commit message's claim.
   (3 pass pre-fix because they assert pre-existing-correct behavior, e.g. the cheap-session-still-completes case). Worktree restored to HEAD afterward (git status --short empty, confirmed at 486bae1).
2. GREEN at HEAD. npx tsc --noEmit gives 0 errors. npx vitest run (full suite) gives 624/624 passed, 91 files, no failures, no skips. Matches the commit's claimed "full suite green."

## Architecture claims verified against source (not trusted from the message)

1. orchestrator.ts (src/lib/agents/orchestrator.ts): Confirmed the pre-fix non-abort catch branch (provider error, not user-cancel) only emitted an SSE "error" and broke, leaving endReason at its default "natural" and success hardcoded true in both runAgent (line ~228) and continueConversation (line ~330) -- the exact D-36 bug.
   Post-fix: the same branch now records the dying turn's partial spend into totalInputTokens/totalOutputTokens/sharedCostTracker (mirroring the untouched user-cancel abort branch immediately above it in the same catch), sets providerFailure = true and endReason = "error", then breaks. A new post-turn check (turn === 0 and no produced work and output_tokens === 0) catches the "hollow 200" outage shape.
   Both runAgent and continueConversation resolve success: !result.providerFailure via onComplete -- never onError (the outer catch in runAgent/continueConversation, which calls onError, only fires for genuinely unexpected exceptions escaping runToolLoop's own internal try/catch -- all provider errors are absorbed inside the loop and never propagate that far). Confirmed by direct read of runToolLoop, runAgent, continueConversation.
2. agent-worker.ts: Confirmed processPostSession is now gated on (not result.cancelled and result.success) (was just not result.cancelled); a new "if not result.success" block sets Redis session:{id}:status to "failed" and returns before reaching the publishMessage complete / status completed code -- so a failed session gets no SSE complete and no Redis "completed".
   DB agentSession.update (status/tokens/cost/completedAt) and usageRecord.create run unconditionally above this branch, so accounting is intact for failed sessions.
   The batch-ledger incrbyfloat spend roll-up is also unconditional; the consecutive-streak clear (if result.success and not result.cancelled, del the key) is a pre-existing line, unmodified by this diff -- it was already gated on result.success, it just never mattered before because result.success was always hardcoded true.
   Confirmed via git show of the parent commit that this exact gate predates the fix.
3. Inline routes (books/[id]/agent/route.ts, series/[id]/agent/route.ts): both now gate processPostSession on result.success.
   books route: not result.cancelled and result.success; series route: result.success and not result.cancelled.
   completeSession/SSE-complete publishing itself is untouched -- it already read result.success off the (previously-always-true) AgentResult in pre-existing code (session-manager.ts:93, not part of this diff).
4. use-agent-stream.ts: new guard intercepts a trailing complete SSE carrying metadata.success === false (only possible for inline sessions, since the background worker path now publishes no complete at all for failed sessions -- confirmed by point 2 above).
   The guard treats it as a session error instead of resurrecting it as completed. The guard condition is false for every normal completion, so the pre-existing success path is reached unchanged.
5. types.ts: AgentResult.endReason union gains "error", doc comment updated. Non-breaking additive change.

## Risk probes
Success-path regression: Traced and confirmed intact -- DB status completed, SSE complete publish, Redis status completed, and processPostSession invocation all still fire for a normal result.success true completion.
   Also directly covered by a new automated test in agent-worker-failed-session.test.ts: the companion case "a successful session still runs post-session, publishes complete, and sets completed", which passes at HEAD.
User-cancel path: Unchanged. The abort branch in the orchestrator's catch block is untouched by the diff -- the new code lives entirely in the non-abort (real provider error) branch below it.
Hollow-200 misfire: Examined for false positives. The check requires ALL THREE: turn === 0 (first API turn of this loop invocation), no text content, no tool_use block, AND output_tokens === 0.
   Real model responses -- including tool-call-only turns, extended-thinking/reasoning-only turns, and short title-only replies -- always bill at least one output token for whatever they produced.
   The output_tokens === 0 conjunct makes an accidental misfire on legitimate output essentially impossible under normal API semantics. Tool-call-only first turns are explicitly protected (tool_use counts as produced work).
   No plausible legitimate session shape found that would trip this.
Batch circuit breaker termination: The consecutive/total Redis counters (recordBatchFailure/isBatchBreakerError) are incremented only when processAgentJob itself throws (job-level exception) with a 401/402/403/429-shaped error.
   Provider failures inside an active session are fully absorbed by withProviderRetry's try/catch inside runToolLoop and resolved via onComplete -- processAgentJob never throws for this failure class, before or after this fix.
   This means D-36-style failures were already invisible to the breaker's increment path pre-fix, and remain so post-fix (this diff does not touch recordBatchFailure/isBatchBreakerError/the pre-orchestrator throw sites).
   The only behavior this diff changes is that the streak is no longer cleared by such a failure (previously it always was, because success was hardcoded true).
   Termination is not at risk either way: each child is one bounded BullMQ job execution that resolves without throwing (no retry cascade), so an all-provider-down batch still runs through all N children and finishes.
   It just now honestly marks each one failed instead of fraudulently completed.
   Worth flagging as a separate, pre-existing gap (the breaker's consecutive/total mechanism doesn't cover in-session provider outages, only fatal pre-flight/job-level errors) but it is NOT a regression introduced by 486bae1 and does not block this fix.
Batch ledger double-count: No double counting. The per-turn spend accumulation (normal path, after a successful finalMessage) and the new dying-turn partial-spend accumulation (catch-block path) are mutually exclusive via try/catch -- only one of the two ever executes for a given turn.
Money honesty (Z11/D-17) / tools.ts (D-13/D-30/D-33/D-34): git diff for src/lib/agents/batch-digest-aggregate.ts, src/lib/queue/batch-digest.ts, and src/lib/agents/tools.ts against the parent commit all produced EMPTY diffs -- byte-for-byte untouched by this commit.
Client hook normal flow: The new guard's condition (metadata.success === false) only triggers on the specific failure-carrying trailing complete; every other branch (cost_update, budget_warning, error, normal complete with success true, default addMessage) is reached exactly as before.

## Minor, non-blocking observations (not defects, not raised as blockers)
agent-worker.ts's "Session completed with errors" string in the complete-message ternary is now dead code (that path is only reached when result.success is already true, having been early-returned otherwise) -- harmless leftover, not a bug.
A provider failure with partial completed work (the mid-session test case) does not get a SessionBrief (gated on endReason budget/timeout, and "error" is neither), so a subsequent continuation has no structured summary of what was salvaged before the outage.
   Reasonable given D-36's scope (money/state honesty, not resumability), but worth a follow-up ticket if resumability after a provider outage becomes a priority.

## Summary
The fix is scoped exactly to what it claims: a real provider outage (or hollow zero-work response) now resolves a session honestly as failed -- no chapter advance, no fake SSE complete, Redis/DB status failed, tokens/cost/usage-record/batch-ledger accounting all still recorded.
This leaves the success path, the user-cancel path, batch money-reporting (Z11/D-17), and the tool surfaces (D-13/D-30/D-33/D-34) completely untouched.
RED->GREEN was independently reproduced (10/13 failing at parent, 624/624 passing at HEAD, tsc clean). No plausible false-positive path for the hollow-200 classifier was found.
The batch-breaker consecutive-streak observation is a pre-existing architectural gap, not a regression, and does not threaten batch termination.

SAFE
