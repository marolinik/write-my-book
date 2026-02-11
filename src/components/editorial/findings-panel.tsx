"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFindings } from "@/hooks/use-editorial";
import { useEditorialStore } from "@/stores/editorial-store";
import { FindingCard } from "./finding-card";

interface FindingsPanelProps {
  bookId: string;
}

export function FindingsPanel({ bookId }: FindingsPanelProps) {
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

  if (findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No findings match your filters
        </p>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          Reset filters
        </Button>
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
            <FindingCard key={finding.id} finding={finding} bookId={bookId} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
