"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { usePathname, useParams } from "next/navigation";
import {
  BookOpenIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  PenLineIcon,
  FileTextIcon,
  PlusIcon,
  ChevronRightIcon,
  PenToolIcon,
  BarChart3Icon,
  DownloadIcon,
  UploadIcon,
  SettingsIcon,
  PaletteIcon,
  WandIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useBook } from "@/hooks/use-books";
import { useSeriesDetail } from "@/hooks/use-series";
import { useBookState } from "@/hooks/use-book-state";
import { useLanguage } from "@/components/providers/language-provider";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured =
  clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");

// Dynamic import: avoids loading @clerk/nextjs module when Clerk isn't configured
const UserButton = dynamic(
  () => import("@clerk/nextjs").then((mod) => ({ default: mod.UserButton })),
  { ssr: false }
);

/** Light background tint for menu items based on completion status */
const STATUS_BG = {
  done: "bg-green-500/10",
  partial: "bg-amber-500/10",
  none: "",
} as const;
type ItemStatus = keyof typeof STATUS_BG;

export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams();
  const bookId = params?.bookId as string | undefined;
  const seriesId = params?.seriesId as string | undefined;
  const { t } = useLanguage();

  const { data: book } = useBook(bookId ?? "");
  const { data: series } = useSeriesDetail(seriesId ?? "");
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const bookState = useBookState(bookId ?? "");

  // Per-item status for light background tinting
  const itemStatus: Record<string, ItemStatus> = {};
  if (bookId && book && !bookState.isLoading) {
    const bs = bookState;
    const cs = bs.chapterStatuses;
    const total = bs.chapterCount;
    const draftedPlus = (cs.drafted ?? 0) + (cs.dev_edited ?? 0) + (cs.line_edited ?? 0) + (cs.beta_read ?? 0) + (cs.final ?? 0);
    const editedPlus = (cs.dev_edited ?? 0) + (cs.line_edited ?? 0) + (cs.beta_read ?? 0) + (cs.final ?? 0);

    // Setup wizard: all 3 setup docs = done, some = partial
    const setupCount = [bs.hasFingerprint, bs.hasStoryBible, bs.hasArchitecture].filter(Boolean).length;
    itemStatus.setup = setupCount === 3 ? "done" : setupCount > 0 ? "partial" : "none";

    // Chapters: all drafted+ = done, has chapters = partial
    itemStatus.chapters = total === 0 ? "none" : draftedPlus >= total ? "done" : "partial";

    // Editorial: all edited+ & no pending findings = done, some editing = partial
    itemStatus.editorial = total === 0 ? "none"
      : (editedPlus >= total && bs.pendingFindingsCount === 0) ? "done"
      : (editedPlus > 0 || bs.pendingFindingsCount > 0) ? "partial" : "none";

    // Reports: has any report docs = done/partial
    const reportCount = [bs.hasAnalysisReport, bs.hasContinuityReport, bs.hasMarketReport].filter(Boolean).length;
    itemStatus.reports = reportCount >= 2 ? "done" : reportCount > 0 ? "partial" : "none";

    // Style: has style profile = done, has fingerprint only = partial
    itemStatus.style = bs.hasStyleProfile ? "done" : bs.hasFingerprint ? "partial" : "none";

    // Export: only "done" when all chapters are final
    const finalCount = cs.final ?? 0;
    itemStatus.export = (finalCount >= total && total > 0) ? "done" : "none";
  }

  const navItems = [
    { title: t.nav.dashboard, href: "/dashboard", icon: LayoutDashboardIcon },
    { title: t.nav.books, href: "/books", icon: BookOpenIcon },
    { title: t.nav.series, href: "/series", icon: LibraryIcon },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <PenLineIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-display text-base font-semibold">
                    WriteMyBook
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t.nav.writingPlatform}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>{t.nav.navigation}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href)
                    }
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Active Series Context */}
        {seriesId && series && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-1">
              <LibraryIcon className="size-3" />
              <span className="truncate">{series.title}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      pathname === `/series/${seriesId}` &&
                      !pathname.includes("/analytics")
                    }
                  >
                    <Link href={`/series/${seriesId}`}>
                      <FileTextIcon />
                      <span>{t.nav.overview}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={false}
                  >
                    <Link href={`/series/${seriesId}`}>
                      <DownloadIcon />
                      <span>{t.nav.documents}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={false}
                  >
                    <Link href={`/series/${seriesId}`}>
                      <BarChart3Icon />
                      <span>{t.nav.analytics}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Books sub-nav */}
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <ChevronRightIcon />
                    <span>{t.nav.books}</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    {series.books?.map((b) => (
                      <SidebarMenuSubItem key={b.id}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname.includes(`/books/${b.id}`)}
                        >
                          <Link href={`/books/${b.id}`}>
                            <span>
                              {b.bookNumber}. {b.name}
                            </span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Active Book Context — grouped by workflow phase */}
        {bookId && book && (
          <>
            {/* Book header */}
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center gap-1">
                <BookOpenIcon className="size-3" />
                <span className="truncate">{book.name}</span>
              </SidebarGroupLabel>
            </SidebarGroup>

            {/* SETUP */}
            <SidebarGroup>
              <SidebarGroupLabel>{t.nav.sectionSetup}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/setup")}
                      className={STATUS_BG[itemStatus.setup ?? "none"]}
                    >
                      <Link href={`/books/${bookId}/setup`}>
                        <WandIcon />
                        <span>{t.nav.setup}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/import")}
                    >
                      <Link href={`/books/${bookId}/import`}>
                        <UploadIcon />
                        <span>{t.nav.import}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* WRITING */}
            <SidebarGroup>
              <SidebarGroupLabel>{t.nav.sectionWriting}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setChaptersOpen((o) => !o)}
                      className={STATUS_BG[itemStatus.chapters ?? "none"]}
                    >
                      <ChevronRightIcon
                        className={`size-4 transition-transform duration-200 ${chaptersOpen ? "rotate-90" : ""}`}
                      />
                      <span>{t.nav.chapters}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {book.chapters?.length ?? 0}
                      </span>
                    </SidebarMenuButton>
                    {chaptersOpen && (
                      <SidebarMenuSub>
                        {book.chapters?.map((ch) => (
                          <SidebarMenuSubItem key={ch.id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname.includes(`/chapters/${ch.id}`)}
                            >
                              <Link href={`/books/${bookId}/chapters/${ch.id}`}>
                                <span>
                                  Ch. {ch.chapterNumber}
                                  {ch.title ? `: ${ch.title}` : ""}
                                </span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild>
                            <Link href={`/books/${bookId}/chapters/new`}>
                              <PlusIcon className="size-3" />
                              <span>{t.nav.addChapter}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* EDITING */}
            <SidebarGroup>
              <SidebarGroupLabel>{t.nav.sectionEditing}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/editorial")}
                      className={STATUS_BG[itemStatus.editorial ?? "none"]}
                    >
                      <Link href={`/books/${bookId}/editorial`}>
                        <PenToolIcon />
                        <span>{t.nav.editorial}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* ANALYSIS */}
            <SidebarGroup>
              <SidebarGroupLabel>{t.nav.sectionAnalysis}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/reports")}
                      className={STATUS_BG[itemStatus.reports ?? "none"]}
                    >
                      <Link href={`/books/${bookId}/reports`}>
                        <BarChart3Icon />
                        <span>{t.nav.reports}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/style")}
                      className={STATUS_BG[itemStatus.style ?? "none"]}
                    >
                      <Link href={`/books/${bookId}/style`}>
                        <PaletteIcon />
                        <span>{t.nav.style}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* PUBLISH */}
            <SidebarGroup>
              <SidebarGroupLabel>{t.nav.sectionPublish}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/export")}
                      className={STATUS_BG[itemStatus.export ?? "none"]}
                    >
                      <Link href={`/books/${bookId}/export`}>
                        <DownloadIcon />
                        <span>{t.nav.export}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* TOOLS */}
            <SidebarGroup>
              <SidebarGroupLabel>{t.nav.sectionTools}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/documents")}
                    >
                      <Link href={`/books/${bookId}/documents`}>
                        <FileTextIcon />
                        <span>{t.nav.documents}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        pathname === `/books/${bookId}` &&
                        !pathname.includes("/chapters") &&
                        !pathname.includes("/settings")
                      }
                    >
                      <Link href={`/books/${bookId}`}>
                        <FileTextIcon />
                        <span>{t.nav.overview}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
            >
              <Link href="/settings">
                <SettingsIcon />
                <span>{t.nav.settings}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isClerkConfigured && (
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="cursor-default">
                <UserButton
                  afterSignOutUrl="/login"
                  appearance={{
                    elements: { avatarBox: "size-8" },
                  }}
                />
                <span className="truncate text-sm">{t.nav.account}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
