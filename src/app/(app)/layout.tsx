"use client";

import { useState } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AgentPanelWrapper } from "@/components/agent/agent-panel-wrapper";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [agentOpen, setAgentOpen] = useState(false);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader
          onToggleAgent={() => setAgentOpen((v) => !v)}
          agentOpen={agentOpen}
        />
        <div className="flex flex-1 overflow-hidden relative">
          <main className="flex-1 overflow-y-auto">{children}</main>
          {agentOpen && (
            <div className="fixed inset-0 z-40 bg-background md:relative md:inset-auto md:z-auto md:bg-transparent">
              <AgentPanelWrapper onClose={() => setAgentOpen(false)} />
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
