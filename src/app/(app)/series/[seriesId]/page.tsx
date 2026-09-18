"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  BookOpenIcon,
  FileTextIcon,
  DownloadIcon,
  UploadIcon,
  BarChart3Icon,
  SearchIcon,
  NetworkIcon,
  GlobeIcon,
  SearchCheckIcon,
  LibraryIcon,
  PenLineIcon,
  HashIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { getDocumentTypeLabels } from "@/lib/agents/tool-labels";
import { useSeriesDetail } from "@/hooks/use-series";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage, useLocale } from "@/components/providers/language-provider";
import { SeriesBookManager } from "@/components/series/series-book-manager";
import { SeriesDocumentsPanel } from "@/components/series/series-documents-panel";
import { SeriesInheritancePanel } from "@/components/series/series-inheritance-panel";
import { SeriesSynthesisPanel } from "@/components/series/series-synthesis-panel";
import { SeriesProgressGrid } from "@/components/series/series-progress-grid";
import { SeriesContinuityPanel } from "@/components/series/series-continuity-panel";
import { SeriesOmnibusPanel } from "@/components/series/series-omnibus-panel";
import { SeriesStructurePanel } from "@/components/series/series-structure-panel";
import { SeriesMarketPanel } from "@/components/series/series-market-panel";

type Tab =
  | "overview"
  | "documents"
  | "continuity"
  | "structure"
  | "market"
  | "inheritance"
  | "synthesis"
  | "analytics";

/**
 * Tab labels come from the dictionary — they were hardcoded English, and the
 * series had no Continuity, Structure or Market of its own even though the
 * book does (S3-17).
 */
const TAB_ORDER: Array<{ id: Tab; labelKey: string; icon: React.ElementType }> = [
  { id: "overview", labelKey: "seriesTabOverview", icon: BookOpenIcon },
  { id: "documents", labelKey: "seriesTabDocuments", icon: FileTextIcon },
  { id: "continuity", labelKey: "seriesTabContinuity", icon: SearchIcon },
  { id: "structure", labelKey: "seriesTabStructure", icon: NetworkIcon },
  { id: "market", labelKey: "seriesTabMarket", icon: GlobeIcon },
  { id: "inheritance", labelKey: "seriesTabInheritance", icon: DownloadIcon },
  { id: "synthesis", labelKey: "seriesTabSynthesis", icon: UploadIcon },
  { id: "analytics", labelKey: "seriesTabAnalytics", icon: BarChart3Icon },
];

/** Expected series document types and their labels. */
// Labels come from tool-labels.ts, which already carries every document type
// in all seven languages — these were hardcoded English (S3-15).
const SERIES_DOC_TYPES = [
  { type: "SERIES_BIBLE" },
  { type: "SERIES_ARCHITECTURE" },
  { type: "SERIES_FINGERPRINT" },
];

export default function SeriesDetailPage() {
  const params = useParams();
  const seriesId = params?.seriesId as string;
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data: series, isLoading } = useSeriesDetail(seriesId);
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const { t, language } = useLanguage();
  const locale = useLocale();
  const typeLabels = getDocumentTypeLabels(language);

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
        {TAB_ORDER.map((tab) => {
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
              {t.bookUI[tab.labelKey as keyof typeof t.bookUI]}
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
                <CardTitle className="text-sm font-medium">{t.screens.totalBooks}</CardTitle>
                <LibraryIcon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalBooks}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t.screens.totalChapters}</CardTitle>
                <HashIcon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalChapters}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t.screens.totalWords}</CardTitle>
                <PenLineIcon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalWords.toLocaleString(locale)}</div>
              </CardContent>
            </Card>
          </div>

          {/* UDG round-9 (Olivera/Igor): series cover upload + whole-series omnibus
              export + printable report. */}
          <SeriesOmnibusPanel
            seriesId={seriesId}
            coverUrl={series.coverUrl ?? null}
            seriesHasBooks={books.length > 0}
          />

          {/* Book list */}
          <SeriesBookManager seriesId={seriesId} books={books} />

          {/* Series documents */}
          <div>
            <h3 className="text-sm font-medium mb-3">{t.screens.seriesDocuments}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {SERIES_DOC_TYPES.map(({ type }) => {
                const doc = docsByType.get(type);
                const label = typeLabels[type] ?? type;

                const body = (
                  <CardContent className="py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    {doc ? (
                      <p className="text-xs text-muted-foreground">
                        v{doc.currentVersion} — {new Date(doc.updatedAt).toLocaleDateString(locale)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t.bookUI.seriesDocPending}
                      </p>
                    )}
                  </CardContent>
                );

                // A document that exists is a document you can open (S3-15).
                return doc ? (
                  <Link
                    key={type}
                    href={`/series/${seriesId}/documents/${doc.id}`}
                    className="block"
                  >
                    <Card className="transition-colors hover:border-primary/50">
                      {body}
                    </Card>
                  </Link>
                ) : (
                  <Card key={type} className="border-dashed">
                    {body}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Cross-book continuity (UDG round-4): consolidated per-volume state +
              the SERIES_CONTINUITY document, plus the "next book to start". */}
          <SeriesContinuityPanel
            seriesId={seriesId}
            books={books}
            seriesTitle={series.title}
          />
        </div>
      )}

      {activeTab === "continuity" && (
        <SeriesContinuityPanel
          seriesId={seriesId}
          books={books}
          seriesTitle={series.title}
        />
      )}

      {activeTab === "structure" && <SeriesStructurePanel books={books} />}

      {activeTab === "market" && <SeriesMarketPanel books={books} />}

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
