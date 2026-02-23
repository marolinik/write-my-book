"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  BotIcon,
  XIcon,
  StopCircleIcon,
  Loader2Icon,
  KeyIcon,
  ClockIcon,
  CoinsIcon,
  HashIcon,
  AlertCircleIcon,
  HistoryIcon,
  PanelRightIcon,
  Maximize2Icon,
  CheckCircle2Icon,
  FileSearchIcon,
  TrendingUpIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getToolLabel, parseToolInput } from "@/lib/agents/tool-labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAgentSessionStore } from "@/stores/agent-session-store";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { useApiKeys } from "@/hooks/use-api-keys";
import { useBook } from "@/hooks/use-books";
import { useBookState } from "@/hooks/use-book-state";
import {
  useStartSession,
  useStartSeriesSession,
  useSendMessage,
  useApproveAction,
  useCancelSession,
} from "@/hooks/use-agent";
import { getWorkflow } from "@/lib/agents/workflows";
import { getAgentDefinition } from "@/lib/agents/definitions";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { getStatusLabel } from "@/lib/i18n/ui-strings";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { WorkflowSelector } from "./workflow-selector";
import { WorkflowQueue } from "./workflow-queue";
import { ProactiveGuide } from "./proactive-guide";
import { SessionProgressList } from "./session-progress-list";
import { MessageStream } from "./message-stream";
import { ConversationInput } from "./conversation-input";

interface AgentPanelProps {
  bookId: string;
  chapters: Array<{ chapterNumber: number; title: string | null }>;
  onClose: () => void;
  seriesId?: string;
}

// Workflow time estimates (minutes)
const WORKFLOW_TIME_ESTIMATES: Record<string, number> = {
  "capture-style": 3,
  "create-story-bible": 5,
  "build-architecture": 5,
  "read-manuscript": 2,
  "new-novel": 3,
  "discuss-chapter": 2,
  "plan-chapter": 3,
  "write-chapter": 8,
  "freewrite": 3,
  "dev-edit": 5,
  "line-edit": 4,
  "beta-read": 4,
  "revise": 6,
  "discuss-edits": 2,
  "publishing-check": 3,
  "analyze": 3,
  "market-analysis": 3,
  "refresh-style": 3,
  "evolve-style": 3,
  "coach": 2,
};

function getWorkflowLabel(workflowId: string | null): string {
  if (!workflowId) return "Agent session";
  const wf = getWorkflow(workflowId);
  return wf?.label ?? workflowId;
}

