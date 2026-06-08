"use client";

import { BotIcon } from "lucide-react";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useAgentSessionStore } from "@/stores/agent-session-store";

export function AICompanionBubble() {
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);
  const unreadCount = useAgentUIStore((s) => s.unreadCount);
  const hasRunning = useAgentSessionStore((s) => s.hasRunningSessions)();

  if (panelMode !== "bubble") return null;

  return (
    <button
      onClick={() => setPanelMode("mini")}
      className="fixed bottom-5 right-5 z-50 flex items-center justify-center size-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Open Writing Agent"
    >
      <BotIcon className="size-5" />

      {/* Pulse ring when agent is working */}
      {hasRunning && (
        <span className="absolute inset-0 rounded-full animate-ping bg-primary/30 pointer-events-none" />
      )}

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center size-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
