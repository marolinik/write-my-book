"use client";

import {
  Loader2Icon,
  CheckCircleIcon,
  XCircleIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentStore, type SessionState } from "@/stores/agent-store";
import { getWorkflow } from "@/lib/agents/workflows";

export function SessionProgressList() {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);

  const sessionList = Object.values(sessions);
  if (sessionList.length <= 1) return null;

  const runningCount = sessionList.filter(
    (s: SessionState) => s.status === "running"
  ).length;
  const completedCount = sessionList.filter(
    (s: SessionState) => s.status === "completed"
  ).length;

  return (
    <div className="border-b px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {completedCount} of {sessionList.length} agents complete
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

          return (
            <button
              key={session.sessionId}
              onClick={() => setActiveSession(session.sessionId)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                isActive
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-muted"
              )}
            >
              {session.status === "running" && (
                <Loader2Icon className="size-3 animate-spin text-primary shrink-0" />
              )}
              {session.status === "completed" && (
                <CheckCircleIcon className="size-3 text-green-600 shrink-0" />
              )}
              {session.status === "failed" && (
                <XCircleIcon className="size-3 text-destructive shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <span className="font-medium block truncate">
                  {wf?.label ?? session.workflowId}
                </span>
                {preview && (
                  <span className="text-[10px] text-muted-foreground block truncate">
                    {preview}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
