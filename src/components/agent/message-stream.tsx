"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  ClockIcon,
  ShieldQuestionIcon,
  Loader2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  UsersIcon,
  XCircleIcon,
  EyeIcon,
  SettingsIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { estimateCost } from "@/lib/cost";
import { getToolLabel, parseToolInput } from "@/lib/agents/tool-labels";
import type { AgentStreamMessage, AgentResult } from "@/lib/agents/types";
import { useEditorPaneStore } from "@/stores/editor-store";

type BlockDesc =
  | { kind: "text"; text: string; blockKey: number }
  | { kind: "user"; text: string; blockKey: number }
  | { kind: "tool"; msg: AgentStreamMessage; blockKey: number }
  | { kind: "thinking"; text: string; blockKey: number }
  | { kind: "approval"; msg: AgentStreamMessage; blockKey: number }
  | { kind: "error"; text: string; metadata?: Record<string, unknown>; blockKey: number }
  | { kind: "status"; text: string; blockKey: number }
  | { kind: "budget_warning"; text: string; metadata?: Record<string, unknown>; blockKey: number }
  | { kind: "complete"; msg: AgentStreamMessage; blockKey: number }
  | {
      kind: "delegation";
      delegationId: string;
      agentName: string;
      agentType: string;
      task: string;
      done: boolean;
      success: boolean;
      progressItems: AgentStreamMessage[];
      inputTokens: number;
      outputTokens: number;
      findingsCreated: number;
      blockKey: number;
    };

interface MessageStreamProps {
  messages: AgentStreamMessage[];
  isRunning?: boolean;
  language?: string;
  onApprove?: (
    approvalId: string,
    decision: "approve" | "reject" | "modify",
    message?: string
  ) => void;
  /** Timestamp (Date.now()) when the session started */
  startedAt?: number;
  /** Estimated max duration in minutes from workflow definition */
  estimatedMaxMinutes?: number;
  /** Number of +15 min extensions used (0, 1, or 2) */
  extensionsUsed?: number;
  /** Callback to extend the session by +15 min */
  onExtend?: () => void;
  /** Session error string (for detecting timeout) */
  sessionError?: string | null;
  /** Session status */
  sessionStatus?: "running" | "completed" | "failed";
}

