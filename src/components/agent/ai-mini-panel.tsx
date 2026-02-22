"use client";

import { useEffect, useRef } from "react";
import {
  BotIcon,
  XIcon,
  MaximizeIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAgentSessionStore } from "@/stores/agent-session-store";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { getWorkflow } from "@/lib/agents/workflows";

/**
 * Floating mini-panel (~400x500px) that shows:
 * - Last message preview
 * - Quick-action buttons (start workflow, ask question)
 * - "Expand" button → full panel
 */
export function AIMiniPanel() {
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);
  const sessions = useAgentSessionStore((s) => s.sessions);
  const activeSessionId = useAgentSessionStore((s) => s.activeSessionId);
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const hasAnySessions = Object.keys(sessions).length > 0;
  const isRunning = activeSession?.status === "running";
  const runningSessions = Object.values(sessions).filter((s) => s.status === "running");

  // Get last assistant message for preview
  const lastMessage = (() => {
    if (!activeSession) return null;
    const msgs = activeSession.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].type === "text" && msgs[i].metadata?.role !== "user") {
        return msgs[i].content;
      }
    }
    return null;
  })();

  // Make panel draggable by its header
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const x = e.clientX - dragRef.current.offsetX;
      const y = e.clientY - dragRef.current.offsetY;
      // Clamp within viewport
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
      panel.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    };

    const handleMouseUp = () => {
      dragRef.current.dragging = false;
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    // Don't start drag on buttons
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    document.body.style.userSelect = "none";
  };

  if (panelMode !== "mini") return null;

  const quickActions = [
    { id: "freewrite", label: "Freewrite" },
    { id: "coach", label: "Ask Coach" },
  ];

  return (
    <div
      ref={panelRef}
      className="fixed bottom-5 right-5 z-50 w-[380px] rounded-xl border bg-background shadow-2xl flex flex-col overflow-hidden"
      style={{ maxHeight: "500px" }}
    >
      {/* Draggable header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleHeaderMouseDown}
      >
        <BotIcon className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">Writing Agent</span>

        {runningSessions.length > 0 && (
          <Badge variant="secondary" className="ml-1 gap-1 text-[10px]">
            <Loader2Icon className="size-2.5 animate-spin" />
            {runningSessions.length} running
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => setPanelMode("overlay")}
            title="Expand to full panel"
          >
            <MaximizeIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => setPanelMode("bubble")}
            title="Minimize"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[120px]">
        {/* Last message preview */}
        {lastMessage ? (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Last response
            </p>
            <div className="rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed line-clamp-6">
              {lastMessage}
            </div>
            {isRunning && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" />
                Working...
              </div>
            )}
          </div>
        ) : hasAnySessions ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            Agent is working...
          </div>
        ) : (
          <div className="text-center py-4 space-y-2">
            <div className="rounded-full bg-muted p-3 mx-auto w-fit">
              <SparklesIcon className="size-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              Your AI writing companion. Click a quick action or expand for the full experience.
            </p>
          </div>
        )}

        {/* Quick actions */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            Quick actions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => openWithWorkflow(action.id)}
              >
                {action.label}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => setPanelMode("overlay")}
            >
              All workflows...
            </Button>
          </div>
        </div>

        {/* Session summary when sessions exist */}
        {hasAnySessions && !isRunning && activeSession?.status === "completed" && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Completed
            </p>
            <div className="rounded-md border p-2 text-xs">
              <span className="font-medium">
                {getWorkflow(activeSession.workflowId)?.label ?? activeSession.workflowId}
              </span>
              {activeSession.suggestedNext.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {activeSession.suggestedNext.slice(0, 2).map((wfId) => {
                    const wf = getWorkflow(wfId);
                    return (
                      <Button
                        key={wfId}
                        variant="secondary"
                        size="sm"
                        className="text-[10px] h-5 px-1.5"
                        onClick={() => openWithWorkflow(wfId)}
                      >
                        {wf?.label ?? wfId}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer — expand button */}
      <div className="border-t px-3 py-2">
        <Button
          variant="default"
          size="sm"
          className="w-full text-xs"
          onClick={() => setPanelMode("overlay")}
        >
          Open full panel
        </Button>
      </div>
    </div>
  );
}
