"use client";

import {
  Loader2Icon,
  CheckCircleIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentSessionStore, type SessionState } from "@/stores/agent-session-store";
import { getWorkflow } from "@/lib/agents/workflows";
import { useLanguage } from "@/components/providers/language-provider";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

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
                {session.status === "completed" && (
                  <CheckCircleIcon className="size-3 text-green-600 dark:text-green-400 shrink-0" />
                )}
                {session.status === "failed" && (
                  <XCircleIcon className="size-3 text-destructive shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-medium block truncate">
                    {agentStrings.workflows[session.workflowId] ?? wf?.label ?? session.workflowId}
                  </span>
                  {preview && (
                    <span className="text-[10px] text-muted-foreground block truncate">
                      {preview}
                    </span>
                  )}
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
