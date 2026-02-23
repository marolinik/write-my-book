"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFindings } from "@/hooks/use-editorial";
import type { FindingItem } from "@/hooks/use-editorial";
import { useEditorialStore } from "@/stores/editorial-store";
import { useEditorPaneStore } from "@/stores/editor-store";
import { FindingCard } from "./finding-card";

interface ChapterInfo {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
}

interface FindingsPanelProps {
  bookId: string;
  chapters?: ChapterInfo[];
}

export function FindingsPanel({ bookId, chapters }: FindingsPanelProps) {
  const router = useRouter();
  const setScrollToText = useEditorPaneStore("primary", (s) => s.setScrollToText);
  const { filters, selectedChapter, resetFilters } = useEditorialStore();

  const queryFilters = {
    ...filters,
    chapterNumber: selectedChapter,
  };

  const { data, isLoading } = useFindings(bookId, queryFilters);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const findings = data?.findings ?? [];
  const total = data?.total ?? 0;

  const handleShowInText = (finding: FindingItem) => {
    const text = finding.originalText ?? finding.locationStart;
    if (!text) return;

    // Find the chapter to navigate to
    const chapter = chapters?.find(
      (ch) => ch.chapterNumber === finding.chapterNumber
    );
    if (!chapter) return;

    // Set the text to scroll to, then navigate to the chapter editor
    setScrollToText(text);
    router.push(`/books/${bookId}/chapters/${chapter.id}`);
  };

  // Determine if any filters are active
  const hasActiveFilters =
    filters.severity !== null ||
    filters.category !== null ||
    filters.status !== null ||
    filters.agentType !== null ||
    selectedChapter !== null;

  if (findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        {hasActiveFilters ? (
          <>
            <p className="text-sm text-muted-foreground">
              No findings match your filters
            </p>
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Reset filters
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">No editorial findings yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Run a Dev Edit, Line Edit, or Beta Read workflow on your chapters
              to generate editorial findings.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <span className="text-sm font-medium">Findings</span>
        <Badge variant="secondary">{total}</Badge>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {findings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              bookId={bookId}
              onShowInText={chapters ? handleShowInText : undefined}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
