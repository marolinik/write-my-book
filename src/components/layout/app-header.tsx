"use client";

import { usePathname } from "next/navigation";
import { BotIcon, SidebarIcon } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

function useBreadcrumbs() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: string[] = [];

  const segmentMap: Record<string, string> = {
    dashboard: t.nav.dashboard,
    books: t.nav.books,
    series: t.nav.series,
    new: t.header.new,
    chapters: t.nav.chapters,
    settings: t.nav.settings,
    editorial: t.nav.editorial,
    documents: t.nav.documents,
    import: t.nav.import,
    export: t.nav.export,
    reports: t.nav.reports,
    style: t.nav.style,
    setup: t.nav.setup,
  };

  for (const seg of segments) {
    if (segmentMap[seg]) crumbs.push(segmentMap[seg]);
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
  const { t } = useLanguage();
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
        <TooltipContent side="bottom">{t.header.toggleSidebar}</TooltipContent>
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
          <TooltipContent side="bottom">{t.header.toggleAgent}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
