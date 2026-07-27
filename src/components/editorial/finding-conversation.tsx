"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationInput } from "@/components/agent/conversation-input";
import { AIRewriteComparison } from "@/components/editor/ai-rewrite-comparison";
import { useFindingDiscussion } from "@/hooks/use-finding-discussion";
import { useElapsedSeconds } from "@/hooks/use-elapsed-seconds";
import { assistantBubbleText, computeConversationView } from "@/lib/editorial/finding-conversation";
import {
  DISCUSS_CANCEL_HINT,
  DISCUSS_CANCEL_LABEL,
  discussWaitPhase,
  formatWaitElapsed,
} from "@/lib/editorial/discuss-wait-phase";
import { discussTurnNotice, type DiscussTurnNotice } from "@/lib/editorial/discuss-turn-notice";

interface FindingLite {
  id: string;
  status: string;
  category: string;
  description: string;
  rationale?: string | null;
  anchorQuote?: string | null;
  alternatives?: Array<{ label?: string; originalText?: string; newText?: string }>;
}

interface FindingConversationProps {
  bookId: string;
  finding: FindingLite;
  onApply: (overrideText?: string) => void;
  onDismiss: (reason?: string) => void;
  onClose?: () => void;
  /**
   * D-183: the card owns Apply/Dismiss buttons of its own, outside this thread.
   * They settle the finding, so they must not be clickable while a turn is in
   * flight either — the thread reports its in-flight state up so the card can
   * disable them from the same source of truth.
   */
  onTurnActiveChange?: (active: boolean) => void;
}

/**
 * D5: the live (streaming) bubble and a settled assistant bubble MUST be the same
 * shape, so committing the settled turn cannot shift the thread under the
 * writer's thumb (the D-147 clamp family). One constant each, used by both.
 */
const ASSISTANT_BUBBLE_CLASS = "rounded-md p-2 text-sm whitespace-pre-wrap bg-muted/40 mr-6";
const USER_BUBBLE_CLASS = "rounded-md p-2 text-sm whitespace-pre-wrap bg-primary/10 ml-6";

