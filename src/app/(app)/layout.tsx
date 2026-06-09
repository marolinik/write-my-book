"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { AgentPanelWrapper } from "@/components/agent/agent-panel-wrapper";
import { AICompanionBubble } from "@/components/agent/ai-companion-bubble";
import { AIMiniPanel } from "@/components/agent/ai-mini-panel";
import { FloatingAgentOverlay } from "@/components/agent/floating-agent-overlay";
import { LanguageProvider } from "@/components/providers/language-provider";
import { CommandPalette } from "@/components/layout/command-palette";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageContext } from "@/hooks/use-page-context";
import { useAgentUIStore, isFullWidthRoute } from "@/stores/agent-ui-store";
import { hydrateAgentStore } from "@/stores/agent-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);
  const adjustForRoute = useAgentUIStore((s) => s.adjustForRoute);
  const isMobile = useIsMobile();
  const pathname = usePathname();

  // Hydrate agent store from localStorage/sessionStorage (once, after mount)
  useEffect(() => {
    hydrateAgentStore();
  }, []);

  // Track what page/chapter/document the user is looking at
  usePageContext();

  // Issue 1: Auto-adjust panel mode when navigating to full-width pages
  useEffect(() => {
    adjustForRoute(pathname);
  }, [pathname, adjustForRoute]);

  // Auto-switch from docked panel to overlay on narrow viewports
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1400px)");

    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (!e.matches && panelMode === "panel") {
        setPanelMode("overlay");
      }
    };

    // Check on mount
    handler(mq);

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [panelMode, setPanelMode]);

  const showOverlay = panelMode === "overlay";
  // Issue 1: Prevent docked panel on full-width routes
  const showPanel = panelMode === "panel" && !isFullWidthRoute(pathname);

  const handleToggleAgent = () => {
    if (isMobile) {
      if (panelMode === "overlay") {
        setPanelMode("bubble");
      } else {
        setPanelMode("overlay");
      }
      return;
    }

    // Desktop: toggle expanded state off/on
    if (panelMode === "overlay" || panelMode === "panel") {
      setPanelMode("bubble");
    } else {
      // On full-width routes, always open as overlay
      if (isFullWidthRoute(pathname)) {
        setPanelMode("overlay");
        return;
      }
      // Restore last expanded mode (overlay or panel)
      let lastMode: "overlay" | "panel" = "overlay";
      try {
        const stored = localStorage.getItem("wmb-agent-expanded-mode");
        if (stored === "panel") lastMode = "panel";
      } catch {
        // ignore
      }
      setPanelMode(lastMode);
    }
  };

  return (
    <LanguageProvider>
      <CommandPalette />
      <KeyboardShortcutsDialog />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader
            onToggleAgent={handleToggleAgent}
            agentOpen={showOverlay || showPanel}
          />
          <div className="flex flex-1 overflow-hidden relative">
            {isMobile ? (
              <>
                <main className="flex-1 overflow-y-auto pb-14">{children}</main>
                {showOverlay && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-30 bg-black/40"
                      onClick={() => setPanelMode("bubble")}
                    />
                    {/* Bottom sheet */}
                    <div className="fixed inset-x-0 bottom-0 z-40 h-[60vh] bg-background border-t rounded-t-xl shadow-lg flex flex-col">
                      <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-2 shrink-0" />
                      <div className="flex-1 overflow-hidden">
                        <AgentPanelWrapper onClose={() => setPanelMode("bubble")} />
                      </div>
                    </div>
                  </>
                )}
                <AICompanionBubble />
                <MobileBottomNav />
              </>
            ) : (
              <>
                {/* Main content — shrinks when panel is docked */}
                <main className="flex-1 overflow-y-auto min-w-0">{children}</main>

                {/* Docked right panel — hidden on full-width routes */}
                {showPanel && (
                  <div className="w-[400px] min-[1600px]:w-[440px] shrink-0 border-l bg-background flex flex-col overflow-hidden">
                    <AgentPanelWrapper onClose={() => setPanelMode("bubble")} />
                  </div>
                )}

                {/* Desktop floating modes */}
                {panelMode === "bubble" && <AICompanionBubble />}
                {panelMode === "mini" && <AIMiniPanel />}
                {(showOverlay || (panelMode === "panel" && isFullWidthRoute(pathname))) && (
                  <FloatingAgentOverlay onClose={() => setPanelMode("mini")}>
                    <AgentPanelWrapper onClose={() => setPanelMode("mini")} />
                  </FloatingAgentOverlay>
                )}
              </>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </LanguageProvider>
  );
}
