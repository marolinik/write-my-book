"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useParams } from "next/navigation";
import { BotIcon, SidebarIcon } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { useLanguage } from "@/components/providers/language-provider";
import { useBook } from "@/hooks/use-books";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured =
  clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");

const UserButton = dynamic(
  () => import("@clerk/nextjs").then((mod) => ({ default: mod.UserButton })),
  { ssr: false }
);

interface Breadcrumb {
  label: string;
  href: string;
  badge?: string;
}

function useBreadcrumbs(): Breadcrumb[] {
  const pathname = usePathname();
  const params = useParams();
  const { t } = useLanguage();
  const bookId = params?.bookId as string | undefined;
  const chapterId = params?.chapterId as string | undefined;
  const { data: book } = useBook(bookId ?? "");

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Breadcrumb[] = [];

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
    library: t.nav.library,
    transfer: t.nav.transfer,
    reports: t.nav.reports,
    style: t.nav.style,
    setup: t.nav.setup,
    billing: "Billing",
  };

  let href = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    href += `/${seg}`;

    if (segmentMap[seg]) {
      crumbs.push({ label: segmentMap[seg], href });
    } else if (bookId && seg === bookId) {
      crumbs.push({ label: book?.name ?? "Book", href });
    } else if (chapterId && seg === chapterId) {
      const chapter = book?.chapters?.find((ch) => ch.id === chapterId);
      const label = chapter
        ? `Ch.${chapter.chapterNumber}${chapter.title ? `: ${chapter.title}` : ""}`
        : "Chapter";
      const badge = chapter?.status?.replace(/_/g, " ");
      crumbs.push({ label, href, badge });
    }
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

      <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <span className="shrink-0">/</span>}
            {i === breadcrumbs.length - 1 ? (
              <span className="text-foreground font-medium truncate flex items-center gap-1.5">
                {crumb.label}
                {crumb.badge && (
                  <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0">
                    {crumb.badge}
                  </Badge>
                )}
              </span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground transition-colors truncate">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
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
        {isClerkConfigured && (
          <UserButton
            afterSignOutUrl="/login"
            appearance={{
              elements: { avatarBox: "size-7" },
            }}
          />
        )}
      </div>
    </header>
  );
}
