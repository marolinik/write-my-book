"use client";

import { Badge } from "@/components/ui/badge";
import { useLanguage, useLocale } from "@/components/providers/language-provider";
import { relativeTime } from "@/lib/i18n/relative-time";
import { useBatchHistory, type BatchHistoryRow } from "@/hooks/use-batch-history";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { Loader2 } from "lucide-react";

/**
 * D5 — past whole-book runs.
 *
 * `GET /api/books/[id]/batch` has returned this list, with every non-terminal
 * row corrected against its live children, since batch shipped. Nothing read
 * it: a writer who queued an overnight run could watch it while the dialog was
 * open and never see it again. No record of what a finished run cost, and no
 * way to find out why one stopped.
 *
 * The numbers here are rendered exactly as the route sent them. Nothing is
 * recomputed on the client, because a second implementation of "how far along
 * is this run" is how the two answers drift apart.
 */

/** What a row's state is called, in the writer's language. */
function statusLabel(row: BatchHistoryRow, t: ReturnType<typeof useLanguage>["t"]): string {
  if (row.halted) return t.batchEditorial.historyHalted;
  if (row.failedCount > 0 && row.completedAt) return t.batchEditorial.historyFailed;
  if (row.completedAt) return t.batchEditorial.historyDone;
  if (row.scheduledFor && !row.startedAt) return t.batchEditorial.historyScheduled;
  return t.batchEditorial.historyRunning;
}

function statusTone(row: BatchHistoryRow): "default" | "secondary" | "destructive" | "outline" {
  if (row.halted) return "destructive";
  if (row.completedAt) return row.failedCount > 0 ? "destructive" : "secondary";
  return "default";
}

/** Money as the writer's locale writes it, never as a bare number. */
function money(value: number | null, locale: string): string {
  if (value === null) return "";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template
  );
}

export function BatchHistory({ bookId }: { bookId: string }) {
  const { t, language } = useLanguage();
  const locale = useLocale();
  const agentStrings = getAgentStrings(language);
  const { data, isLoading, isError } = useBatchHistory(bookId);
  const rows = data?.batches ?? [];

  return (
    <section aria-labelledby="batch-history-heading" className="space-y-3">
      <h2 id="batch-history-heading" className="text-sm font-medium">
        {t.batchEditorial.history}
      </h2>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t.common.loading}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">{t.batchEditorial.historyError}</p>
      ) : rows.length === 0 ? (
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          {t.batchEditorial.historyEmpty}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((row) => {
            const scope =
              row.chapterStart !== null && row.chapterEnd !== null
                ? fill(t.batchEditorial.historyChapterRange, {
                    a: row.chapterStart,
                    b: row.chapterEnd,
                  })
                : t.batchEditorial.historyWholeBook;
            const spend =
              row.budgetCapUsd !== null
                ? fill(t.batchEditorial.historySpend, {
                    spent: money(row.spentUsd ?? 0, locale),
                    cap: money(row.budgetCapUsd, locale),
                  })
                : row.spentUsd !== null
                  ? fill(t.batchEditorial.historySpendNoCap, {
                      spent: money(row.spentUsd, locale),
                    })
                  : null;
            const passes = row.workflowIds
              .map(
                (id) =>
                  (agentStrings.workflows as Record<string, string | undefined>)[id] ?? id
              )
              .join(", ");

            return (
              <li key={row.id} className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusTone(row)}>{statusLabel(row, t)}</Badge>
                    <span className="text-sm">{scope}</span>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(row.createdAt, locale, t.docLibrary)}
                    </span>
                  </div>
                  {passes && <p className="truncate text-xs text-muted-foreground">{passes}</p>}
                  {row.halted && row.haltReason && (
                    <p className="text-xs text-destructive">
                      {fill(t.batchEditorial.historyHaltedBecause, { reason: row.haltReason })}
                    </p>
                  )}
                </div>

                <div className="shrink-0 space-y-1 text-left sm:text-right">
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {fill(t.batchEditorial.historyProgress, {
                      done: row.completedCount,
                      total: row.childCount,
                    })}
                    {row.failedCount > 0 &&
                      `, ${fill(t.batchEditorial.historyFailures, { n: row.failedCount })}`}
                  </p>
                  {spend && <p className="text-xs tabular-nums">{spend}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
