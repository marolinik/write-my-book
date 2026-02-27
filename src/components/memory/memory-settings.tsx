"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrainIcon } from "lucide-react";
import { useMemoryStats } from "@/hooks/use-memory";

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

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M tokens`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K tokens`;
  return `${tokens} tokens`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function MemorySettings() {
  const { data, isLoading } = useMemoryStats();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BrainIcon className="size-5 text-muted-foreground" />
          <div>
            <CardTitle>Memory System</CardTitle>
            <CardDescription>
              Vector memory powers AI agents with context from your books.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* Connection Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Qdrant Connection</span>
              {data.qdrantHealthy ? (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive">
                  Unreachable
                </Badge>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total Chunks</p>
                <p className="text-lg font-semibold">{data.totalChunks.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Searches</p>
                <p className="text-lg font-semibold">{data.totalSearches.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Indexed</p>
                <p className="text-sm font-medium">{timeAgo(data.lastIndexed)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Embedding Cost</p>
                <p className="text-sm font-medium">
                  {formatCost(data.embeddingCost)}
                </p>
              </div>
            </div>

            {/* Token Usage */}
            {data.embeddingTokens > 0 && (
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Total embedding usage: {formatTokens(data.embeddingTokens)}
                </p>
              </div>
            )}

            {/* Warning if unhealthy */}
            {!data.qdrantHealthy && (
              <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 dark:border-yellow-700 dark:bg-yellow-950/30">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  Qdrant is unreachable. Vector memory features (semantic search, context retrieval) are unavailable. Check that Qdrant is running and QDRANT_URL is correct.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Unable to load memory stats.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
