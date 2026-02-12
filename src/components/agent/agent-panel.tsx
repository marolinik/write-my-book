"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BotIcon, XIcon, StopCircleIcon, Loader2Icon, KeyIcon } from "lucide-react";
import { getToolLabel, parseToolInput } from "@/lib/agents/tool-labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAgentStore } from "@/stores/agent-store";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { useApiKeys } from "@/hooks/use-api-keys";
import {
  useStartSession,
  useStartSeriesSession,
  useSendMessage,
  useApproveAction,
  useCancelSession,
} from "@/hooks/use-agent";
import { getWorkflow } from "@/lib/agents/workflows";
import { getAgentDefinition } from "@/lib/agents/definitions";
import { WorkflowSelector } from "./workflow-selector";
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

export function AgentPanel({
  bookId,
  chapters,
  onClose,
  seriesId,
}: AgentPanelProps) {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const pendingWorkflowId = useAgentStore((s) => s.pendingWorkflowId);
  const startSessionStore = useAgentStore((s) => s.startSession);
  const clearPendingWorkflow = useAgentStore((s) => s.clearPendingWorkflow);
  const reset = useAgentStore((s) => s.reset);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const sessionId = activeSession?.sessionId ?? null;
  const workflowId = activeSession?.workflowId ?? null;
  const agentType = activeSession?.agentType ?? null;
  const isRunning = activeSession?.status === "running";
  const messages = activeSession?.messages ?? [];
  const error = activeSession?.error ?? null;
  const suggestedNext = activeSession?.suggestedNext ?? [];

  const sessionCount = Object.keys(sessions).length;
  const hasAnySessions = sessionCount > 0;
  const isIdle = !hasAnySessions;

  const { data: apiKeys, isLoading: apiKeysLoading } = useApiKeys();
  const hasApiKey =
    apiKeysLoading || (Array.isArray(apiKeys) && apiKeys.length > 0);

  // Multi-session SSE manager
  useAgentStream(bookId);

  const startMutation = useStartSession(bookId);
  const startSeriesMutation = useStartSeriesSession(seriesId ?? "");
  const sendMutation = useSendMessage(bookId, sessionId);
  const approveMutation = useApproveAction(bookId, sessionId);
  const cancelMutation = useCancelSession(bookId, sessionId);

  const workflow = workflowId ? getWorkflow(workflowId) : null;
  const agentDef = agentType ? getAgentDefinition(agentType) : null;

  const [showAllWorkflows, setShowAllWorkflows] = useState(false);

  const handleWorkflowSelect = useCallback(
    async (wfId: string, chapterNumber?: number) => {
      const wf = getWorkflow(wfId);
      if (!wf) return;

      try {
        let resultSessionId: string;

        if (seriesId && wf.requiresSeriesContext) {
          const result = await startSeriesMutation.mutateAsync({
            workflowId: wfId,
            bookId,
            chapterNumber,
          });
          resultSessionId = result.sessionId;
        } else {
          const result = await startMutation.mutateAsync({
            workflowId: wfId,
            chapterNumber,
          });
          resultSessionId = result.sessionId;
        }

        startSessionStore(resultSessionId, wfId, wf.primaryAgent, bookId, seriesId);
      } catch {
        // Error handled by mutation state
      }
    },
    [bookId, seriesId, startMutation, startSeriesMutation, startSessionStore]
  );

  const handleBatchStart = useCallback(
    async (workflowIds: string[]) => {
      // Start all workflows in parallel
      const promises = workflowIds.map((wfId) =>
        handleWorkflowSelect(wfId)
      );
      await Promise.allSettled(promises);
    },
    [handleWorkflowSelect]
  );

  const handleSend = useCallback(
    (message: string) => {
      sendMutation.mutate(message);
    },
    [sendMutation]
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
    reset();
    setShowAllWorkflows(false);
  }, [reset]);

  const isComplete = activeSession && activeSession.status !== "running";
  const isConversational = workflow?.conversational ?? false;

  // Derive current step label from last tool_use message
  const currentStepLabel = useMemo(() => {
    if (!isRunning) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === "tool_use") {
        const tool = msg.metadata?.tool as string | undefined;
        if (tool) {
          const input = parseToolInput(msg);
          return getToolLabel(tool, input);
        }
      }
    }
    return null;
  }, [isRunning, messages]);

  // Auto-start a workflow when triggered from external pages
  useEffect(() => {
    if (pendingWorkflowId && isIdle && hasApiKey) {
      handleWorkflowSelect(pendingWorkflowId);
      clearPendingWorkflow();
    }
  }, [pendingWorkflowId, isIdle, hasApiKey, handleWorkflowSelect, clearPendingWorkflow]);

  return (
    <div className="flex h-full w-full min-w-[280px] flex-col border-l bg-muted/30">
      {/* Header */}
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <BotIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Writing Agent</span>

        {isRunning && (
          <Badge variant="secondary" className="ml-1 gap-1 text-xs max-w-[180px] truncate">
            <Loader2Icon className="size-3 animate-spin shrink-0" />
            {currentStepLabel ?? agentDef?.name ?? "Running"}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
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

      {/* Multi-session progress (shown when >1 session) */}
      {sessionCount > 1 && <SessionProgressList />}

      {/* Content */}
      {isIdle && !hasApiKey ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="rounded-full bg-amber-100 p-4 dark:bg-amber-900/30">
            <KeyIcon className="size-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">API Key Required</p>
            <p className="text-xs text-muted-foreground">
              Add your Anthropic API key to start using the writing agent.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/settings">Go to Settings</Link>
          </Button>
        </div>
      ) : isIdle && showAllWorkflows ? (
        <WorkflowSelector
          bookId={bookId}
          chapters={chapters}
          onSelect={handleWorkflowSelect}
          disabled={startMutation.isPending || startSeriesMutation.isPending}
          seriesId={seriesId}
        />
      ) : isIdle ? (
        <ProactiveGuide
          bookId={bookId}
          onSelectWorkflow={handleWorkflowSelect}
          onBatchStart={handleBatchStart}
          onBrowseAll={() => setShowAllWorkflows(true)}
          disabled={startMutation.isPending || startSeriesMutation.isPending}
        />
      ) : (
        <>
          <MessageStream messages={messages} isRunning={isRunning} onApprove={handleApprove} />

          {/* Error display */}
          {error && !isRunning && (
            <div className="border-t px-4 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {/* Start-over / Suggested next */}
          {isComplete && (
            <div className="flex flex-col gap-2 border-t p-3">
              {suggestedNext.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Suggested next:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {suggestedNext.map((wfId) => {
                      const wf = getWorkflow(wfId);
                      if (!wf) return null;
                      return (
                        <Button
                          key={wfId}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleWorkflowSelect(wfId)}
                        >
                          {wf.label}
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
                Start new workflow
              </Button>
            </div>
          )}

          {/* Conversation input */}
          {isConversational && (isRunning || isComplete) && (
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
