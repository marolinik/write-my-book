"use client";

import { useEffect, useRef, useState } from "react";
import {
  WrenchIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { estimateCost } from "@/lib/cost";
import type { AgentStreamMessage, AgentResult } from "@/lib/agents/types";

interface MessageStreamProps {
  messages: AgentStreamMessage[];
  onApprove?: (
    approvalId: string,
    decision: "approve" | "reject" | "modify",
    message?: string
  ) => void;
}

export function MessageStream({ messages, onApprove }: MessageStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Accumulate text blocks into contiguous prose chunks
  const renderedBlocks: React.ReactNode[] = [];
  let textAccumulator = "";
  let keyIndex = 0;

  const flushText = () => {
    if (textAccumulator) {
      renderedBlocks.push(
        <div
          key={`text-${keyIndex++}`}
          className="whitespace-pre-wrap text-sm leading-relaxed"
        >
          {textAccumulator}
        </div>
      );
      textAccumulator = "";
    }
  };

  for (const msg of messages) {
    switch (msg.type) {
      case "text":
        if (msg.metadata?.role === "user") {
          flushText();
          renderedBlocks.push(
            <div
              key={`user-${keyIndex++}`}
              className="ml-auto max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm"
            >
              {msg.content}
            </div>
          );
        } else {
          textAccumulator += msg.content;
        }
        break;

      case "tool_use":
        flushText();
        renderedBlocks.push(
          <ToolUseCard key={`tool-${keyIndex++}`} message={msg} />
        );
        break;

      case "tool_result":
        flushText();
        renderedBlocks.push(
          <ToolResultCard key={`result-${keyIndex++}`} message={msg} />
        );
        break;

      case "thinking":
        flushText();
        renderedBlocks.push(
          <div
            key={`think-${keyIndex++}`}
            className="text-xs italic text-muted-foreground/60"
          >
            {msg.content}
          </div>
        );
        break;

      case "approval_request":
        flushText();
        renderedBlocks.push(
          <ApprovalCard
            key={`approve-${keyIndex++}`}
            message={msg}
            onApprove={onApprove}
          />
        );
        break;

      case "error":
        flushText();
        renderedBlocks.push(
          <div
            key={`err-${keyIndex++}`}
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
          >
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="text-sm text-destructive">{msg.content}</span>
          </div>
        );
        break;

      case "complete":
        flushText();
        renderedBlocks.push(
          <CompletionCard
            key={`done-${keyIndex++}`}
            result={msg.metadata as unknown as AgentResult}
          />
        );
        break;
    }
  }
  flushText();

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="flex flex-col gap-3">
        {renderedBlocks}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function ToolUseCard({ message }: { message: AgentStreamMessage }) {
  const [open, setOpen] = useState(false);
  const tool = message.metadata?.tool as string | undefined;

  return (
    <button
      onClick={() => setOpen(!open)}
      className="flex w-full flex-col rounded-md border bg-muted/30 p-2 text-left text-xs"
    >
      <div className="flex items-center gap-1.5">
        <WrenchIcon className="size-3 text-muted-foreground" />
        <span className="font-medium">{tool ?? "Tool"}</span>
        {open ? (
          <ChevronDownIcon className="ml-auto size-3" />
        ) : (
          <ChevronRightIcon className="ml-auto size-3" />
        )}
      </div>
      {open && (
        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
          {message.content}
        </pre>
      )}
    </button>
  );
}

function ToolResultCard({ message }: { message: AgentStreamMessage }) {
  const [open, setOpen] = useState(false);
  const tool = message.metadata?.tool as string | undefined;

  return (
    <button
      onClick={() => setOpen(!open)}
      className="flex w-full flex-col rounded-md border bg-muted/20 p-2 text-left text-xs"
    >
      <div className="flex items-center gap-1.5">
        <CheckCircleIcon className="size-3 text-green-600" />
        <span className="text-muted-foreground">{tool ?? "Result"}</span>
        {open ? (
          <ChevronDownIcon className="ml-auto size-3" />
        ) : (
          <ChevronRightIcon className="ml-auto size-3" />
        )}
      </div>
      {open && (
        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
          {message.content}
        </pre>
      )}
    </button>
  );
}

function ApprovalCard({
  message,
  onApprove,
}: {
  message: AgentStreamMessage;
  onApprove?: (
    approvalId: string,
    decision: "approve" | "reject" | "modify",
    message?: string
  ) => void;
}) {
  const [responded, setResponded] = useState(false);
  const [modifyText, setModifyText] = useState("");
  const [showModify, setShowModify] = useState(false);

  const approvalId = message.metadata?.approvalId as string;
  const title = message.metadata?.approvalTitle as string | undefined;

  const handleDecision = (decision: "approve" | "reject" | "modify") => {
    if (!onApprove || !approvalId) return;
    onApprove(approvalId, decision, decision === "modify" ? modifyText : undefined);
    setResponded(true);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-yellow-500/30 bg-yellow-50/50 p-3 dark:bg-yellow-950/20">
      <div className="flex items-start gap-2">
        <ShieldQuestionIcon className="mt-0.5 size-4 shrink-0 text-yellow-600" />
        <div className="flex flex-col gap-1">
          {title && (
            <span className="text-sm font-medium">{title}</span>
          )}
          <span className="text-sm text-muted-foreground">
            {message.content}
          </span>
        </div>
      </div>

      {!responded && onApprove && (
        <div className="flex flex-col gap-2">
          {showModify && (
            <Textarea
              value={modifyText}
              onChange={(e) => setModifyText(e.target.value)}
              placeholder="Describe what to change..."
              className="text-sm"
              rows={2}
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => handleDecision("approve")}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (showModify && modifyText) {
                  handleDecision("modify");
                } else {
                  setShowModify(true);
                }
              }}
            >
              Modify
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDecision("reject")}
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {responded && (
        <Badge variant="outline" className="w-fit">
          Responded
        </Badge>
      )}
    </div>
  );
}

function CompletionCard({
  result,
}: {
  result: AgentResult | undefined;
}) {
  if (!result) return null;

  const cost = estimateCost(
    "sonnet", // approximate — actual model info not in result
    result.tokensInput,
    result.tokensOutput
  );

  return (
    <div className="flex flex-col gap-1 rounded-md border border-green-500/30 bg-green-50/50 p-3 dark:bg-green-950/20">
      <div className="flex items-center gap-2">
        <CheckCircleIcon className="size-4 text-green-600" />
        <span className="text-sm font-medium">
          {result.success ? "Completed" : "Failed"}
        </span>
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>{result.tokensInput.toLocaleString()} input tokens</span>
        <span>{result.tokensOutput.toLocaleString()} output tokens</span>
        <span>~${cost.toFixed(4)}</span>
      </div>
    </div>
  );
}
