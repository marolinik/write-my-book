"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  ShieldQuestionIcon,
  Loader2Icon,
  ChevronDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { estimateCost } from "@/lib/cost";
import { getToolLabel, parseToolInput } from "@/lib/agents/tool-labels";
import type { AgentStreamMessage, AgentResult } from "@/lib/agents/types";

interface MessageStreamProps {
  messages: AgentStreamMessage[];
  isRunning?: boolean;
  language?: string;
  onApprove?: (
    approvalId: string,
    decision: "approve" | "reject" | "modify",
    message?: string
  ) => void;
}

export function MessageStream({
  messages,
  isRunning,
  language,
  onApprove,
}: MessageStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Track scroll position — only auto-scroll when user is near bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isNearBottom.current = near;
    setShowScrollButton(!near && !!isRunning);
  }, [isRunning]);

  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    if (!isNearBottom.current && isRunning) {
      setShowScrollButton(true);
    }
  }, [messages.length, isRunning]);

  // Hide scroll button when not running
  useEffect(() => {
    if (!isRunning) setShowScrollButton(false);
  }, [isRunning]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollButton(false);
  }, []);

  // Defer messages during rapid streaming so React can batch renders
  const deferredMessages = useDeferredValue(messages);

  // Build block descriptors (cheap) — separate from rendering (expensive)
  type BlockDesc =
    | { kind: "text"; text: string; blockKey: number }
    | { kind: "user"; text: string; blockKey: number }
    | { kind: "tool"; msg: AgentStreamMessage; blockKey: number }
    | { kind: "thinking"; text: string; blockKey: number }
    | { kind: "approval"; msg: AgentStreamMessage; blockKey: number }
    | { kind: "error"; text: string; blockKey: number }
    | { kind: "complete"; msg: AgentStreamMessage; blockKey: number };

  const { blocks, lastExecutingToolMsg } = useMemo(() => {
    // Track which tool_use IDs have received results
    const completedTools = new Set<string>();
    for (const msg of deferredMessages) {
      if (msg.type === "tool_result" && msg.metadata?.toolUseId) {
        completedTools.add(msg.metadata.toolUseId as string);
      }
    }
    const result: BlockDesc[] = [];
    let textAccumulator = "";
    let keyIndex = 0;

    const flushText = () => {
      if (textAccumulator) {
        result.push({ kind: "text", text: textAccumulator, blockKey: keyIndex++ });
        textAccumulator = "";
      }
    };

    for (const msg of deferredMessages) {
      switch (msg.type) {
        case "text":
          if (msg.metadata?.role === "user") {
            flushText();
            result.push({ kind: "user", text: msg.content, blockKey: keyIndex++ });
          } else {
            textAccumulator += msg.content;
          }
          break;

        case "tool_use": {
          flushText();
          const toolUseId = msg.metadata?.toolUseId as string | undefined;
          const isExecuting = toolUseId ? !completedTools.has(toolUseId) : false;
          // Only show tool spinner while session is running AND tool has no result yet
          if (isExecuting && isRunning) {
            result.push({ kind: "tool", msg, blockKey: keyIndex++ });
          }
          break;
        }

        case "tool_result":
          break;

        case "thinking":
          flushText();
          result.push({ kind: "thinking", text: msg.content, blockKey: keyIndex++ });
          break;

        case "approval_request":
          flushText();
          result.push({ kind: "approval", msg, blockKey: keyIndex++ });
          break;

        case "error":
          flushText();
          result.push({ kind: "error", text: msg.content, blockKey: keyIndex++ });
          break;

        case "complete":
          flushText();
          result.push({ kind: "complete", msg, blockKey: keyIndex++ });
          break;
      }
    }
    flushText();

    // Find the last executing tool_use (for inline status)
    let lastTool: AgentStreamMessage | null = null;
    for (let i = deferredMessages.length - 1; i >= 0; i--) {
      const m = deferredMessages[i];
      if (m.type === "tool_use") {
        const tid = m.metadata?.toolUseId as string | undefined;
        if (tid && !completedTools.has(tid)) {
          lastTool = m;
        }
        break;
      }
    }

    return { blocks: result, lastExecutingToolMsg: lastTool };
  }, [deferredMessages, isRunning]);

  // Render blocks — markdown is memoized per text content
  const renderedBlocks = blocks.map((block) => {
    switch (block.kind) {
      case "text":
        return <MarkdownBlock key={`text-${block.blockKey}`} text={block.text} />;
      case "user":
        return (
          <div key={`user-${block.blockKey}`} className="ml-auto max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm">
            {block.text}
          </div>
        );
      case "tool":
        return <ToolStatus key={`tool-${block.blockKey}`} message={block.msg} language={language} />;
      case "thinking":
        return (
          <div key={`think-${block.blockKey}`} className="text-xs italic text-muted-foreground/60">
            {block.text}
          </div>
        );
      case "approval":
        return <ApprovalCard key={`approve-${block.blockKey}`} message={block.msg} onApprove={onApprove} />;
      case "error":
        return (
          <div key={`err-${block.blockKey}`} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="text-sm text-destructive">{block.text}</span>
          </div>
        );
      case "complete":
        return <CompletionCard key={`done-${block.blockKey}`} result={block.msg.metadata as unknown as AgentResult} language={language} />;
    }
  });

  // Get localized thinking text
  const thinkingText = getThinkingText(language);

  // Show a starting indicator when running but no visible content yet
  const hasVisibleContent = renderedBlocks.length > 0;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto p-4"
      >
        <div className="flex flex-col gap-3">
          {!hasVisibleContent && isRunning && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2Icon className="size-6 animate-spin text-primary mb-3" />
              <p className="text-sm font-medium">{getThinkingText(language)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {getLocalizedText(language, {
                  en: "The agent is reading your project and preparing...",
                  sr: "Agent čita vaš projekat i priprema se...",
                  de: "Der Agent liest Ihr Projekt und bereitet sich vor...",
                  es: "El agente está leyendo su proyecto y preparándose...",
                  fr: "L'agent lit votre projet et se prépare...",
                  ru: "Агент читает ваш проект и готовится...",
                  zh: "代理正在阅读您的项目并准备中...",
                })}
              </p>
            </div>
          )}
          {renderedBlocks}
          {isRunning && hasVisibleContent && (
            <ThinkingIndicator
              messages={messages}
              thinkingText={thinkingText}
              lastToolMsg={lastExecutingToolMsg}
              language={language}
            />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll-to-bottom floating button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 z-10 rounded-full bg-primary/90 p-2 shadow-lg transition-opacity hover:bg-primary"
        >
          <ChevronDownIcon className="size-4 text-primary-foreground" />
        </button>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function getThinkingText(language?: string): string {
  const map: Record<string, string> = {
    en: "Agent is thinking",
    sr: "Agent razmišlja",
    de: "Agent denkt nach",
    es: "El agente está pensando",
    fr: "L'agent réfléchit",
    ru: "Агент думает",
    zh: "代理正在思考",
  };
  if (!language) return map.en;
  return map[language] ?? map[language.split("-")[0]] ?? map.en;
}

// ─── Memoized markdown renderer ──────────────────────────────
// Performance is already handled by:
//  1. Zustand merging consecutive text deltas (few messages, not hundreds)
//  2. useDeferredValue batching React updates during rapid streaming
// This component just avoids unnecessary re-renders from parent changes.

const MarkdownBlock = memo(function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="agent-prose text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
});

// ─── Thinking indicator with elapsed time ────────────────────

function ThinkingIndicator({
  messages,
  thinkingText,
  lastToolMsg,
  language,
}: {
  messages: AgentStreamMessage[];
  thinkingText: string;
  lastToolMsg: AgentStreamMessage | null;
  language?: string;
}) {
  const [show, setShow] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setShow(false);
    setElapsed(0);
    const showTimer = setTimeout(() => setShow(true), 1000);
    const tickTimer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearTimeout(showTimer);
      clearInterval(tickTimer);
    };
  }, [messages.length]);

  if (!show) return null;

  // Show tool status if a tool is executing, otherwise show thinking text
  let statusText = thinkingText;
  if (lastToolMsg) {
    const tool = lastToolMsg.metadata?.tool as string | undefined;
    if (tool) {
      const input = parseToolInput(lastToolMsg);
      statusText = getToolLabel(tool, input, language);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2Icon className="size-3 animate-spin" />
      <span className="italic">{statusText}</span>
      {elapsed > 5 && (
        <span className="tabular-nums text-muted-foreground/60">
          {elapsed}s
        </span>
      )}
    </div>
  );
}

