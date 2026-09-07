"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEditorialStore } from "@/stores/editorial-store";
import { useEditorialSummary } from "@/hooks/use-editorial";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { ChapterSelector } from "./chapter-selector";
import { BatchEditorialDialog } from "./batch-editorial-dialog";
import { FindingsFilters } from "./findings-filters";
import { FindingsPanel } from "./findings-panel";
import { EditorialSummary } from "./editorial-summary";
import { EditHistoryTimeline } from "./edit-history-timeline";
import { HandoffPanel } from "./handoff-panel";
import { PenLineIcon, SparklesIcon, ShieldCheckIcon, BookOpenIcon, HandshakeIcon } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/components/providers/language-provider";

interface EditorialPageProps {
  bookId: string;
  chapters: Array<{
    id: string;
    chapterNumber: number;
    title: string | null;
    status: string;
  }>;
}

const PIPELINE_STAGES = ["drafted", "dev_edited", "line_edited", "beta_read", "beta_passed"] as const;

export function EditorialPage({ bookId, chapters }: EditorialPageProps) {
  const { t } = useLanguage();
  const { activeTab, setActiveTab } = useEditorialStore();

  const STAGE_LABELS: Record<string, string> = {
    drafted: t.editorial.stage.drafted,
    dev_edited: t.editorial.stage.devEdited,
    line_edited: t.editorial.stage.lineEdited,
    beta_read: t.editorial.stage.betaRead,
    beta_passed: t.editorial.stage.passed,
  };
  const { data: summary } = useEditorialSummary(bookId);
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);

  const pendingCount = summary?.pending ?? 0;
  const totalFindings = summary?.total ?? 0;

  // Chapter pipeline counts
  const chapterStatusCounts: Record<string, number> = {};
  for (const ch of chapters) {
    chapterStatusCounts[ch.status] = (chapterStatusCounts[ch.status] ?? 0) + 1;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-lg font-semibold shrink-0">{t.editorial.title}</h1>
            <ChapterSelector chapters={chapters} />
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("dev-edit")}
            >
              <PenLineIcon className="mr-1.5 size-3.5" />
              {t.editorial.runDevEdit}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("line-edit")}
            >
              <SparklesIcon className="mr-1.5 size-3.5" />
              {t.editorial.runLineEdit}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("beta-read")}
            >
              <ShieldCheckIcon className="mr-1.5 size-3.5" />
              {t.editorial.runBetaRead}
            </Button>
            {chapters.length > 0 && (
              <BatchEditorialDialog
                bookId={bookId}
                chapterNumbers={chapters.map((c) => c.chapterNumber)}
              />
            )}
          </div>
        </div>

        {/* Chapter Edit Pipeline */}
        {chapters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 overflow-hidden">
            {PIPELINE_STAGES.map((stage) => {
              const count = chapterStatusCounts[stage] ?? 0;
              return (
                <div
                  key={stage}
                  className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                >
                  <span className="text-muted-foreground whitespace-nowrap">{STAGE_LABELS[stage]}</span>
                  <Badge variant={count > 0 ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                    {count}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        {chapters.length > 0 && <FindingsFilters />}
      </div>

      {/* Empty state for zero chapters */}
      {chapters.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <BookOpenIcon className="size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">{t.editorial.noChapters}</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            {t.editorial.noChaptersDesc}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/books/${bookId}/setup`}>{t.editorial.goToSetup}</Link>
          </Button>
        </div>
      )}

      {/* Tabs — only when chapters exist */}
      {chapters.length > 0 && (
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(v as "findings" | "history" | "summary" | "handoff")
          }
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="mx-4 sm:mx-6 mt-2 w-fit">
            <TabsTrigger value="findings" className="gap-1.5">
              {t.editorial.tabFindings}
              {totalFindings > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                  {totalFindings}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">{t.editorial.tabHistory}</TabsTrigger>
            <TabsTrigger value="summary">{t.editorial.tabSummary}</TabsTrigger>
            <TabsTrigger value="handoff" className="gap-1.5">
              <HandshakeIcon className="size-3.5" />
              {t.editorial.tabHandoff}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="findings" className="flex-1 overflow-auto mt-0">
            <FindingsPanel bookId={bookId} chapters={chapters} />
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-auto mt-0">
            <EditHistoryTimeline bookId={bookId} />
          </TabsContent>

          <TabsContent value="summary" className="flex-1 overflow-auto mt-0">
            <EditorialSummary bookId={bookId} />
          </TabsContent>

          <TabsContent value="handoff" className="flex-1 overflow-hidden mt-0">
            <HandoffPanel bookId={bookId} chapters={chapters} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
