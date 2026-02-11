"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ChapterPreviewItem {
  number: number;
  title: string;
  wordCount: number;
}

interface ChapterPreviewListProps {
  chapters: ChapterPreviewItem[];
  totalWordCount: number;
}

export function ChapterPreviewList({
  chapters,
  totalWordCount,
}: ChapterPreviewListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {chapters.length} chapter{chapters.length !== 1 ? "s" : ""} detected
        </span>
        <Badge variant="secondary">
          {totalWordCount.toLocaleString()} words
        </Badge>
      </div>

      <div className="space-y-1">
        {chapters.map((ch) => (
          <Card key={ch.number} className="bg-muted/30">
            <CardContent className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-6 text-right">
                  {ch.number}
                </span>
                <span className="text-sm">{ch.title}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {ch.wordCount.toLocaleString()} words
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
