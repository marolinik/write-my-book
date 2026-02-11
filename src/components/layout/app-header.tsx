"use client";

import { usePathname } from "next/navigation";
import { BotIcon, SidebarIcon } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: string[] = [];

  for (const seg of segments) {
    if (seg === "dashboard") crumbs.push("Dashboard");
    else if (seg === "books") crumbs.push("Books");
    else if (seg === "series") crumbs.push("Series");
    else if (seg === "new") crumbs.push("New");
    else if (seg === "chapters") crumbs.push("Chapters");
    else if (seg === "settings") crumbs.push("Settings");
    // Skip UUIDs
  }

  return crumbs;
}

export function AppHeader({
  onToggleAgent,
  agentOpen,
}: {
  onToggleAgent: () => void;
  agentOpen: boolean;
}) {
  const { toggleSidebar } = useSidebar();
  const breadcrumbs = useBreadcrumbs();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={toggleSidebar}
          >
            <SidebarIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Toggle sidebar</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mr-2 h-4" />

      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span>/</span>}
            <span className={i === breadcrumbs.length - 1 ? "text-foreground font-medium" : ""}>
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className="ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={agentOpen ? "secondary" : "ghost"}
              size="icon"
              className="size-7"
              onClick={onToggleAgent}
            >
              <BotIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle agent panel</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
