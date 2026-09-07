"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  BookOpenIcon,
  BookMarkedIcon,
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

type TabKey = (typeof TAB_DEFS)[number]["key"] | "dev";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);
  const panelOpen = panelMode !== "hidden" && panelMode !== "bubble";
  const bookIdMatch = pathname.match(/\/books\/([^/]+)/);
  const bookId = bookIdMatch?.[1];

  // Labels come from the active UI dictionary (D-11 — they were hardcoded
  // English and never translated in any locale).
  const labels: Record<TabKey, string> = {
    home: t.nav.home,
    books: t.nav.books,
    agent: t.nav.agent,
    settings: t.nav.settings,
    dev: t.nav.development,
  };

  // Dev hub tab list — Book Development hubs live under /books/[bookId]/dev, so
  // the tab only appears (as a 5th tab) while inside a book, alongside the sidebar's
  // book-scoped Development entry (UDG-6 Tara: mobile discoverability on phones/mobile nav; the
  // sidebar Dev entry is /books/[bookId]/dev via BookMarkedIcon).
  const activeTabs: TabKey[] = bookId
    ? ["home", "dev", "agent", "settings"]
    : ["home", "books", "agent", "settings"];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-around border-t bg-background md:hidden">
      {activeTabs.map((key) => {
        if (key === "dev") {
          const isActive = pathname.includes("/dev");
          return (
            <Link
              key={key}
              href={`/books/${bookId}/dev`}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <BookMarkedIcon className="size-5" />
              <span>{labels.dev}</span>
            </Link>
          );
        }

        const tab = TAB_DEFS.find((t) => t.key === key)!;
        const isAgent = tab.href === null;
        const isActive = isAgent
          ? panelOpen
          : key === "books"
            ? pathname.startsWith(tab.match) && !pathname.includes("/dev")
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
