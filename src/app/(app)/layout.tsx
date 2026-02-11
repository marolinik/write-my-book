"use client";

import { useState, useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AgentPanelWrapper } from "@/components/agent/agent-panel-wrapper";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";

const LAYOUT_KEY = "app-layout";

function useSafeDefaultLayout(id: string) {
  const [layout, setLayout] = useState<number[] | undefined>(undefined);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`react-resizable-panels:${id}`);
      if (stored) setLayout(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, [id]);

  const onLayoutChanged = (sizes: number[]) => {
    try {
      localStorage.setItem(`react-resizable-panels:${id}`, JSON.stringify(sizes));
    } catch {
      // ignore
    }
    setLayout(sizes);
  };

  return { defaultLayout: layout, onLayoutChanged };
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [agentOpen, setAgentOpen] = useState(false);
  const isMobile = useIsMobile();

  const { defaultLayout, onLayoutChanged } = useSafeDefaultLayout(LAYOUT_KEY);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader
          onToggleAgent={() => setAgentOpen((v) => !v)}
          agentOpen={agentOpen}
        />
        <div className="flex flex-1 overflow-hidden relative">
          {isMobile ? (
            <>
              <main className="flex-1 overflow-y-auto">{children}</main>
              {agentOpen && (
                <div className="fixed inset-0 z-40 bg-background">
                  <AgentPanelWrapper onClose={() => setAgentOpen(false)} />
                </div>
              )}
            </>
          ) : agentOpen ? (
            <ResizablePanelGroup
              orientation="horizontal"
              defaultLayout={defaultLayout}
              onLayoutChanged={onLayoutChanged}
            >
              <ResizablePanel
                id="content"
                defaultSize="75%"
                minSize="50%"
              >
                <main className="h-full overflow-y-auto">{children}</main>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="agent"
                defaultSize="25%"
                minSize="15%"
                maxSize="40%"
              >
                <AgentPanelWrapper onClose={() => setAgentOpen(false)} />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <main className="flex-1 overflow-y-auto">{children}</main>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
