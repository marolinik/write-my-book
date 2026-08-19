"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrainIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useBookMemoryStats, useRebuildIndex, useClearMemory } from "@/hooks/use-memory";
import { pluralNoun } from "@/lib/i18n/plural";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function MemoryStatsCard({ bookId }: { bookId: string }) {
  const { data, isLoading } = useBookMemoryStats(bookId);
  const rebuild = useRebuildIndex();
  const clear = useClearMemory();

  function handleClear() {
    if (window.confirm("Clear all vector memory for this book? This removes indexed content from the memory system. You can rebuild it later.")) {
      clear.mutate(bookId);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <BrainIcon className="size-3.5" />
            Memory
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => rebuild.mutate(bookId)}
              disabled={rebuild.isPending}
              title="Rebuild index"
            >
              <RefreshCwIcon className={`size-3.5 ${rebuild.isPending ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleClear}
              disabled={clear.isPending}
              title="Clear memory"
            >
              <Trash2Icon className="size-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        ) : data && data.chunkCount > 0 ? (
          <div>
            <div className="text-xl font-bold">
              {data.chunkCount}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                {/* D-179: never "1 chunks" — the D-163 pluralisation family. */}
                {pluralNoun(data.chunkCount, "chunk", "chunks")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Indexed {timeAgo(data.lastIndexed)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not indexed</p>
        )}
      </CardContent>
    </Card>
  );
}
