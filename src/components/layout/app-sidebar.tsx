"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useParams } from "next/navigation";
import {
  BookOpenIcon,
  BookMarkedIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  PenLineIcon,
  FileTextIcon,
  PlusIcon,
  ChevronRightIcon,
  PenToolIcon,
  BarChart3Icon,
  DownloadIcon,
  ArrowLeftRightIcon,
  SettingsIcon,
  PaletteIcon,
  WandIcon,
  CircleIcon,
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useBook } from "@/hooks/use-books";
import { useSeriesDetail } from "@/hooks/use-series";
import { useBookState } from "@/hooks/use-book-state";
import { useLanguage } from "@/components/providers/language-provider";
import { JourneyChecklist, JourneySelectorDialog } from "@/components/journey";
import { getJourney, getStepNavHref, getRecommendedJourney } from "@/lib/agents/journeys";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

/** Status dot colors for chapters */
const CH_STATUS_COLORS: Record<string, string> = {
  undiscussed: "text-muted-foreground/40",
  discussed: "text-blue-400",
  planned: "text-indigo-400",
  drafted: "text-amber-400",
  dev_edited: "text-orange-400",
  line_edited: "text-purple-400",
  beta_read: "text-pink-400",
  beta_passed: "text-green-500",
};

/** Map workflow IDs to sidebar nav item keys */
const WORKFLOW_TO_NAV: Record<string, string> = {
  "capture-style": "style",
  "create-story-bible": "setup",
  "build-architecture": "setup",
  "discuss-chapter": "chapters",
  "plan-chapter": "chapters",
  "write-chapter": "chapters",
  "freewrite": "chapters",
  "dev-edit": "editorial",
  "line-edit": "editorial",
  "beta-read": "editorial",
  "revise": "editorial",
  "discuss-edits": "editorial",
  "analyze": "reports",
  "refresh-style": "style",
  "evolve-style": "style",
  "publishing-check": "export",
  "market-analysis": "reports",
};

const MAX_SIDEBAR_CHAPTERS = 10;

type ItemStatus = "done" | "partial" | "none";

/** Left-edge status bar color */
function statusBarClass(s: ItemStatus): string {
  if (s === "done") return "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r-sm before:bg-green-500";
  if (s === "partial") return "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r-sm before:bg-amber-500";
  return "";
}

