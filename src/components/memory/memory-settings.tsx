"use client";

import { useLanguage } from "@/components/providers/language-provider";
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
import { useLocale } from "@/components/providers/language-provider";
import { relativeTime } from "@/lib/i18n/relative-time";

/** "1.2M tokens" — the noun is the dictionary's, the SI prefix is not a word. */
function formatTokens(tokens: number, unit: string): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M ${unit}`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K ${unit}`;
  return `${tokens} ${unit}`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function MemorySettings() {
  const { t } = useLanguage();
  const locale = useLocale();
  const { data, isLoading } = useMemoryStats();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BrainIcon className="size-5 text-muted-foreground" />
          <div>
            <CardTitle>{t.workspaceUI.memorySystem}</CardTitle>
            <CardDescription>{t.memoryUI.vectorMemoryHint}</CardDescription>
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
              <span className="text-sm text-muted-foreground">{t.workspaceUI.qdrantConnection}</span>
              {data.qdrantHealthy ? (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t.memoryUI.connected}</Badge>
              ) : (
                <Badge variant="destructive">{t.memoryUI.unreachable}</Badge>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{t.workspaceUI.totalChunks}</p>
                <p className="text-lg font-semibold">{data.totalChunks.toLocaleString(locale)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.workspaceUI.totalSearches}</p>
                <p className="text-lg font-semibold">{data.totalSearches.toLocaleString(locale)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.workspaceUI.lastIndexed}</p>
                <p className="text-sm font-medium">{relativeTime(data.lastIndexed, locale, t.docLibrary)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.workspaceUI.embeddingCost}</p>
                <p className="text-sm font-medium">
                  {formatCost(data.embeddingCost)}
                </p>
              </div>
            </div>

            {/* Token Usage */}
            {data.embeddingTokens > 0 && (
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {t.memoryUI.totalEmbeddingUsage.replace(
                    "{tokens}",
                    formatTokens(data.embeddingTokens, t.agentUI.tokensAbbrev)
                  )}
                </p>
              </div>
            )}

            {/* Warning if unhealthy */}
            {!data.qdrantHealthy && (
              <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 dark:border-yellow-700 dark:bg-yellow-950/30">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">{t.memoryUI.qdrantUnreachable}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t.memoryUI.statsUnavailable}</p>
        )}
      </CardContent>
    </Card>
  );
}
