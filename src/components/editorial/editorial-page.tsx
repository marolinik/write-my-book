"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEditorialStore } from "@/stores/editorial-store";
import { useEditorialSummary } from "@/hooks/use-editorial";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { ChapterSelector } from "./chapter-selector";
import { FindingsFilters } from "./findings-filters";
import { FindingsPanel } from "./findings-panel";
import { EditorialSummary } from "./editorial-summary";
import { EditHistoryTimeline } from "./edit-history-timeline";
import { PenLineIcon, SparklesIcon, ShieldCheckIcon } from "lucide-react";

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
const STAGE_LABELS: Record<string, string> = {
  drafted: "Drafted",
  dev_edited: "Dev Edited",
  line_edited: "Line Edited",
  beta_read: "Beta Read",
  beta_passed: "Passed",
};

export function EditorialPage({ bookId, chapters }: EditorialPageProps) {
  const { activeTab, setActiveTab } = useEditorialStore();
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
      <div className="space-y-3 border-b px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-lg font-semibold">Editorial Review</h1>
          <ChapterSelector chapters={chapters} />
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("dev-edit")}
            >
              <PenLineIcon className="mr-1.5 size-3.5" />
              Run Dev Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("line-edit")}
            >
              <SparklesIcon className="mr-1.5 size-3.5" />
              Run Line Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("beta-read")}
            >
              <ShieldCheckIcon className="mr-1.5 size-3.5" />
              Run Beta Read
            </Button>
          </div>
        </div>

        {/* Chapter Edit Pipeline */}
        {chapters.length > 0 && (
          <div className="flex items-center gap-1">
            {PIPELINE_STAGES.map((stage) => {
              const count = chapterStatusCounts[stage] ?? 0;
              return (
                <div
                  key={stage}
                  className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                >
                  <span className="text-muted-foreground">{STAGE_LABELS[stage]}</span>
                  <Badge variant={count > 0 ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                    {count}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        <FindingsFilters />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          setActiveTab(v as "findings" | "history" | "summary")
        }
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="mx-6 mt-2 w-fit">
          <TabsTrigger value="findings" className="gap-1.5">
            Findings
            {totalFindings > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                {totalFindings}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