export function AgentPanel({
  bookId,
  chapters,
  onClose,
  seriesId,
}: AgentPanelProps) {
  const sessions = useAgentSessionStore((s) => s.sessions);
  const activeSessionId = useAgentSessionStore((s) => s.activeSessionId);
  const pendingWorkflowId = useAgentUIStore((s) => s.pendingWorkflowId);
  const pendingMessage = useAgentUIStore((s) => s.pendingMessage);
  const clearPendingMessage = useAgentUIStore((s) => s.clearPendingMessage);
  const startSessionStore = useAgentSessionStore((s) => s.startSession);
  const clearPendingWorkflow = useAgentUIStore((s) => s.clearPendingWorkflow);
  const resetSession = useAgentSessionStore((s) => s.reset);
  const resetUI = useAgentUIStore((s) => s.reset);
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);

  const popQueue = useAgentSessionStore((s) => s.popQueue);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const sessionId = activeSession?.sessionId ?? null;
  const workflowId = activeSession?.workflowId ?? null;
  const agentType = activeSession?.agentType ?? null;
  const isRunning = activeSession?.status === "running";
  const messages = activeSession?.messages ?? [];
  const error = activeSession?.error ?? null;
  const suggestedNext = activeSession?.suggestedNext ?? [];
  const resultMeta = activeSession?.resultMeta;

  const sessionCount = Object.keys(sessions).length;
  const hasAnySessions = sessionCount > 0;
  const isIdle = !hasAnySessions;

  const { data: apiKeys, isLoading: apiKeysLoading } = useApiKeys();
  const hasApiKey =
    apiKeysLoading || (Array.isArray(apiKeys) && apiKeys.length > 0);

  const router = useRouter();
  const { t: uiT } = useLanguage();
  const { data: book } = useBook(bookId);
  const bookLanguage = book?.language ?? "en";
  const strings = getAgentStrings(bookLanguage);
  const bookState = useBookState(bookId);

  // Derive sets for WorkflowSelector props
  const existingDocTypesSet = useMemo(
    () => new Set(bookState.existingDocTypes),
    [bookState.existingDocTypes]
  );
  const completedWorkflowsSet = useMemo(() => {
    const set = new Set<string>();
    if (bookState.hasFingerprint) set.add("capture-style");
    if (bookState.hasStoryBible) set.add("create-story-bible");
    if (bookState.hasArchitecture) set.add("build-architecture");
    if (bookState.hasAnalysisReport) set.add("analyze");
    if (bookState.hasContinuityReport) set.add("check-series-continuity");
    if (bookState.hasMarketReport) set.add("market-analysis");
    if (bookState.hasImportedManuscript) set.add("read-manuscript");
    return set;
  }, [bookState]);
  const hasChapterContent = (bookState.chapterCount ?? 0) > 0;

  const [showAllWorkflows, setShowAllWorkflows] = useState(false);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);

  // Guard against concurrent session starts (prevents double-fire)
  const isStartingRef = useRef(false);

  // Multi-session SSE manager
  useAgentStream(bookId);

  const startMutation = useStartSession(bookId);
  const startSeriesMutation = useStartSeriesSession(seriesId ?? "");
  const sendMutation = useSendMessage(bookId, sessionId);
  const approveMutation = useApproveAction(bookId, sessionId);
  const cancelMutation = useCancelSession(bookId, sessionId);

  const workflow = workflowId ? getWorkflow(workflowId) : null;
  const agentDef = agentType ? getAgentDefinition(agentType) : null;

  // Session history (past completed sessions)
  const { data: pastSessions } = useQuery({
    queryKey: ["agent-sessions", bookId, "recent"],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/agent?limit=10`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!bookId && showSessionHistory,
  });

  const handleWorkflowSelect = useCallback(
    async (wfId: string, chapterNumber?: number, initialMessage?: string) => {
      // Prevent concurrent session starts (double-click, effect re-fire, etc.)
      if (isStartingRef.current) return;
      const wf = getWorkflow(wfId);
      if (!wf) return;

      isStartingRef.current = true;
      try {
        let resultSessionId: string;

        if (seriesId && wf.requiresSeriesContext) {
          const result = await startSeriesMutation.mutateAsync({
            workflowId: wfId,
            bookId,
            chapterNumber,
            message: initialMessage,
          });
          resultSessionId = result.sessionId;
        } else {
          const result = await startMutation.mutateAsync({
            workflowId: wfId,
            chapterNumber,
            message: initialMessage,
          });
          resultSessionId = result.sessionId;
        }

        startSessionStore(resultSessionId, wfId, wf.primaryAgent, bookId, seriesId);
      } catch {
        // Error handled by mutation state
      } finally {
        isStartingRef.current = false;
      }
    },
    [bookId, seriesId, startMutation, startSeriesMutation, startSessionStore]
  );

  const handleBatchStart = useCallback(
    async (workflowIds: string[]) => {
      const promises = workflowIds.map((wfId) =>
        handleWorkflowSelect(wfId)
      );
      await Promise.allSettled(promises);
    },
    [handleWorkflowSelect]
  );

  const setSessionRunning = useAgentSessionStore((s) => s.setSessionRunning);

  const handleSend = useCallback(
    async (message: string) => {
      if (!sessionId) return;
      try {
        await sendMutation.mutateAsync(message);
        setSessionRunning(sessionId);
      } catch {
        // Error handled by mutation state
      }
    },
    [sendMutation, sessionId, setSessionRunning]
  );

  const handleApprove = useCallback(
    (
      approvalId: string,
      decision: "approve" | "reject" | "modify",
      message?: string
    ) => {
      approveMutation.mutate({ approvalId, decision, message });
    },
    [approveMutation]
  );

  const handleCancel = useCallback(() => {
    cancelMutation.mutate();
  }, [cancelMutation]);

  const handleNewWorkflow = useCallback(() => {
    resetSession();
    resetUI();
    setShowAllWorkflows(false);
    setShowSessionHistory(false);
    setSelectedJourneyId(null);
  }, [resetSession, resetUI]);

  const handleStartQueue = useCallback(() => {
    const next = popQueue();
    if (next) {
      handleWorkflowSelect(next.workflowId, next.chapterNumber);
    }
  }, [popQueue, handleWorkflowSelect]);

  const handleSelectJourney = useCallback((journeyId: string) => {
    setSelectedJourneyId(journeyId);
    setShowAllWorkflows(true);
  }, []);

  const isComplete = activeSession && activeSession.status !== "running";

  // Post-session navigation CTAs based on completed workflow
  const postSessionCTAs = useMemo(() => {
    if (!isComplete || !workflowId) return [];
    const ctas: Array<{ label: string; href: string }> = [];
    if (["dev-edit", "line-edit", "beta-read"].includes(workflowId)) {
      ctas.push({ label: "Review Findings", href: `/books/${bookId}/editorial` });
    }
    if (workflowId === "write-chapter" || workflowId === "revise") {
      // Find next chapter to work on
      const nextCh = chapters.find((c) => {
        const wf = getWorkflow(workflowId);
        return wf?.requiresChapter;
      });
      if (nextCh) {
        ctas.push({ label: `Open Chapter ${nextCh.chapterNumber}`, href: `/books/${bookId}/chapters/${nextCh.chapterNumber}` });
      }
    }
    if (["capture-style", "create-story-bible", "build-architecture"].includes(workflowId)) {
      ctas.push({ label: "Continue Setup", href: `/books/${bookId}/setup` });
    }
    if (workflowId === "read-manuscript") {
      ctas.push({ label: "View Documents", href: `/books/${bookId}/documents` });
    }
    if (["market-analysis", "publishing-check", "analyze"].includes(workflowId)) {
      ctas.push({ label: "View Reports", href: `/books/${bookId}/reports` });
    }
    return ctas;
  }, [isComplete, workflowId, bookId, chapters]);
  // Derive current step label from last tool_use message
  const currentStepLabel = useMemo(() => {
    if (!isRunning) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === "tool_use") {
        const tool = msg.metadata?.tool as string | undefined;
        if (tool) {
          const input = parseToolInput(msg);
          return getToolLabel(tool, input, bookLanguage);
        }
      }
    }
    return null;
  }, [isRunning, messages, bookLanguage]);

  // Count tool_use turns for the turn counter
  const turnCount = useMemo(() => {
    return messages.filter((m) => m.type === "tool_use").length;
  }, [messages]);

  // Running cost estimate
  const sessionTokens = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const msg of messages) {
      if (msg.metadata?.tokensInput) input += msg.metadata.tokensInput as number;
      if (msg.metadata?.tokensOutput) output += msg.metadata.tokensOutput as number;
    }
    return { input, output, total: input + output };
  }, [messages]);

  // Auto-start a workflow when triggered from external pages
  const noRunning = !Object.values(sessions).some(
    (s) => s.status === "running"
  );
  // Use a ref to avoid re-triggering effects when handleWorkflowSelect reference changes
  const handleWorkflowSelectRef = useRef(handleWorkflowSelect);
  handleWorkflowSelectRef.current = handleWorkflowSelect;

  useEffect(() => {
    if (pendingWorkflowId && noRunning && hasApiKey) {
      handleWorkflowSelectRef.current(pendingWorkflowId);
      clearPendingWorkflow();
    } else if (pendingWorkflowId && noRunning && !hasApiKey) {
      toast.error("API key required", {
        description: "Add your API key in Settings to use AI agents.",
      });
    }
  }, [pendingWorkflowId, noRunning, hasApiKey, clearPendingWorkflow]);

  // Auto-start a coach session when triggered via openWithMessage (floating input, context menu, onboarding)
  useEffect(() => {
    if (pendingMessage && noRunning && hasApiKey) {
      handleWorkflowSelectRef.current("coach", undefined, pendingMessage.message);
      clearPendingMessage();
    }
  }, [pendingMessage, noRunning, hasApiKey, clearPendingMessage]);

  // Toast on session completion + auto-chain queue
  const prevStatusRef = useRef<Record<string, string>>({});
  const queueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let justCompleted = false;
    for (const [sid, session] of Object.entries(sessions)) {
      const prev = prevStatusRef.current[sid];
      if (prev === "running" && session.status === "completed") {
        const label = getWorkflowLabel(session.workflowId);
        toast.success(`${label} completed`, {
          description: "View results in the agent panel",
        });
        justCompleted = true;
      }
      prevStatusRef.current[sid] = session.status;
    }

    // Auto-chain: if a session just completed and queue has items and nothing else is running
    if (justCompleted) {
      const storeState = useAgentSessionStore.getState();
      const anyRunning = Object.values(storeState.sessions).some(
        (s) => s.status === "running"
      );
      if (!anyRunning && storeState.workflowQueue.length > 0) {
        // Clear any previous timer
        if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
        queueTimerRef.current = setTimeout(() => {
          const next = useAgentSessionStore.getState().popQueue();
          if (next) {
            toast.info("Starting next workflow from queue...");
            handleWorkflowSelectRef.current(next.workflowId, next.chapterNumber);
          }
          queueTimerRef.current = null;
        }, 2000);
      }
    }

    return () => {
      if (queueTimerRef.current) {
        clearTimeout(queueTimerRef.current);
        queueTimerRef.current = null;
      }
    };
  }, [sessions]);

  return (
    <div className="flex h-full w-full min-w-[280px] flex-col border-l bg-muted/30 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <BotIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{strings.writingAgent}</span>

        {isRunning && (
          <Badge variant="secondary" className="ml-1 gap-1 text-xs max-w-[180px] truncate">
            <Loader2Icon className="size-3 animate-spin shrink-0" />
            {currentStepLabel ?? agentDef?.name ?? strings.running}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Session history toggle */}
          {!isRunning && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setShowSessionHistory((v) => !v)}
              title="Session history"
            >
              <HistoryIcon className="size-4" />
            </Button>
          )}
          {isRunning && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleCancel}
              title="Stop agent"
            >
              <StopCircleIcon className="size-4 text-destructive" />
            </Button>
          )}
          {/* Dock / Undock toggle */}
          {panelMode === "overlay" && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setPanelMode("panel")}
              title="Dock to sidebar"
            >
              <PanelRightIcon className="size-4" />
            </Button>
          )}
          {panelMode === "panel" && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setPanelMode("overlay")}
              title="Float as overlay"
            >
              <Maximize2Icon className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>

      {/* Running session stats bar */}
      {isRunning && (
        <div className="flex items-center gap-3 border-b px-4 py-1.5 text-[11px] text-muted-foreground bg-muted/20">
          <span className="flex items-center gap-1">
            <HashIcon className="size-3" />
            Turn {turnCount}/50
          </span>
          {sessionTokens.total > 0 && (
            <span className="flex items-center gap-1">
              <CoinsIcon className="size-3" />
              {(sessionTokens.total / 1000).toFixed(0)}k tok
            </span>
          )}
          {workflow && WORKFLOW_TIME_ESTIMATES[workflow.id] && (
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3" />
              ~{WORKFLOW_TIME_ESTIMATES[workflow.id]}min
            </span>
          )}
        </div>
      )}

      {/* Multi-session progress (shown when >1 session) */}
      {sessionCount > 1 && <SessionProgressList />}

      {/* Workflow queue */}
      <WorkflowQueue
        onStartQueue={handleStartQueue}
        disabled={startMutation.isPending || startSeriesMutation.isPending || isRunning}
      />

      {/* Content */}
      {showSessionHistory ? (
        <div className="flex-1 overflow-auto p-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Session History</h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowSessionHistory(false)}
            >
              Back
            </Button>
          </div>
          {Array.isArray(pastSessions) && pastSessions.length > 0 ? (
            pastSessions.map((s: {
              id: string;
              workflowId: string | null;
              tokensInput: number;
              tokensOutput: number;
              completedAt: string | null;
              startedAt: string | null;
            }) => (
              <div
                key={s.id}
                className="rounded-md border p-2.5 text-sm space-y-1"
              >
                <div className="flex items-center gap-2">
                  <BotIcon className="size-3.5 text-muted-foreground" />
                  <span className="font-medium text-xs">
                    {getWorkflowLabel(s.workflowId)}
                  </span>
                </div>
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  <span>
                    {((s.tokensInput + s.tokensOutput) / 1000).toFixed(0)}k tok
                  </span>
                  {s.completedAt && s.startedAt && (
                    <span>
                      {Math.round(
                        (new Date(s.completedAt).getTime() -
                          new Date(s.startedAt).getTime()) /
                          60000
                      )}min
                    </span>
                  )}
                  {s.completedAt && (
                    <span>{new Date(s.completedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No past sessions</p>
          )}
        </div>
      ) : isIdle && !hasApiKey ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="rounded-full bg-amber-100 p-4 dark:bg-amber-900/30">
            <KeyIcon className="size-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{uiT.agentPanel.apiKeyRequired}</p>
            <p className="text-xs text-muted-foreground">
              {uiT.agentPanel.apiKeyDescription}
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/settings">{uiT.agentPanel.goToSettings}</Link>
          </Button>
        </div>
      ) : isIdle && showAllWorkflows ? (
        <WorkflowSelector
          bookId={bookId}
          chapters={chapters}
          onSelect={handleWorkflowSelect}
          disabled={startMutation.isPending || startSeriesMutation.isPending}
          seriesId={seriesId}
          existingDocTypes={existingDocTypesSet}
          hasChapterContent={hasChapterContent}
          completedWorkflows={completedWorkflowsSet}
          defaultTab={selectedJourneyId ? "journeys" : "workflows"}
        />
      ) : isIdle ? (
        <>
          {/* Pending findings alert */}
          {bookState.pendingFindingsCount > 0 && (
            <div className="mx-3 mt-3 rounded-md border border-amber-200/50 bg-amber-50/50 dark:bg-amber-950/20 p-2.5 flex items-center gap-2">
              <AlertCircleIcon className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">
                  {bookState.pendingFindingsCount} findings need review
                </p>
              </div>
              <Button variant="outline" size="sm" className="text-xs shrink-0" asChild>
                <Link href={`/books/${bookId}/editorial`}>Review</Link>
              </Button>
            </div>
          )}
          <ProactiveGuide
            bookId={bookId}
            onSelectWorkflow={handleWorkflowSelect}
            onBatchStart={handleBatchStart}
            onBrowseAll={() => setShowAllWorkflows(true)}
            onSelectJourney={handleSelectJourney}
            disabled={startMutation.isPending || startSeriesMutation.isPending}
          />
        </>
      ) : (
        <>
          <MessageStream messages={messages} isRunning={isRunning} language={bookLanguage} onApprove={handleApprove} />

          {/* Error display */}
          {error && !isRunning && (
            <div className="border-t px-4 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {/* Session results summary + suggested next + navigation CTAs */}
          {isComplete && (
            <div className="flex flex-col gap-2 border-t p-3">
              {/* Session Complete summary card */}
              {resultMeta && (resultMeta.findingsCreated > 0 || resultMeta.statusAdvanced || resultMeta.betaGateResult) && (
                <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <CheckCircle2Icon className="size-3.5 text-green-600 dark:text-green-400" />
                    {strings.sessionComplete ?? "Session Complete"}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {resultMeta.findingsCreated > 0 && (
                      <span className="flex items-center gap-1">
                        <FileSearchIcon className="size-3" />
                        {resultMeta.findingsCreated} {strings.findingsCreated ?? "findings"}
                      </span>
                    )}
                    {resultMeta.statusAdvanced && resultMeta.newStatus && (
                      <span className="flex items-center gap-1">
                        <TrendingUpIcon className="size-3" />
                        {strings.statusAdvanced ?? "Status"}: {getStatusLabel(resultMeta.newStatus, bookLanguage)}
                      </span>
                    )}
                    {resultMeta.betaGateResult && (
                      <span className={cn(
                        "flex items-center gap-1",
                        resultMeta.betaGateResult === "passed" && "text-green-600 dark:text-green-400",
                        resultMeta.betaGateResult === "failed" && "text-red-600 dark:text-red-400",
                        resultMeta.betaGateResult === "near_miss" && "text-amber-600 dark:text-amber-400"
                      )}>
                        <ShieldCheckIcon className="size-3" />
                        {resultMeta.betaGateResult === "passed" && (strings.betaPassed ?? "Passed")}
                        {resultMeta.betaGateResult === "near_miss" && (strings.betaNearMiss ?? "Near Miss")}
                        {resultMeta.betaGateResult === "failed" && (strings.betaFailed ?? "Needs Revision")}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Post-session navigation CTAs */}
              {postSessionCTAs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {postSessionCTAs.map((cta) => (
                    <Button
                      key={cta.href}
                      variant="default"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => {
                        router.push(cta.href);
                        setPanelMode("bubble");
                      }}
                    >
                      {cta.label}
                      <ArrowRightIcon className="size-3" />
                    </Button>
                  ))}
                </div>
              )}

              {/* Suggested next workflows with one-click start */}
              {suggestedNext.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    {strings.recommendedNext ?? strings.suggestedNext}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {suggestedNext.map((wfId) => {
                      const wf = getWorkflow(wfId);
                      if (!wf) return null;
                      const localizedLabel = strings.workflows[wfId] ?? wf.label;
                      return (
                        <Button
                          key={wfId}
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1"
                          disabled={startMutation.isPending || startSeriesMutation.isPending}
                          onClick={() => handleWorkflowSelect(wfId)}
                        >
                          {localizedLabel}
                          <ArrowRightIcon className="size-3" />
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewWorkflow}
                className="text-xs"
              >
                {strings.startNewWorkflow}
              </Button>
            </div>
          )}

          {/* Conversation input — always available when session is active */}
          {(isRunning || isComplete) && (
            <ConversationInput
              onSend={handleSend}
              disabled={sendMutation.isPending}
            />
          )}
        </>
      )}

      {/* Mutation error fallback */}
      {(startMutation.isError || startSeriesMutation.isError) && (
        <div className="border-t px-4 py-2">
          <p className="text-xs text-destructive">
            {startMutation.error?.message ??
              startSeriesMutation.error?.message}
          </p>
        </div>
      )}
    </div>
  );
}