export function MessageStream({
  messages,
  isRunning,
  language,
  onApprove,
  startedAt,
  estimatedMaxMinutes,
  extensionsUsed = 0,
  onExtend,
  sessionError,
  sessionStatus,
}: MessageStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledAway = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Track user scroll intent — once they scroll away from bottom, stop
  // auto-scrolling until they explicitly come back or click the button
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < 80;

    if (nearBottom) {
      // User scrolled back to bottom — re-enable auto-scroll
      userScrolledAway.current = false;
      setShowScrollButton(false);
    } else if (isRunning) {
      // User scrolled up — disable auto-scroll, show button
      userScrolledAway.current = true;
      setShowScrollButton(true);
    }
  }, [isRunning]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    userScrolledAway.current = false;
    setShowScrollButton(false);
  }, []);

  // Throttle block computation during streaming — max ~5 updates/sec.
  // Without this, every SSE delta (dozens/sec) triggers a full useMemo rebuild.
  const [throttledMessages, setThrottledMessages] = useState(messages);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMessagesRef = useRef(messages);
  latestMessagesRef.current = messages;

  useEffect(() => {
    if (!isRunning) {
      // Not streaming — update immediately
      setThrottledMessages(messages);
      return;
    }
    // During streaming, throttle to 200ms intervals
    if (!throttleRef.current) {
      setThrottledMessages(messages);
      throttleRef.current = setTimeout(() => {
        throttleRef.current = null;
        setThrottledMessages(latestMessagesRef.current);
      }, 200);
    }
  }, [messages, isRunning]);

  useEffect(() => {
    return () => {
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, []);

  // Content fingerprint — derived from throttledMessages so scroll fires
  // AFTER the DOM actually updates (not before, which was the old bug).
  // Granularity of /40 chars ensures scroll keeps up during streaming.
  const lastThrottledMsg = throttledMessages[throttledMessages.length - 1];
  const rawLen = lastThrottledMsg?.content?.length ?? 0;
  const contentSignal = throttledMessages.length * 100000 + Math.floor(rawLen / 40);

  // Auto-scroll: useLayoutEffect fires synchronously after DOM mutation
  // but before browser paint — so user never sees stale scroll position.
  useLayoutEffect(() => {
    if (userScrolledAway.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [contentSignal]);

  // Reset scroll state when session stops
  useEffect(() => {
    if (!isRunning) {
      setShowScrollButton(false);
      userScrolledAway.current = false;
    }
  }, [isRunning]);

  // Build block descriptors (cheap) — separate from rendering (expensive)
  const { blocks, lastExecutingToolMsg } = useMemo(() => {
    // Track which tool_use IDs have received results
    const completedTools = new Set<string>();
    for (const msg of throttledMessages) {
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

    // Track active delegation blocks by delegationId
    const delegationBlocks = new Map<string, BlockDesc & { kind: "delegation" }>();

    for (const msg of throttledMessages) {
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
          // Hide DelegateToSpecialist tool_use from the stream — the delegation card handles it
          const toolName = msg.metadata?.tool as string | undefined;
          if (toolName === "DelegateToSpecialist") break;
          flushText();
          const toolUseId = msg.metadata?.toolUseId as string | undefined;
          const isCompleted = toolUseId ? completedTools.has(toolUseId) : true;
          result.push({ kind: "tool", msg: { ...msg, metadata: { ...msg.metadata, _completed: isCompleted } }, blockKey: keyIndex++ });
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
          result.push({ kind: "error", text: msg.content, metadata: msg.metadata, blockKey: keyIndex++ });
          break;

        case "status":
          flushText();
          result.push({ kind: "status", text: msg.content, blockKey: keyIndex++ });
          break;

        case "budget_warning":
          flushText();
          result.push({ kind: "budget_warning", text: msg.content, metadata: msg.metadata, blockKey: keyIndex++ });
          break;

        case "complete":
          flushText();
          result.push({ kind: "complete", msg, blockKey: keyIndex++ });
          break;

        case "delegation_start": {
          flushText();
          const delegationId = msg.metadata?.delegationId as string ?? `del-${keyIndex}`;
          const block: BlockDesc & { kind: "delegation" } = {
            kind: "delegation",
            delegationId,
            agentName: msg.metadata?.agentName as string ?? "Specialist",
            agentType: msg.metadata?.agentType as string ?? "",
            task: msg.metadata?.task as string ?? "",
            done: false,
            success: false,
            progressItems: [],
            inputTokens: 0,
            outputTokens: 0,
            findingsCreated: 0,
            blockKey: keyIndex++,
          };
          delegationBlocks.set(delegationId, block);
          result.push(block);
          break;
        }

        case "delegation_progress": {
          const delegationId = msg.metadata?.delegationId as string;
          const block = delegationId ? delegationBlocks.get(delegationId) : undefined;
          if (block) {
            block.progressItems.push(msg);
          }
          break;
        }

        case "delegation_complete": {
          const delegationId = msg.metadata?.delegationId as string;
          const block = delegationId ? delegationBlocks.get(delegationId) : undefined;
          if (block) {
            block.done = true;
            block.success = msg.metadata?.success as boolean ?? false;
            block.inputTokens = msg.metadata?.inputTokens as number ?? 0;
            block.outputTokens = msg.metadata?.outputTokens as number ?? 0;
            block.findingsCreated = msg.metadata?.findingsCreated as number ?? 0;
          }
          break;
        }
      }
    }
    flushText();

    // Find the last executing tool_use (for inline status)
    let lastTool: AgentStreamMessage | null = null;
    for (let i = throttledMessages.length - 1; i >= 0; i--) {
      const m = throttledMessages[i];
      if (m.type === "tool_use") {
        const tid = m.metadata?.toolUseId as string | undefined;
        if (tid && !completedTools.has(tid)) {
          lastTool = m;
        }
        break;
      }
    }

    return { blocks: result, lastExecutingToolMsg: lastTool };
  }, [throttledMessages, isRunning]);

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
        return <ErrorCard key={`err-${block.blockKey}`} text={block.text} metadata={block.metadata} />;
      case "status":
        return (
          <div key={`status-${block.blockKey}`} className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
            <RefreshCwIcon className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400 animate-spin" />
            <span className="text-xs text-amber-700 dark:text-amber-300">{block.text}</span>
          </div>
        );
      case "budget_warning":
        return <BudgetWarningBanner key={`budget-${block.blockKey}`} text={block.text} metadata={block.metadata} />;
      case "complete":
        return <CompletionCard key={`done-${block.blockKey}`} result={block.msg.metadata as unknown as AgentResult} language={language} />;
      case "delegation":
        return <DelegationCard key={`del-${block.blockKey}`} block={block} language={language} />;
    }
  });

  // Get localized thinking text
  const thinkingText = getThinkingText(language);

  // Show a starting indicator when running but no visible content yet
  const hasVisibleContent = renderedBlocks.length > 0;

  // Detect if session timed out (for inline message)
  const isTimeout = sessionStatus === "failed" && (
    sessionError?.toLowerCase().includes("timeout") ||
    sessionError?.toLowerCase().includes("timed out") ||
    false
  );

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overscroll-contain p-4 pb-16"
      >
        <div className="flex flex-col gap-3">
          {/* Timeout warning banner (sticky at top) */}
          {startedAt != null && estimatedMaxMinutes != null && (
            <TimeoutWarning
              startedAt={startedAt}
              estimatedMaxMinutes={estimatedMaxMinutes}
              extensionsUsed={extensionsUsed}
              onExtend={onExtend}
              isRunning={!!isRunning}
            />
          )}
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
          {/* Inline timeout message */}
          {isTimeout && (
            <div className="flex items-center gap-2 rounded-md border border-orange-500/30 bg-orange-50/10 dark:bg-orange-950/20 px-3 py-2 text-xs text-orange-600 dark:text-orange-400">
              <AlertTriangleIcon className="size-3.5 shrink-0" />
              Session timed out. Partial results saved.
            </div>
          )}
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

// ─── Timeout warning banner ──────────────────────────────────

function TimeoutWarning({
  startedAt,
  estimatedMaxMinutes,
  extensionsUsed,
  onExtend,
  isRunning,
}: {
  startedAt: number;
  estimatedMaxMinutes: number;
  extensionsUsed: number;
  onExtend?: () => void;
  isRunning: boolean;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const effectiveMaxMin = estimatedMaxMinutes + extensionsUsed * 15;
  const elapsedMs = now - startedAt;
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const threshold80pct = effectiveMaxMin * 0.8;
  const remainingMin = Math.max(0, effectiveMaxMin - elapsedMin);
  const isPastEstimate = elapsedMin > effectiveMaxMin;

  // Only show when past 80% threshold and still running
  if (!isRunning || elapsedMin < threshold80pct) return null;

  return (
    <div className={cn(
      "sticky top-0 z-10 flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
      isPastEstimate
        ? "border-orange-500/30 bg-orange-50/80 dark:bg-orange-950/80"
        : "border-yellow-500/30 bg-yellow-50/80 dark:bg-yellow-950/80",
    )}>
      <ClockIcon className={cn(
        "size-3.5 shrink-0",
        isPastEstimate ? "text-orange-600 dark:text-orange-400" : "text-yellow-600 dark:text-yellow-400",
      )} />
      <span className={cn(
        "flex-1 tabular-nums",
        isPastEstimate ? "text-orange-700 dark:text-orange-300" : "text-yellow-700 dark:text-yellow-300",
      )}>
        {elapsedMin} min elapsed — ~{remainingMin} min remaining
      </span>
      {extensionsUsed < 2 && onExtend && (
        <Button size="sm" variant="outline" className="h-6 text-xs shrink-0" onClick={onExtend}>
          Extend +15 min
        </Button>
      )}
    </div>
  );
}

// ─── Budget warning banner (sticky, amber) ───────────────────
// Informational only — the session continues and wraps up gracefully.

function BudgetWarningBanner({
  text,
  metadata,
}: {
  text: string;
  metadata?: Record<string, unknown>;
}) {
  const costUsd = metadata?.costUsd as number | undefined;
  const budgetUsd = metadata?.budgetUsd as number | undefined;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/80 px-3 py-2 text-xs">
      <AlertTriangleIcon className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="flex-1 text-amber-700 dark:text-amber-300">{text}</span>
      {costUsd != null && budgetUsd != null && (
        <span className="shrink-0 tabular-nums text-amber-700 dark:text-amber-300">
          ${costUsd.toFixed(2)} / ${budgetUsd.toFixed(2)}
        </span>
      )}
    </div>
  );
}

// ─── Memoized markdown renderer ──────────────────────────────
// Performance is already handled by:
//  1. Zustand merging consecutive text deltas (few messages, not hundreds)
//  2. useDeferredValue batching React updates during rapid streaming
// This component just avoids unnecessary re-renders from parent changes.

const MarkdownBlock = memo(function MarkdownBlock({ text }: { text: string }) {
  const setScrollToText = useEditorPaneStore("primary", (s) => s.setScrollToText);

  // Extract "original text" from diff-like patterns:
  // Lines starting with "- " followed by lines starting with "+ "
  const diffOriginalTexts = useMemo(() => {
    const results: string[] = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      const nextLine = lines[i + 1].trim();
      if (line.startsWith("- ") && nextLine.startsWith("+ ")) {
        const original = line.slice(2).trim();
        if (original.length > 3) results.push(original);
      }
    }
    return results;
  }, [text]);

  return (
    <div className="agent-prose text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      {diffOriginalTexts.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {diffOriginalTexts.slice(0, 3).map((original, i) => (
            <button
              key={i}
              onClick={() => setScrollToText(original)}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
            >
              <EyeIcon className="size-3" />
              Show in text
            </button>
          ))}
        </div>
      )}
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
  const isCompleted = message.metadata?._completed as boolean | undefined;
  const toolInput = parseToolInput(message);
  const label = tool ? getToolLabel(tool, toolInput, language) : "";

  if (!label) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
      {isCompleted ? (
        <CheckCircleIcon className="size-3 text-green-500" />
      ) : (
        <Loader2Icon className="size-3 animate-spin text-primary" />
      )}
      <span className={isCompleted ? "text-muted-foreground/60" : ""}>{label}</span>
    </div>
  );
}

