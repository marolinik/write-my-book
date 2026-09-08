"use client";

// UDG round-4 (Olivera/Filip): consolidated series-level continuity view shown
// on the series overview tab. Loads the SERIES_CONTINUITY document content and
// lists each volume's status with the next volume to start highlighted — the
// cross-book view a series publisher wants, not just a per-book link.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, SearchCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage } from "@/components/providers/language-provider";
import { computeSeriesNextBook, isBookFinished } from "@/lib/series/next-book";

interface SeriesBooksProp {
  id: string;
  bookNumber: number;
  name: string;
  status: string;
  wordCount: number;
}

export function SeriesContinuityPanel({
  seriesId,
  books,
  seriesTitle,
}: {
  seriesId: string;
  books: SeriesBooksProp[];
  seriesTitle: string;
}) {
  const { t } = useLanguage();
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);

  // Load the series document list, then fetch content of the SERIES_CONTINUITY doc.
  const { data: docsList } = useQuery({
    queryKey: ["series-documents", seriesId],
    queryFn: async () => {
      const res = await fetch(`/api/series/${seriesId}/documents`);
      if (!res.ok) throw new Error("Failed to list series documents");
      return res.json() as Promise<Array<Record<string, unknown>>>;
    },
  });

  const continuityDoc = useMemo(
    () =>
      (docsList ?? []).find((d) => d.type === "SERIES_CONTINUITY") as
        | { id: string; title: string | null; currentVersion?: number }
        | undefined,
    [docsList]
  );

  const { data: contentData, isLoading: contentLoading } = useQuery({
    queryKey: ["series-doc-content", seriesId, continuityDoc?.id],
    queryFn: async () => {
      const res = await fetch(`/api/series/${seriesId}/documents/${continuityDoc!.id}`);
      if (!res.ok) throw new Error("Failed to load continuity document");
      return res.json() as Promise<{
        document: Record<string, unknown>;
        content?: string;
      }>;
    },
    enabled: !!continuityDoc?.id,
  });

  const content = contentData?.content ?? "";
  const next = computeSeriesNextBook(books);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">
          {t.bookDevelopment.nextBookTitle}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openWithWorkflow("check-series-continuity")}
        >
          <SearchCheckIcon className="mr-1 size-4" />
          {t.bookDevelopment.continuityLink}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {books.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...books]
              .sort((a, b) => a.bookNumber - b.bookNumber)
              .map((b) => {
                const done = isBookFinished(b.status);
                const isNext = next.nextBookNumber === b.bookNumber;
                return (
                  <li
                    key={b.id}
                    className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${
                      isNext
                        ? "border-primary/50 bg-primary/[0.04]"
                        : done
                          ? "border-green-500/30 bg-green-500/[0.03]"
                          : ""
                    }`}
                  >
                    <span className="min-w-0 truncate font-medium">
                      {b.bookNumber}. {b.name}
                    </span>
                    <Badge
                      variant={isNext ? "default" : done ? "secondary" : "outline"}
                      className="shrink-0 text-[10px] capitalize"
                    >
                      {isNext
                        ? t.bookDevelopment.nextStart
                        : done
                          ? t.bookDevelopment.done
                          : t.bookDevelopment.inProgress}
                    </Badge>
                  </li>
                );
              })}
          </ul>
        )}

        {continuityDoc && (
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium">
                {continuityDoc.title ?? t.bookDevelopment.continuity}
              </p>
              {continuityDoc.currentVersion != null && (
                <span className="text-[10px] text-muted-foreground">
                  v{continuityDoc.currentVersion}
                </span>
              )}
            </div>
            {contentLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                {t.common.loading}
              </div>
            ) : content ? (
              <p className="whitespace-pre-wrap text-xs leading-relaxed">
                {content}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {seriesTitle} — {t.bookDevelopment.nextBookDesc}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}