"use client";

import { BotIcon, SparklesIcon } from "lucide-react";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useAgentSessionStore } from "@/stores/agent-session-store";

export function AICompanionBubble() {
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);
  const unreadCount = useAgentUIStore((s) => s.unreadCount);
  const onboardingOffers = useAgentUIStore((s) => s.onboardingOffers);
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const hasRunning = useAgentSessionStore((s) => s.hasRunningSessions)();

  if (panelMode !== "bubble") return null;

  return (
    <>
      {/* Pending onboarding offers — retrievable if a toast was ignored.
          On mobile the offers/FAB clear the fixed bottom nav (h-14) and each
          other; pills are width-capped so they never blanket the manuscript
          being edited at 320/390 (D-53). */}
      {onboardingOffers.length > 0 && (
        <div className="fixed bottom-36 right-5 z-50 flex flex-col items-end gap-2 md:bottom-20">
          {onboardingOffers.map((offer) => (
            <button
              key={offer.workflowId}
              onClick={() => openWithWorkflow(offer.workflowId)}
              className="flex min-w-0 max-w-[75vw] items-center gap-1.5 rounded-full border border-primary/30 bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md hover:bg-primary/10 transition-colors md:max-w-none"
            >
              <SparklesIcon className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{offer.cta}</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setPanelMode("mini")}
        className="fixed bottom-20 right-5 z-50 flex items-center justify-center size-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:bottom-5"
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
    </>
  );
}