// ─── Inline tool status (only shown while executing) ─────────

function ToolStatus({
  message,
  language,
}: {
  message: AgentStreamMessage;
  language?: string;
}) {
  const tool = message.metadata?.tool as string | undefined;
  const toolInput = parseToolInput(message);
  const label = tool ? getToolLabel(tool, toolInput, language) : "";

  if (!label) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
      <Loader2Icon className="size-3 animate-spin text-primary" />
      <span>{label}</span>
    </div>
  );
}

// ─── Approval card with markdown and decision display ────────

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
  const [decision, setDecision] = useState<
    "approve" | "reject" | "modify" | null
  >(null);
  const [modifyText, setModifyText] = useState("");
  const [showModify, setShowModify] = useState(false);

  const approvalId = message.metadata?.approvalId as string;
  const title = message.metadata?.approvalTitle as string | undefined;

  const handleDecision = (d: "approve" | "reject" | "modify") => {
    if (!onApprove || !approvalId) return;
    onApprove(approvalId, d, d === "modify" ? modifyText : undefined);
    setDecision(d);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-yellow-500/30 bg-yellow-50/50 p-3 dark:bg-yellow-950/20">
      <div className="flex items-start gap-2">
        <ShieldQuestionIcon className="mt-0.5 size-4 shrink-0 text-yellow-600" />
        <div className="flex flex-col gap-1 min-w-0">
          {title && <span className="text-sm font-medium">{title}</span>}
          <div className="agent-prose text-sm text-muted-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {!decision && onApprove && (
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

      {decision === "approve" && (
        <Badge variant="outline" className="w-fit text-green-600 border-green-200">
          Approved
        </Badge>
      )}
      {decision === "reject" && (
        <Badge variant="outline" className="w-fit text-red-600 border-red-200">
          Rejected
        </Badge>
      )}
      {decision === "modify" && (
        <Badge variant="outline" className="w-fit text-yellow-600 border-yellow-200">
          Modified
        </Badge>
      )}
    </div>
  );
}

