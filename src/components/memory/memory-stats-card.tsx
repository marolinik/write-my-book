"use client";

import { useLanguage, useLocale } from "@/components/providers/language-provider";
import { relativeTime } from "@/lib/i18n/relative-time";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrainIcon, PauseCircleIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useBookMemoryStats, useRebuildIndex, useClearMemory } from "@/hooks/use-memory";
import { pluralNoun } from "@/lib/i18n/plural";
import { FREE_TIER } from "@/lib/billing/free-tier";

export function MemoryStatsCard({ bookId }: { bookId: string }) {
  const { t, language } = useLanguage();
  const locale = useLocale();
  const { data, isLoading } = useBookMemoryStats(bookId);
  const rebuild = useRebuildIndex();
  const clear = useClearMemory();

  function handleClear() {
    if (window.confirm(t.memoryUI.clearConfirm)) {
      clear.mutate(bookId);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <BrainIcon className="size-3.5" />{t.memoryUI.memory}</CardTitle>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => rebuild.mutate(bookId)}
              disabled={rebuild.isPending}
              title={t.workspaceUI.rebuildIndex}
            >
              <RefreshCwIcon className={`size-3.5 ${rebuild.isPending ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleClear}
              disabled={clear.isPending}
              title={t.workspaceUI.clearMemory}
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
                {pluralNoun(data.chunkCount, t.memoryUI.chunkOne, t.memoryUI.chunkMany, {
                  few: t.memoryUI.chunkFew,
                  language,
                })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.memoryUI.indexedAgo.replace("{when}", relativeTime(data.lastIndexed, locale, t.docLibrary))}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t.workspaceUI.notIndexed}</p>
        )}
        {data?.indexingPaused && <IndexingPausedNotice />}
      </CardContent>
    </Card>
  );
}

/**
 * P1-S06: the Free word cap paused indexing. The gate's contract is that the
 * pause is said wherever memory status renders — without this the card showed
 * stale memory as if it were current.
 */
export function IndexingPausedNotice() {
  const { t } = useLanguage();
  const locale = useLocale();
  return (
    <div className="mt-2 space-y-2 rounded-md border border-amber-300/60 bg-amber-50 p-2 dark:border-amber-700/50 dark:bg-amber-950/30">
      <p className="flex gap-1.5 text-xs text-amber-900 dark:text-amber-200">
        <PauseCircleIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {t.memoryUI.indexingPaused.replace(
            "{words}",
            FREE_TIER.maxAiEligibleWords.toLocaleString(locale)
          )}
        </span>
      </p>
      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
        <Link href="/settings/billing">{t.appUI.viewPlans}</Link>
      </Button>
    </div>
  );
}