export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams();
  const bookId = params?.bookId as string | undefined;
  const seriesId = params?.seriesId as string | undefined;
  const { t, language } = useLanguage();
  const agentStrings = getAgentStrings(language);

  const { data: book } = useBook(bookId ?? "");
  const { data: series } = useSeriesDetail(seriesId ?? "");
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [showAllChapters, setShowAllChapters] = useState(false);
  const bookState = useBookState(bookId ?? "");
  const [journeyDialogOpen, setJourneyDialogOpen] = useState(false);

  // Journey data for checklist
  const journeyData = useMemo(() => {
    if (!bookId || bookState.isLoading || !bookState.activeJourneyId) return null;
    const journey = getJourney(bookState.activeJourneyId);
    if (!journey || !bookState.journeySteps) return null;

    return {
      journeyName: agentStrings.journeyLabels[journey.id] ?? journey.label,
      steps: bookState.journeySteps.map((s) => ({
        ...s,
        label: agentStrings.stepLabels[s.workflowId] ?? s.label,
        href: getStepNavHref(s.workflowId, bookId),
      })),
      completedCount: bookState.journeyProgress?.completed ?? 0,
      totalCount: bookState.journeyProgress?.total ?? 0,
      allComplete: bookState.journeyComplete,
    };
  }, [bookId, bookState, agentStrings]);

  // Recommended journey for the selector dialog
  const recommendedJourneyId = useMemo(() => {
    if (!bookId || bookState.isLoading) return "new-novel";
    const rec = getRecommendedJourney({
      hasChapters: bookState.hasChapters,
      hasFingerprint: bookState.hasFingerprint,
      hasStoryBible: bookState.hasStoryBible,
      hasArchitecture: bookState.hasArchitecture,
      hasImportedManuscript: bookState.hasImportedManuscript,
      chapterCount: bookState.chapterCount,
      chapterStatuses: bookState.chapterStatuses,
    });
    return rec?.journeyId ?? "new-novel";
  }, [bookId, bookState]);

  // Derived counts and statuses
  const { itemStatus, counts, pendingFindings, nextNavKey } = useMemo(() => {
    const statuses: Record<string, ItemStatus> = {};
    const cts: Record<string, string> = {};
    let pending = 0;
    let navKey: string | null = null;

    if (bookId && book && !bookState.isLoading) {
      const bs = bookState;
      const cs = bs.chapterStatuses;
      const total = bs.chapterCount;
      const draftedPlus = (cs.drafted ?? 0) + (cs.dev_edited ?? 0) + (cs.line_edited ?? 0) + (cs.beta_read ?? 0) + (cs.final ?? 0);
      const editedPlus = (cs.dev_edited ?? 0) + (cs.line_edited ?? 0) + (cs.beta_read ?? 0) + (cs.final ?? 0);

      // Setup: bible + architecture + fingerprint
      const setupDone = [bs.hasStoryBible, bs.hasArchitecture].filter(Boolean).length;
      statuses.setup = setupDone === 2 ? "done" : setupDone > 0 ? "partial" : "none";
      cts.setup = `${setupDone}/2`;

      // Style
      statuses.style = bs.hasStyleProfile ? "done" : bs.hasFingerprint ? "partial" : "none";

      // Chapters
      statuses.chapters = total === 0 ? "none" : draftedPlus >= total ? "done" : "partial";
      cts.chapters = total > 0 ? `${draftedPlus}/${total}` : "";

      // Editorial
      pending = bs.pendingFindingsCount ?? 0;
      statuses.editorial = total === 0 ? "none"
        : (editedPlus >= total && pending === 0) ? "done"
        : (editedPlus > 0 || pending > 0) ? "partial" : "none";
      cts.editorial = total > 0 ? `${editedPlus}/${total}` : "";

      // Reports
      const reportCount = [bs.hasAnalysisReport, bs.hasContinuityReport, bs.hasMarketReport].filter(Boolean).length;
      statuses.reports = reportCount >= 2 ? "done" : reportCount > 0 ? "partial" : "none";
      cts.reports = `${reportCount}/3`;

      // Export
      const finalCount = cs.final ?? 0;
      statuses.export = (finalCount >= total && total > 0) ? "done" : "none";

      // Prepare phase overall
      const prepareItems = [statuses.setup, statuses.style];
      const prepareDone = prepareItems.filter(s => s === "done").length;
      statuses.prepare = prepareDone === prepareItems.length ? "done" : prepareDone > 0 || prepareItems.some(s => s === "partial") ? "partial" : "none";

      // Edit phase overall
      const editItems = [statuses.editorial, statuses.reports];
      const editDone = editItems.filter(s => s === "done").length;
      statuses.editReview = editDone === editItems.length ? "done" : editDone > 0 || editItems.some(s => s === "partial") ? "partial" : "none";

      navKey = bs.nextRecommendedWorkflow
        ? WORKFLOW_TO_NAV[bs.nextRecommendedWorkflow] ?? null
        : null;
    }

    return { itemStatus: statuses, counts: cts, pendingFindings: pending, nextNavKey: navKey };
  }, [bookId, book, bookState]);

  const navItems = [
    { title: t.nav.dashboard, href: "/dashboard", icon: LayoutDashboardIcon },
    { title: t.nav.books, href: "/books", icon: BookOpenIcon },
    { title: t.nav.series, href: "/series", icon: LibraryIcon },
  ];

  /** Renders a NEXT badge if this nav key is the recommended next step */
  const nextBadge = (navKey: string) =>
    nextNavKey === navKey ? (
      <Badge variant="default" className="ml-auto text-[10px] px-1.5 py-0">
        {t.nav.nextStep}
      </Badge>
    ) : null;

  /** Count badge (muted) for section headers */
  const countBadge = (key: string) => {
    const v = counts[key];
    if (!v) return null;
    const s = itemStatus[key];
    const color = s === "done" ? "text-green-500" : s === "partial" ? "text-amber-500" : "text-muted-foreground";
    return <span className={`ml-auto text-[10px] font-semibold ${color}`}>{v}</span>;
  };

  return (
    <>
    <Sidebar collapsible="offcanvas">
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
        {/* ─── Global Navigation ─── */}
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
                        : item.href === "/books"
                          ? pathname === "/books"
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

        {/* ─── Active Series Context ─── */}
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
                    isActive={pathname.includes(`/series/${seriesId}/documents`)}
                  >
                    <Link href={`/series/${seriesId}/documents`}>
                      <DownloadIcon />
                      <span>{t.nav.documents}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes(`/series/${seriesId}/analytics`)}
                  >
                    <Link href={`/series/${seriesId}/analytics`}>
                      <BarChart3Icon />
                      <span>{t.nav.analytics}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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

        {/* ─── Active Book Context ─── */}
        {bookId && book && (
          <>
            {/* Book header + Overview */}
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center gap-1">
                <BookOpenIcon className="size-3" />
                <span className="truncate">{book.name}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
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

            <SidebarSeparator />

            {/* ─── Phase 1: Prepare ─── */}
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center">
                <span>{t.nav.sectionSetup}</span>
                {countBadge("setup")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {/* Setup (Story Bible + Architecture) */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/setup")}
                      className={`relative ${statusBarClass(itemStatus.setup ?? "none")}`}
                    >
                      <Link href={`/books/${bookId}/setup`}>
                        <WandIcon />
                        <span>{t.nav.setup}</span>
                        {nextBadge("setup")}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Transfer (Import & Export) */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/transfer") || pathname.includes("/import") || pathname.includes("/export")}
                      className="relative"
                    >
                      <Link href={`/books/${bookId}/transfer`}>
                        <ArrowLeftRightIcon />
                        <span>{t.nav.transfer}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Style */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/style")}
                      className={`relative ${statusBarClass(itemStatus.style ?? "none")}`}
                    >
                      <Link href={`/books/${bookId}/style`}>
                        <PaletteIcon />
                        <span>{t.nav.style}</span>
                        {nextBadge("style")}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            {/* ─── Phase 2: Write ─── */}
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center">
                <span>{t.nav.sectionWriting}</span>
                {counts.chapters ? (
                  <span className={`ml-auto text-[10px] font-semibold ${
                    itemStatus.chapters === "done" ? "text-green-500" : itemStatus.chapters === "partial" ? "text-amber-500" : "text-muted-foreground"
                  }`}>{counts.chapters}</span>
                ) : null}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {/* Chapters (collapsible) */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setChaptersOpen((o) => !o)}
                      className={`relative ${statusBarClass(itemStatus.chapters ?? "none")}`}
                    >
                      <ChevronRightIcon
                        className={`size-4 transition-transform duration-200 ${chaptersOpen ? "rotate-90" : ""}`}
                      />
                      <span>{t.nav.chapters}</span>
                      {nextNavKey === "chapters" ? (
                        <Badge variant="default" className="ml-auto text-[10px] px-1.5 py-0">
                          {t.nav.nextStep}
                        </Badge>
                      ) : (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {book.chapters?.length ?? 0}
                        </span>
                      )}
                    </SidebarMenuButton>
                    {chaptersOpen && (
                      <SidebarMenuSub>
                        {(showAllChapters
                          ? book.chapters
                          : book.chapters?.slice(0, MAX_SIDEBAR_CHAPTERS)
                        )?.map((ch) => (
                          <SidebarMenuSubItem key={ch.id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname.includes(`/chapters/${ch.id}`)}
                            >
                              <Link href={`/books/${bookId}/chapters/${ch.id}`}>
                                <CircleIcon
                                  className={`size-2 fill-current ${CH_STATUS_COLORS[ch.status] ?? "text-muted-foreground/40"}`}
                                />
                                <span>
                                  Ch. {ch.chapterNumber}
                                  {ch.title ? `: ${ch.title}` : ""}
                                </span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                        {!showAllChapters && (book.chapters?.length ?? 0) > MAX_SIDEBAR_CHAPTERS && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton onClick={() => setShowAllChapters(true)}>
                              <span className="text-xs text-muted-foreground">
                                Show all {book.chapters?.length} chapters
                              </span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
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

                  {/* Library (Documents + Wiki) */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/library") || pathname.includes("/documents") || pathname.includes("/wiki")}
                      className="relative"
                    >
                      <Link href={`/books/${bookId}/library`}>
                        <LibraryIcon />
                        <span>{t.nav.library}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Writing Dashboard */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/dashboard") && !pathname.startsWith("/dashboard")}
                      className="relative"
                    >
                      <Link href={`/books/${bookId}/dashboard`}>
                        <LayoutDashboardIcon />
                        <span>{t.writingDashboard.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            {/* ─── Phase 3: Edit & Review ─── */}
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center">
                <span>{t.nav.sectionEditing}</span>
                {countBadge("editorial")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {/* Editorial */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/editorial")}
                      className={`relative ${statusBarClass(itemStatus.editorial ?? "none")}`}
                    >
                      <Link href={`/books/${bookId}/editorial`}>
                        <PenToolIcon />
                        <span>{t.nav.editorial}</span>
                        {pendingFindings > 0 ? (
                          <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
                            {pendingFindings}
                          </Badge>
                        ) : (
                          nextBadge("editorial")
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Reports */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/reports")}
                      className={`relative ${statusBarClass(itemStatus.reports ?? "none")}`}
                    >
                      <Link href={`/books/${bookId}/reports`}>
                        <BarChart3Icon />
                        <span>{t.nav.reports}</span>
                        {nextBadge("reports")}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            {/* ─── Phase 4: Publish ─── */}
            <SidebarGroup>
              <SidebarGroupLabel>{t.nav.sectionPublish}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes("/transfer") && pathname.includes("tab=export")}
                      className={`relative ${statusBarClass(itemStatus.export ?? "none")}`}
                    >
                      <Link href={`/books/${bookId}/transfer?tab=export`}>
                        <DownloadIcon />
                        <span>{t.nav.export}</span>
                        {nextBadge("export")}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* ─── Journey Progress ─── */}
            {journeyData && (
              <>
                <SidebarSeparator />
                <JourneyChecklist
                  bookId={bookId}
                  journeyName={journeyData.journeyName}
                  steps={journeyData.steps}
                  completedCount={journeyData.completedCount}
                  totalCount={journeyData.totalCount}
                  allComplete={journeyData.allComplete}
                  onChangeJourney={() => setJourneyDialogOpen(true)}
                />
              </>
            )}
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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
    {bookId && (
      <JourneySelectorDialog
        open={journeyDialogOpen}
        onOpenChange={setJourneyDialogOpen}
        bookId={bookId}
        currentJourneyId={bookState.activeJourneyId}
        recommendedJourneyId={recommendedJourneyId}
      />
    )}
    </>
  );
}
