"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SparklesIcon, ChevronRightIcon } from "lucide-react";
import { YearInWritingWrapped } from "@/components/book/year-in-writing-wrapped";

interface WrappedData {
  year: number;
  totalWords: number;
  totalChapters: number;
  totalSessions: number;
  booksWorkedOn: number;
  longestStreak: number;
  totalDaysWriting: number;
  favoriteWritingHour: number;
  topGenre: string;
  wordsPerMonth: number[];
  peakMonth: number;
  totalAICost: number;
  findingsReviewed: number;
  writerPersonality: string;
}

export function WritingWrappedCard({ authorName }: { authorName?: string }) {
  const [showWrapped, setShowWrapped] = useState(false);

  const { data } = useQuery<WrappedData>({
    queryKey: ["writing-wrapped"],
    queryFn: () => fetchJson("/api/writing-wrapped"),
    enabled: showWrapped,
  });

  if (showWrapped && data) {
    return (
      <div className="mb-8">
        <YearInWritingWrapped data={data} authorName={authorName} />
        <div className="flex justify-center mt-4">
          <Button variant="outline" size="sm" onClick={() => setShowWrapped(false)}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="mb-8 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setShowWrapped(true)}>
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <SparklesIcon className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">{new Date().getFullYear()} Year in Writing</p>
            <p className="text-xs text-muted-foreground">See your writing journey highlights</p>
          </div>
        </div>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
