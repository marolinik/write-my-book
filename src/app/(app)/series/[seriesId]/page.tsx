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
  LibraryIcon,
  PenLineIcon,
  HashIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSeriesDetail } from "@/hooks/use-series";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage, useLocale } from "@/components/providers/language-provider";
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

/** Expected series document types and their labels. */
const SERIES_DOC_TYPES = [
  { type: "SERIES_BIBLE", label: "Series Bible" },
  { type: "SERIES_ARCHITECTURE", label: "Series Architecture" },
  { type: "SERIES_FINGERPRINT", label: "Series Fingerprint" },
];

export default function SeriesDetailPage() {
  const params = useParams();
  const seriesId = params?.seriesId as string;
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data: series, isLoading } = useSeriesDetail(seriesId);
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const { t } = useLanguage();
  const locale = useLocale();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">{t.common.error}</p>
      </div>
    );
  }

  const books = series.books.map((b: { id: string; bookNumber: number; name: string; status: string; wordCount: number; _count?: { chapters: number } }) => ({
    id: b.id,
    bookNumber: b.bookNumber,
    name: b.name,
    status: b.status,
    wordCount: b.wordCount,
    chapterCount: b._count?.chapters ?? 0,
  }));

  const totalBooks = books.length;
  const totalWords = books.reduce((sum: number, b: { wordCount: number }) => sum + b.wordCount, 0);
  const totalChapters = books.reduce((sum: number, b: { chapterCount: number }) => sum + b.chapterCount, 0);

  // Map existing series documents by type for the doc cards section
  const docsByType = new Map<string, { id: string; title: string | null; currentVersion: number; updatedAt: string }>();
  for (const doc of series.documents ?? []) {
    docsByType.set(doc.type, doc);
  }

  // Check for continuity findings across all books in the series
  // (displayed when continuity check has been run)
  const hasContinuityDocs = docsByType.has("SERIES_BIBLE") || docsByType.has("SERIES_ARCHITECTURE");

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
            Cross-Book Continuity Check
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
          {/* Stats section */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Books</CardTitle>
                <LibraryIcon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalBooks}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Chapters</CardTitle>
                <HashIcon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalChapters}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Words</CardTitle>
                <PenLineIcon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalWords.toLocaleString(locale)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Book list */}
          <SeriesBookManager seriesId={seriesId} books={books} />

          {/* Series documents */}
          <div>
            <h3 className="text-sm font-medium mb-3">Series Documents</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {SERIES_DOC_TYPES.map(({ type, label }) => {
                const doc = docsByType.get(type);
                return (
                  <Card key={type} className={doc ? "" : "border-dashed"}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <FileTextIcon className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      {doc ? (
                        <p className="text-xs text-muted-foreground">
                          v{doc.currentVersion} — updated {new Date(doc.updatedAt).toLocaleDateString(locale)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Will be generated when 2+ books have foundational documents
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Cross-book continuity status */}
          <div>
            <h3 className="text-sm font-medium mb-3">Cross-Book Continuity</h3>
            {hasContinuityDocs ? (
              <Card>
                <CardContent className="py-3">
                  <p className="text-sm text-muted-foreground">
                    Series documents exist. Run a cross-book continuity check to verify consistency across all books.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => openWithWorkflow("check-series-continuity")}
                  >
                    <SearchCheckIcon className="mr-1 size-4" />
                    Run Cross-Book Continuity Check
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-3">
                  <p className="text-sm text-muted-foreground">
                    Cross-book continuity checking will be available once series documents have been generated.
                  </p>
                </CardContent>
              </Card>
            )}
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