// ─── Completion card ────────────────────────────────────────

function CompletionCard({
  result,
  language,
}: {
  result: AgentResult | undefined;
  language?: string;
}) {
  if (!result) return null;

  const cost = estimateCost(
    "sonnet", // approximate — actual model info not in result
    result.tokensInput,
    result.tokensOutput
  );

  const completedText = getLocalizedText(language, {
    en: "Completed", sr: "Završeno", de: "Abgeschlossen",
    es: "Completado", fr: "Terminé", ru: "Завершено", zh: "已完成",
  });
  const failedText = getLocalizedText(language, {
    en: "Failed", sr: "Neuspelo", de: "Fehlgeschlagen",
    es: "Fallido", fr: "Échoué", ru: "Ошибка", zh: "失败",
  });

  return (
    <div className="flex flex-col gap-1 rounded-md border border-green-500/30 bg-green-50/50 p-3 dark:bg-green-950/20">
      <div className="flex items-center gap-2">
        <CheckCircleIcon className="size-4 text-green-600" />
        <span className="text-sm font-medium">
          {result.success ? completedText : failedText}
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

/** Tiny helper for inline localization without importing the full i18n module */
function getLocalizedText(
  language: string | undefined,
  map: Record<string, string>
): string {
  if (!language) return map.en;
  return map[language] ?? map[language.split("-")[0]] ?? map.en;
}
