"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEditorialStore } from "@/stores/editorial-store";
import { ChapterSelector } from "./chapter-selector";
import { FindingsFilters } from "./findings-filters";
import { FindingsPanel } from "./findings-panel";
import { EditorialSummary } from "./editorial-summary";
import { EditHistoryTimeline } from "./edit-history-timeline";

interface EditorialPageProps {
  bookId: string;
  chapters: Array<{
    id: string;
    chapterNumber: number;
    title: string | null;
    status: string;
  }>;
}

export function EditorialPage({ bookId, chapters }: EditorialPageProps) {
  const { activeTab, setActiveTab } = useEditorialStore();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-2 border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Editorial Review</h1>
          <ChapterSelector chapters={chapters} />
        </div>
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
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="flex-1 overflow-auto mt-0">
          <FindingsPanel bookId={bookId} />
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
