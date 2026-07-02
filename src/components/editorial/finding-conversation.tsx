"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ConversationInput } from "@/components/agent/conversation-input";
import { AIRewriteComparison } from "@/components/editor/ai-rewrite-comparison";
import { useFindingDiscussion } from "@/hooks/use-finding-discussion";
import { computeConversationView } from "@/lib/editorial/finding-conversation";

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

export function FindingConversation({ bookId, finding, onApply, onDismiss }: FindingConversationProps) {
  const { replies, canDiscuss, isLoading, send, isSending } = useFindingDiscussion(bookId, finding.id);

  const view = useMemo(
    () => computeConversationView({ replies: replies.map((r) => ({ role: r.role, content: r.content })), findingStatus: finding.status }),
    [replies, finding.status]
  );

  const original = finding.anchorQuote ?? finding.alternatives?.[0]?.originalText ?? "";
  const opening = `I flagged: ${finding.description}${finding.rationale ? ` (${finding.rationale})` : ""}. What are you going for here?`;

  return (
    <div className="flex flex-col gap-3 p-2">
      {/* Thread — our own plaintext render (no MessageStream); never dangerouslySetInnerHTML */}
      <div className="space-y-2">
        {replies.length === 0 && !isLoading && (
          <p className="rounded-md bg-muted/40 p-2 text-sm">{opening}</p>
        )}
        {replies.map((r, i) => (
          <p
            key={i}
            className={
              "rounded-md p-2 text-sm whitespace-pre-wrap " +
              (r.role === "user" ? "bg-primary/10 ml-6" : "bg-muted/40 mr-6")
            }
          >
            {r.role === "assistant" ? r.assistantMessage ?? r.content : r.content}
          </p>
        ))}
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

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {view.latestRevision !== undefined ? (
          <>
            <Button size="sm" onClick={() => onApply(view.latestRevision)}>Use it</Button>
            <Button variant="outline" size="sm" onClick={() => onDismiss()}>Keep as-is</Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onDismiss()}>Keep as-is</Button>
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
