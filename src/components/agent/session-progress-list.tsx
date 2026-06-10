"use client";

import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  ClockIcon,
  DollarSignIcon,
  Loader2Icon,
  CheckCircleIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAgentSessionStore, type SessionState } from "@/stores/agent-session-store";
import { getWorkflow } from "@/lib/agents/workflows";
import { getToolLabel, parseToolInput } from "@/lib/agents/tool-labels";
import { useLanguage } from "@/components/providers/language-provider";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

function ElapsedTime({ session }: { session: SessionState }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (session.status !== "running") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session.status]);

  const elapsedMs = session.status === "running"
    ? now - session.startedAt
    : Date.now() - session.startedAt; // approximation for completed
  const elapsedMin = Math.floor(elapsedMs / 60000);

  if (session.status === "completed") {
    return (
      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
        <ClockIcon className="size-2.5" />
        Completed in {elapsedMin} min
      </span>
    );
  }

  if (session.status === "running") {
    const maxMin = session.estimatedMaxMinutes;
    const effectiveMax = maxMin ? maxMin + (session.extensionsUsed * 15) : undefined;
    const isPastEstimate = effectiveMax ? elapsedMin > effectiveMax : false;
    return (
      <span className={cn(
        "text-[10px] tabular-nums flex items-center gap-0.5",
        isPastEstimate ? "text-orange-500 dark:text-orange-400" : "text-muted-foreground",
      )}>
        <ClockIcon className="size-2.5" />
        {elapsedMin} min{effectiveMax ? ` / ~${effectiveMax} min` : ""}
      </span>
    );
  }

  if (session.status === "failed") {
    return (
      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
        <ClockIcon className="size-2.5" />
        {elapsedMin} min
      </span>
    );
  }

  return null;
}

export function SessionProgressList() {
  const { language } = useLanguage();
  const agentStrings = getAgentStrings(language);
  const sessions = useAgentSessionStore((s) => s.sessions);
  const activeSessionId = useAgentSessionStore((s) => s.activeSessionId);
  const setActiveSession = useAgentSessionStore((s) => s.setActiveSession);
  const removeSession = useAgentSessionStore((s) => s.removeSession);

  const sessionList = Object.values(sessions);
  if (sessionList.length <= 1) return null;

  const runningCount = sessionList.filter(
    (s: SessionState) => s.status === "running"
  ).length;
  const completedCount = sessionList.filter(
    (s: SessionState) => s.status === "completed"
  ).length;

  return (
    <div className="border-b px-3 py-2 space-y-1.5 shrink-0">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {completedCount} of {sessionList.length} sessions complete
        </span>
        {runningCount > 0 && (
          <span className="flex items-center gap-1">
            <Loader2Icon className="size-3 animate-spin" />
            {runningCount} running
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {sessionList.map((session: SessionState) => {
          const wf = getWorkflow(session.workflowId);
          const isActive = session.sessionId === activeSessionId;
          const lastMessage = session.messages[session.messages.length - 1];
          const preview =
            lastMessage?.type === "text"
              ? lastMessage.content.slice(0, 60)
              : null;
          const canDismiss = session.status !== "running";

          return (
            <div
              key={session.sessionId}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors group",
                isActive
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-muted"
              )}
            >
              <button
                onClick={() => setActiveSession(session.sessionId)}
                className="flex items-center gap-2 min-w-0 flex-1"
              >
                {session.status === "running" && (
                  <Loader2Icon className="size-3 animate-spin text-primary shrink-0" />
                )}
                {session.status === "completed" &&
                  (session.resultMeta?.endReason === "budget" ||
                  session.resultMeta?.endReason === "timeout" ? (
                    <AlertCircleIcon className="size-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircleIcon className="size-3 text-green-600 dark:text-green-400 shrink-0" />
                  ))}
                {session.status === "failed" && (
                  <XCircleIcon className="size-3 text-destructive shrink-0" />
                )}
                {session.isBackground && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                    BG
                  </Badge>
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-medium block truncate">
                    {agentStrings.workflows[session.workflowId] ?? wf?.label ?? session.workflowId}
                  </span>
                  {session.status === "running" && (() => {
                    const toolMsgs = session.messages.filter(m => m.type === "tool_use");
                    const lastTool = toolMsgs[toolMsgs.length - 1];
                    if (!lastTool) return null;
                    const tool = lastTool.metadata?.tool as string | undefined;
                    if (!tool) return null;
                    const stepLabel = getToolLabel(tool, parseToolInput(lastTool), language);
                    return (
                      <span className="text-[10px] text-muted-foreground truncate block">
                        Step {toolMsgs.length}: {stepLabel}
                      </span>
                    );
                  })()}
                  <div className="flex items-center gap-2">
                    {preview && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {preview}
                      </span>
                    )}
                    <ElapsedTime session={session} />
                    {session.currentCost > 0 && (
                      <span className={cn(
                        "text-[10px] flex items-center gap-0.5",
                        session.currentCost > 1
                          ? "text-orange-500 dark:text-orange-400 font-medium"
                          : "text-muted-foreground",
                      )}>
                        <DollarSignIcon className="size-2.5" />
                        ${session.currentCost.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              {canDismiss && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSession(session.sessionId);
                  }}
                  className="shrink-0 size-5 flex items-center justify-center rounded hover:bg-muted-foreground/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Dismiss session"
                >
                  <XIcon className="size-3 text-muted-foreground" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
