"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AgentPanelWrapper } from "@/components/agent/agent-panel-wrapper";
import { LanguageProvider } from "@/components/providers/language-provider";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  useDefaultLayout,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAgentStore } from "@/stores/agent-store";

function AgentLayout({
  children,
  onCloseAgent,
}: {
  children: React.ReactNode;
  onCloseAgent: () => void;
}) {
  const layoutProps = useDefaultLayout({
    id: "app-layout-v2",
    panelIds: ["content", "agent"],
    storage: typeof window !== "undefined" ? localStorage : undefined,
  });

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id="app-layout-v2"
      {...layoutProps}
    >
      <ResizablePanel
        id="content"
        defaultSize="65%"
        minSize="35%"
      >
        <main className="h-full overflow-y-auto">{children}</main>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="agent"
        defaultSize="35%"
        minSize="25%"
        maxSize="55%"
      >
        <AgentPanelWrapper onClose={onCloseAgent} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const panelOpen = useAgentStore((s) => s.panelOpen);
  const setPanelOpen = useAgentStore((s) => s.setPanelOpen);
  const isMobile = useIsMobile();

  return (
    <LanguageProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader
            onToggleAgent={() => setPanelOpen(!panelOpen)}
            agentOpen={panelOpen}
          />
          <div className="flex flex-1 overflow-hidden relative">
            {isMobile ? (
              <>
                <main className="flex-1 overflow-y-auto">{children}</main>
                {panelOpen && (
                  <div className="fixed inset-0 z-40 bg-background">
                    <AgentPanelWrapper onClose={() => setPanelOpen(false)} />
                  </div>
                )}
              </>
            ) : panelOpen ? (
              <AgentLayout onCloseAgent={() => setPanelOpen(false)}>
                {children}
              </AgentLayout>
            ) : (
              <main className="flex-1 overflow-y-auto">{children}</main>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </LanguageProvider>
  );
}