export function FindingConversation({
  bookId,
  finding,
  onApply,
  onDismiss,
  onClose,
  onTurnActiveChange,
}: FindingConversationProps) {
  const {
    replies,
    canDiscuss,
    isLoading,
    send,
    streamingText,
    turnActive,
    turnStartedAt,
    cancel,
  } = useFindingDiscussion(bookId, finding.id);

  const view = useMemo(
    () => computeConversationView({ replies: replies.map((r) => ({ role: r.role, content: r.content })), findingStatus: finding.status }),
    [replies, finding.status]
  );

  const original = finding.anchorQuote ?? finding.alternatives?.[0]?.originalText ?? "";
  const opening = `I flagged: ${finding.description}${finding.rationale ? ` (${finding.rationale})` : ""}. What are you going for here?`;

  /**
   * D-176: the wait is measured client-side. The first-text gate cannot emit a
   * progress frame before the provider's first prose delta without giving up the
   * honest pre-stream 409/502, so the writer's own clock is the only truthful
   * liveness signal during the measured 19-36 s reasoning phase.
   */
  const elapsedSeconds = useElapsedSeconds(turnActive ? turnStartedAt : null);
  const waitPhase = discussWaitPhase(elapsedSeconds);
  const waitingForFirstText = turnActive && streamingText.length === 0;

  /**
   * D-176/D-178: a turn that does not land must say so. The composer now clears
   * optimistically, so a swallowed rejection would read as "my sentence vanished".
   */
  const [notice, setNotice] = useState<DiscussTurnNotice | null>(null);

  useEffect(() => {
    onTurnActiveChange?.(turnActive);
    // If the thread is collapsed/unmounted mid-turn, release the parent's guard
    // rather than leaving its Apply/Dismiss disabled forever. (The turn itself
    // keeps going server-side and shows up when the thread is reopened.)
    return () => {
      if (turnActive) onTurnActiveChange?.(false);
    };
  }, [turnActive, onTurnActiveChange]);

  const handleSend = useCallback(
    async (message: string) => {
      setNotice(null);
      try {
        await send(message);
      } catch (err) {
        setNotice(discussTurnNotice(err));
        // Rethrow so the composer restores the writer's text for a retry.
        throw err;
      }
    },
    [send]
  );

  /** D-183: nothing may settle the finding while a turn is still in flight. */
  const settleDisabled = turnActive;
  const settleDisabledTitle = "Waiting for the editor's reply — cancel the turn to decide now";

  const revisionCard =
    view.latestRevision !== undefined ? (
      // D-185: rendered under the turn that emitted it (see the thread loop), not
      // at the bottom of the thread where it lost its provenance.
      <div data-testid="discuss-revision-card">
        <AIRewriteComparison
          original={original}
          rewrite={view.latestRevision}
          rewriteLabel={finding.category}
          allowEdit
          onAccept={(newText) => onApply(newText)}
          onReject={() => onDismiss()}
        />
      </div>
    ) : null;

  return (
    // D-169: the thread is rendered INSIDE FindingCard's clickable <Card>, whose
    // onClick selects the finding and calls onShowInText → router.push(chapter
    // editor). Every button FindingCard owns stops propagation; nothing inside
    // this thread did, so "Use it" / "Keep as-is" / the close X — and the
    // revision card + message input below — each dismissed or applied AND yanked
    // the writer out of Editorial Review mid-decision. The whole thread is an
    // interactive sub-surface: no click inside it may reach the card. The named
    // controls ALSO stop propagation individually (same pattern as
    // finding-card.tsx) so the guard survives a refactor of this wrapper.
    <div className="flex flex-col gap-3 p-2" onClick={(e) => e.stopPropagation()}>
      {/* Header — category label + in-thread close affordance */}
      {onClose && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {finding.category}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close conversation"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Thread — our own plaintext render (no MessageStream); never dangerouslySetInnerHTML */}
      <div className="space-y-2">
        {replies.length === 0 && !isLoading && (
          <p className="rounded-md bg-muted/40 p-2 text-sm">{opening}</p>
        )}
        {replies.map((r, i) => (
          <div key={i} className="space-y-2">
            <p className={r.role === "user" ? USER_BUBBLE_CLASS : ASSISTANT_BUBBLE_CLASS}>
              {r.role === "assistant" ? assistantBubbleText(r.content) : r.content}
            </p>
            {/* D-185: the armed revision belongs to ONE turn — the one that
                proposed it. Anchoring it at thread bottom detached it from its
                emitting turn and misattributed it to whatever turn came last. */}
            {i === view.latestRevisionIndex && revisionCard}
          </div>
        ))}

        {/*
          D5: the turn in flight. Before, the writer watched a disabled input for
          61-157s with nothing on screen. Now prose lands as it arrives, and the
          bubble is replaced by the settled, sanitized turn the moment `done`
          commits it to the cache (same commit — no gap). What streams here is
          already prose-gated SERVER-side, so a half-written control block can
          never appear (discuss-prose-gate.ts); before the first delta we say so
          in words rather than showing an empty bubble (the D-104 rule).

          D-177: mounted on `turnActive`, NOT on react-query's `isPending` — the
          latter stays true until the post-settle invalidate resolves, which is
          what let the waiting line re-cover a finished reply for 50-189 ms.
        */}
        {turnActive && (
          <p
            data-testid="discuss-live-bubble"
            className={ASSISTANT_BUBBLE_CLASS}
            aria-live="polite"
            aria-busy="true"
          >
            {streamingText.length > 0 ? (
              <>
                {streamingText}
                <span className="ml-0.5 animate-pulse" aria-hidden="true">
                  ▍
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {waitPhase.label}
                {/*
                  D-176: the elapsed counter is what makes a 19-36s wall legible.
                  aria-hidden because a polite live region that re-announces a
                  number every second is unusable with a screen reader — the
                  phase label above carries the announcement instead.
                */}
                <span data-testid="discuss-wait-elapsed" aria-hidden="true">
                  {" "}
                  {formatWaitElapsed(elapsedSeconds)}
                </span>
              </span>
            )}
          </p>
        )}

        {/* D-176: the turn is alive and abortable. Mounted and unmounted with the
            live bubble (one commit), so the thread never jumps twice. */}
        {turnActive && (
          <div
            data-testid="discuss-turn-controls"
            className="mr-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {waitingForFirstText && (
              <span className="inline-flex items-center gap-1.5" data-testid="discuss-wait-hint">
                <span
                  className="size-1.5 rounded-full bg-muted-foreground/70 animate-pulse"
                  aria-hidden="true"
                />
                {waitPhase.hint}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              title={DISCUSS_CANCEL_HINT}
              onClick={(e) => {
                e.stopPropagation();
                cancel();
              }}
            >
              {DISCUSS_CANCEL_LABEL}
            </Button>
          </div>
        )}
      </div>

      {/* D-176/D-178: the outcome of a turn that did not land — cancelled, rate
          limited, interrupted. Never silence (the D-129 family). */}
      {notice && (
        <p
          data-testid="discuss-turn-notice"
          role="status"
          className={`text-xs ${notice.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {notice.text}
        </p>
      )}

      {/* What the agent will remember if the writer keeps their text (Task 5 persists this on dismiss) */}
      {view.latestConstraint && (
        <p className="rounded-md border border-dashed border-muted-foreground/30 px-2 py-1 text-xs italic text-muted-foreground">
          On “Keep as-is”, I’ll remember: “{view.latestConstraint.content}”
        </p>
      )}

      {/* Action bar. D-183: both settle actions read replies that a turn in
          flight is about to change (the in-flight REMEMBER above all), so they
          are disabled until it lands or is cancelled. */}
      <div className="flex flex-wrap items-center gap-2">
        {view.latestRevision !== undefined ? (
          <>
            <Button
              size="sm"
              disabled={settleDisabled}
              title={settleDisabled ? settleDisabledTitle : undefined}
              onClick={(e) => { e.stopPropagation(); onApply(view.latestRevision); }}
            >
              Use it
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={settleDisabled}
              title={settleDisabled ? settleDisabledTitle : undefined}
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            >
              Keep as-is
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={settleDisabled}
            title={settleDisabled ? settleDisabledTitle : undefined}
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          >
            Keep as-is
          </Button>
        )}
      </div>

      {/* Input or cap notice */}
      {canDiscuss ? (
        <ConversationInput
          onSend={handleSend}
          disabled={turnActive}
          placeholder="Explain your intent or why you disagree…"
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          3-exchange cap reached — decide above, or undo to revise.
        </p>
      )}
    </div>
  );
}
