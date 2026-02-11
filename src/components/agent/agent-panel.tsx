"use client";

import { useCallback } from "react";
import { BotIcon, XIcon, StopCircleIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAgentStore } from "@/stores/agent-store";
import { useAgentStream } from "@/hooks/use-agent-stream";
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
  const {
    sessionId,
    workflowId,
    agentType,
    isRunning,
    messages,
    error,
    suggestedNext,
    startSession,
    reset,
  } = useAgentStore();

  const { isConnected } = useAgentStream(bookId, sessionId);
  const startMutation = useStartSession(bookId);
  const startSeriesMutation = useStartSeriesSession(seriesId ?? "");
  const sendMutation = useSendMessage(bookId, sessionId);
  const approveMutation = useApproveAction(bookId, sessionId);
  const cancelMutation = useCancelSession(bookId, sessionId);

  const workflow = workflowId ? getWorkflow(workflowId) : null;
  const agentDef = agentType ? getAgentDefinition(agentType) : null;

  const handleWorkflowSelect = useCallback(
    async (wfId: string, chapterNumber?: number) => {
      const wf = getWorkflow(wfId);
      if (!wf) return;

      try {
        let resultSessionId: string;

        if (seriesId && wf.requiresSeriesContext) {
          // Series workflow — use series agent endpoint
          const result = await startSeriesMutation.mutateAsync({
            workflowId: wfId,
            bookId,
            chapterNumber,
          });
          resultSessionId = result.sessionId;
        } else {
          // Regular workflow
          const result = await startMutation.mutateAsync({
            workflowId: wfId,
            chapterNumber,
          });
          resultSessionId = result.sessionId;
        }

        startSession(resultSessionId, wfId, wf.primaryAgent, bookId, seriesId);
      } catch {
        // Error handled by mutation state
      }
    },
    [bookId, seriesId, startMutation, startSeriesMutation, startSession]
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
  }, [reset]);

  const isIdle = !sessionId;
  const isComplete = sessionId && !isRunning;
  const isConversational = workflow?.conversational ?? false;

  return (
    <div className="flex h-full w-80 flex-col border-l bg-muted/30">
      {/* Header */}
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <BotIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Writing Agent</span>

        {isRunning && (
          <Badge variant="secondary" className="ml-1 gap-1 text-xs">
            <Loader2Icon className="size-3 animate-spin" />
            {agentDef?.name ?? "Running"}
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

      {/* Content */}
      {isIdle ? (
        <WorkflowSelector
          bookId={bookId}
          chapters={chapters}
          onSelect={handleWorkflowSelect}
          disabled={startMutation.isPending || startSeriesMutation.isPending}
          seriesId={seriesId}
        />
      ) : (
        <>
          <MessageStream messages={messages} onApprove={handleApprove} />

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
