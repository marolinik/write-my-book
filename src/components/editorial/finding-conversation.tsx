"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationInput } from "@/components/agent/conversation-input";
import { AIRewriteComparison } from "@/components/editor/ai-rewrite-comparison";
import { useFindingDiscussion } from "@/hooks/use-finding-discussion";
import { assistantBubbleText, computeConversationView } from "@/lib/editorial/finding-conversation";

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
}

/**
 * D5: the live (streaming) bubble and a settled assistant bubble MUST be the same
 * shape, so committing the settled turn cannot shift the thread under the
 * writer's thumb (the D-147 clamp family). One constant each, used by both.
 */
const ASSISTANT_BUBBLE_CLASS = "rounded-md p-2 text-sm whitespace-pre-wrap bg-muted/40 mr-6";
const USER_BUBBLE_CLASS = "rounded-md p-2 text-sm whitespace-pre-wrap bg-primary/10 ml-6";

export function FindingConversation({ bookId, finding, onApply, onDismiss, onClose }: FindingConversationProps) {
  const { replies, canDiscuss, isLoading, send, isSending, streamingText } = useFindingDiscussion(bookId, finding.id);

  const view = useMemo(
    () => computeConversationView({ replies: replies.map((r) => ({ role: r.role, content: r.content })), findingStatus: finding.status }),
    [replies, finding.status]
  );

  const original = finding.anchorQuote ?? finding.alternatives?.[0]?.originalText ?? "";
  const opening = `I flagged: ${finding.description}${finding.rationale ? ` (${finding.rationale})` : ""}. What are you going for here?`;

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
          <p
            key={i}
            className={r.role === "user" ? USER_BUBBLE_CLASS : ASSISTANT_BUBBLE_CLASS}
          >
            {r.role === "assistant" ? assistantBubbleText(r.content) : r.content}
          </p>
        ))}

        {/*
          D5: the turn in flight. Before, the writer watched a disabled input for
          61-157s with nothing on screen. Now prose lands as it arrives, and the
          bubble is replaced by the settled, sanitized turn the moment `done`
          commits it to the cache (same commit — no gap). What streams here is
          already prose-gated SERVER-side, so a half-written control block can
          never appear (discuss-prose-gate.ts); before the first delta we say so
          in words rather than showing an empty bubble (the D-104 rule).
        */}
        {isSending && (
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
              <span className="text-muted-foreground">The editor is replying…</span>
            )}
          </p>
        )}
      </div>

      {/* In-place revision when the latest agent turn proposed one */}
      {view.latestRevision !== undefined && (
        <AIRewriteComparison
          original={original}
          rewrite={view.latestRevision}
          rewriteLabel={finding.category}
          allowEdit
          onAccept={(newText) => onApply(newText)}
          onReject={() => onDismiss()}
        />
      )}

      {/* What the agent will remember if the writer keeps their text (Task 5 persists this on dismiss) */}
      {view.latestConstraint && (
        <p className="rounded-md border border-dashed border-muted-foreground/30 px-2 py-1 text-xs italic text-muted-foreground">
          On “Keep as-is”, I’ll remember: “{view.latestConstraint.content}”
        </p>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {view.latestRevision !== undefined ? (
          <>
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onApply(view.latestRevision); }}>Use it</Button>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onDismiss(); }}>Keep as-is</Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onDismiss(); }}>Keep as-is</Button>
        )}
      </div>

      {/* Input or cap notice */}
      {canDiscuss ? (
        <ConversationInput
          onSend={async (m) => { await send(m); }}
          disabled={isSending}
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
