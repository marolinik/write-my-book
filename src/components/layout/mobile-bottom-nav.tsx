"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  BookOpenIcon,
  BotIcon,
  SettingsIcon,
} from "lucide-react";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage } from "@/components/providers/language-provider";

const TAB_DEFS = [
  { key: "home", href: "/dashboard", icon: LayoutDashboardIcon, match: "/dashboard" },
  { key: "books", href: "/books", icon: BookOpenIcon, match: "/books" },
  { key: "agent", href: null, icon: BotIcon, match: null },
  { key: "settings", href: "/settings", icon: SettingsIcon, match: "/settings" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);
  const panelOpen = panelMode !== "hidden" && panelMode !== "bubble";

  // Labels come from the active UI dictionary (D-11 — they were hardcoded
  // English and never translated in any locale).
  const labels: Record<(typeof TAB_DEFS)[number]["key"], string> = {
    home: t.nav.home,
    books: t.nav.books,
    agent: t.nav.agent,
    settings: t.nav.settings,
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-around border-t bg-background md:hidden">
      {TAB_DEFS.map((tab) => {
        const isAgent = tab.href === null;
        const isActive = isAgent
          ? panelOpen
          : tab.match && pathname.startsWith(tab.match);

        if (isAgent) {
          return (
            <button
              key={tab.key}
              onClick={() => setPanelMode(panelOpen ? "bubble" : "overlay")}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon className="size-5" />
              <span>{labels[tab.key]}</span>
            </button>
          );
        }

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <tab.icon className="size-5" />
            <span>{labels[tab.key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
