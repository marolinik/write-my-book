"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  BookOpenIcon,
  FileTextIcon,
  DownloadIcon,
  UploadIcon,
  BarChart3Icon,
  SearchCheckIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSeriesDetail } from "@/hooks/use-series";
import { useAgentStore } from "@/stores/agent-store";
import { SeriesBookManager } from "@/components/series/series-book-manager";
import { SeriesDocumentsPanel } from "@/components/series/series-documents-panel";
import { SeriesInheritancePanel } from "@/components/series/series-inheritance-panel";
import { SeriesSynthesisPanel } from "@/components/series/series-synthesis-panel";
import { SeriesProgressGrid } from "@/components/series/series-progress-grid";

type Tab = "overview" | "documents" | "inheritance" | "synthesis" | "analytics";

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: BookOpenIcon },
  { id: "documents", label: "Documents", icon: FileTextIcon },
  { id: "inheritance", label: "Inheritance", icon: DownloadIcon },
  { id: "synthesis", label: "Synthesis", icon: UploadIcon },
  { id: "analytics", label: "Analytics", icon: BarChart3Icon },
];

export default function SeriesDetailPage() {
  const params = useParams();
  const seriesId = params?.seriesId as string;
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data: series, isLoading } = useSeriesDetail(seriesId);
  const openWithWorkflow = useAgentStore((s) => s.openWithWorkflow);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">Loading series...</p>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">Series not found.</p>
      </div>
    );
  }

  const books = series.books.map((b) => ({
    id: b.id,
    bookNumber: b.bookNumber,
    name: b.name,
    status: b.status,
    wordCount: b.wordCount,
  }));

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold">{series.title}</h1>
            <Badge variant="outline">{series.seriesType}</Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openWithWorkflow("check-series-continuity")}
          >
            <SearchCheckIcon className="mr-1 size-4" />
            Check Continuity
          </Button>
        </div>
        {series.genre && (
          <p className="text-sm text-muted-foreground mt-1">{series.genre}</p>
        )}
        {series.description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            {series.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {series.books.length} / {series.plannedBooks} books
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-b-none border-b-2 ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon className="mr-1.5 size-4" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-8">
          <SeriesBookManager seriesId={seriesId} books={books} />
          <div>
            <h3 className="text-sm font-medium mb-3">Series Documents</h3>
            <SeriesDocumentsPanel documents={series.documents ?? []} />
          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <SeriesDocumentsPanel documents={series.documents ?? []} />
      )}

      {activeTab === "inheritance" && (
        <SeriesInheritancePanel seriesId={seriesId} books={books} />
      )}

      {activeTab === "synthesis" && (
        <SeriesSynthesisPanel seriesId={seriesId} />
      )}

      {activeTab === "analytics" && (
        <SeriesProgressGrid seriesId={seriesId} />
      )}
    </div>
  );
}
