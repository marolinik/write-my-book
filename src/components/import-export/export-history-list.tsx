"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useExportHistory, useDownloadExport } from "@/hooks/use-export";
import type { ExportHistoryItem } from "@/hooks/use-export";
import { DownloadIcon, FileTextIcon, FileIcon, BookOpenIcon } from "lucide-react";

interface ExportHistoryListProps {
  bookId: string;
}

function formatIcon(format: string) {
  switch (format) {
    case "docx":
      return <FileTextIcon className="size-4" />;
    case "pdf":
      return <FileIcon className="size-4" />;
    case "epub":
      return <BookOpenIcon className="size-4" />;
    default:
      return <FileTextIcon className="size-4" />;
  }
}

function parseTimestamp(filename: string): string {
  // Filename format: Name-2026-01-15T12-30-00.docx
  const match = filename.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return filename;
  const [, date, h, m, s] = match;
  return `${date} ${h}:${m}:${s}`;
}

export function ExportHistoryList({ bookId }: ExportHistoryListProps) {
  const { data, isLoading } = useExportHistory(bookId);
  const download = useDownloadExport(bookId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }

  const exports = data?.exports ?? [];

  if (exports.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No exports yet. Create your first export above.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {exports.map((item: ExportHistoryItem) => (
        <Card key={item.filename} className="bg-muted/30">
          <CardContent className="flex items-center gap-3 p-3">
            {formatIcon(item.format)}
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{item.filename}</p>
              <p className="text-xs text-muted-foreground">
                {parseTimestamp(item.filename)}
              </p>
            </div>
            <Badge variant="outline" className="uppercase text-xs">
              {item.format}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => download(item.filename)}
            >
              <DownloadIcon className="size-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
