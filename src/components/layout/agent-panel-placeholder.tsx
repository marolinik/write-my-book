"use client";

import { BotIcon } from "lucide-react";

export function AgentPanelPlaceholder() {
  return (
    <div className="flex h-full w-80 flex-col border-l bg-muted/30">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <BotIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Writing Agent</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="rounded-full bg-muted p-4">
          <BotIcon className="size-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          Agent chat coming in Phase 4
        </p>
        <p className="text-xs text-muted-foreground/70">
          Your AI writing assistant will appear here. It will help with
          drafting, editing, and quality assurance.
        </p>
      </div>
    </div>
  );
}
