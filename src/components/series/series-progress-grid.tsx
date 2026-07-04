"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSeriesAnalytics } from "@/hooks/use-series";
import { useLocale } from "@/components/providers/language-provider";

interface SeriesProgressGridProps {
  seriesId: string;
}

const STATUS_COLORS: Record<string, string> = {
  concept: "bg-gray-200 dark:bg-gray-700",
  planning: "bg-blue-200 dark:bg-blue-900",
  writing: "bg-yellow-200 dark:bg-yellow-900",
  editing: "bg-orange-200 dark:bg-orange-900",
  beta: "bg-purple-200 dark:bg-purple-900",
  export: "bg-green-200 dark:bg-green-900",
  complete: "bg-emerald-300 dark:bg-emerald-800",
};

export function SeriesProgressGrid({ seriesId }: SeriesProgressGridProps) {
  const locale = useLocale();
  const { data, isLoading } = useSeriesAnalytics(seriesId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading analytics...</p>;
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No analytics data available.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">{data.totals.totalBooks}</p>
            <p className="text-xs text-muted-foreground">Books</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">
              {data.totals.totalWordCount.toLocaleString(locale)}
            </p>
            <p className="text-xs text-muted-foreground">Total Words</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">{data.totals.totalChapters}</p>
            <p className="text-xs text-muted-foreground">Chapters</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">{data.totals.totalDocuments}</p>
            <p className="text-xs text-muted-foreground">Documents</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-book details */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Per-Book Progress</h3>
        {data.books.map((book) => (
          <Card key={book.bookId}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  Book {book.bookNumber}: {book.name}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`text-xs capitalize ${STATUS_COLORS[book.status] ?? ""}`}
                >
                  {book.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>{book.wordCount.toLocaleString(locale)} words</span>
                <span>{book.chapterCount} chapters</span>
                <span>{book.documentCount} documents</span>
              </div>
              {Object.keys(book.chapterStatusCounts).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(book.chapterStatusCounts).map(
                    ([status, count]) => (
                      <Badge
                        key={status}
                        variant="secondary"
                        className="text-xs"
                      >
                        {status.replace(/_/g, " ")}: {count}
                      </Badge>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