// ─── Error card with optional Settings link ─────────────────

function ErrorCard({ text, metadata }: { text: string; metadata?: Record<string, unknown> }) {
  const isKeyError = metadata?.action === "check-key";
  const isSwitchable = metadata?.switchable === true;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        <span className="text-sm text-destructive">{text}</span>
      </div>
      {isKeyError && (
        <div className="flex gap-2 ml-6">
          <Button variant="outline" size="sm" className="text-xs gap-1" asChild>
            <Link href="/settings">
              <SettingsIcon className="size-3" />
              Go to Settings
            </Link>
          </Button>
          {isSwitchable && (
            <Button variant="outline" size="sm" className="text-xs gap-1" asChild>
              <Link href="/settings">
                Switch Provider
              </Link>
            </Button>
          )}
        </div>
      )}
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
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const approvalId = message.metadata?.approvalId as string;
  const title = message.metadata?.approvalTitle as string | undefined;
  const approvalDeadline = message.metadata?.approvalDeadline as number | undefined;

  // Countdown timer
  useEffect(() => {
    if (!approvalDeadline || decision) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((approvalDeadline - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [approvalDeadline, decision]);

  const timedOut = remainingSeconds === 0;

  const handleDecision = (d: "approve" | "reject" | "modify") => {
    if (!onApprove || !approvalId || timedOut) return;
    onApprove(approvalId, d, d === "modify" ? modifyText : undefined);
    setDecision(d);
  };

  const formatCountdown = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-yellow-500/30 bg-yellow-50/50 p-3 dark:bg-yellow-950/20">
      <div className="flex items-start gap-2">
        <ShieldQuestionIcon className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            {title && <span className="text-sm font-medium">{title}</span>}
            {!decision && remainingSeconds !== null && (
              <Badge
                variant="outline"
                className={`shrink-0 tabular-nums text-xs ${
                  timedOut
                    ? "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                    : remainingSeconds < 60
                      ? "text-red-500 dark:text-red-400 border-red-200 dark:border-red-800"
                      : "text-muted-foreground"
                }`}
              >
                {timedOut ? "Timed Out" : formatCountdown(remainingSeconds)}
              </Badge>
            )}
          </div>
          <div className="agent-prose text-sm text-muted-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {!decision && !timedOut && onApprove && (
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

      {timedOut && !decision && (
        <Badge variant="outline" className="w-fit text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">
          Timed Out
        </Badge>
      )}
      {decision === "approve" && (
        <Badge variant="outline" className="w-fit text-green-600 dark:text-green-400 border-green-200 dark:border-green-800">
          Approved
        </Badge>
      )}
      {decision === "reject" && (
        <Badge variant="outline" className="w-fit text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">
          Rejected
        </Badge>
      )}
      {decision === "modify" && (
        <Badge variant="outline" className="w-fit text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800">
          Modified
        </Badge>
      )}
    </div>
  );
}

// ─── Delegation card ────────────────────────────────────────

type DelegationBlockDesc = Extract<BlockDesc, { kind: "delegation" }>;

function DelegationCard({
  block,
  language,
}: {
  block: DelegationBlockDesc;
  language?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Count tool_use progress items for a compact summary
  const toolCalls = block.progressItems.filter(
    (m) => m.metadata?.originalType === "tool_use"
  );

  return (
    <div className="flex flex-col rounded-md border border-blue-500/30 bg-blue-50/50 p-3 dark:bg-blue-950/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-left w-full"
      >
        {block.done ? (
          block.success ? (
            <CheckCircleIcon className="size-4 shrink-0 text-green-500" />
          ) : (
            <XCircleIcon className="size-4 shrink-0 text-red-500" />
          )
        ) : (
          <Loader2Icon className="size-4 shrink-0 animate-spin text-blue-500" />
        )}
        <UsersIcon className="size-3.5 shrink-0 text-blue-500" />
        <span className="text-sm font-medium flex-1">{block.agentName}</span>
        {block.done && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {block.inputTokens.toLocaleString()} / {block.outputTokens.toLocaleString()} tokens
          </span>
        )}
        {!block.done && toolCalls.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {toolCalls.length} {toolCalls.length === 1 ? "step" : "steps"}
          </span>
        )}
        <ChevronRightIcon
          className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1 pl-6 border-l border-blue-200 dark:border-blue-800 ml-2">
          {block.task && (
            <p className="text-xs text-muted-foreground italic mb-1">{block.task}</p>
          )}
          {toolCalls.map((m, i) => {
            const toolName = m.metadata?.tool as string | undefined;
            const isToolDone = m.metadata?.originalType === "tool_use";
            const label = toolName
              ? getToolLabel(toolName, parseToolInput(m), language)
              : m.content;
            return (
              <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <CheckCircleIcon className="size-2.5 text-green-500/60" />
                <span>{label}</span>
              </div>
            );
          })}
          {block.done && block.findingsCreated > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              {block.findingsCreated} {block.findingsCreated === 1 ? "finding" : "findings"} created
            </div>
          )}
        </div>
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
        <CheckCircleIcon className="size-4 text-green-600 dark:text-green-400" />
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
