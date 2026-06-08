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

const tabs = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboardIcon, match: "/dashboard" },
  { label: "Books", href: "/books", icon: BookOpenIcon, match: "/books" },
  { label: "Agent", href: null, icon: BotIcon, match: null },
  { label: "Settings", href: "/settings", icon: SettingsIcon, match: "/settings" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);
  const panelOpen = panelMode !== "hidden" && panelMode !== "bubble";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-around border-t bg-background md:hidden">
      {tabs.map((tab) => {
        const isAgent = tab.href === null;
        const isActive = isAgent
          ? panelOpen
          : tab.match && pathname.startsWith(tab.match);

        if (isAgent) {
          return (
            <button
              key={tab.label}
              onClick={() => setPanelMode(panelOpen ? "bubble" : "overlay")}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon className="size-5" />
              <span>{tab.label}</span>
            </button>
          );
        }

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <tab.icon className="size-5" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
