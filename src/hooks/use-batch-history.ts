"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

/**
 * D5 — the reader for `GET /api/books/[id]/batch`.
 *
 * The route returns the last twenty whole-book runs, and every non-terminal
 * row has already been corrected against the live children by
 * `deriveLiveBatchFields` (D-120). Nothing here recomputes any of that: the
 * numbers arrive honest and are rendered as they came.
 */

export interface BatchHistoryRow {
  id: string;
  status: string;
  workflowIds: string[];
  chapterStart: number | null;
  chapterEnd: number | null;
  budgetCapUsd: number | null;
  spentUsd: number | null;
  halted: boolean;
  haltReason: string | null;
  scheduledFor: string | null;
  childCount: number;
  completedCount: number;
  failedCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface BatchHistoryResponse {
  batches: BatchHistoryRow[];
}

/**
 * A run that is still going is worth re-reading; a finished list is not. The
 * poll is therefore conditional on what came back, not on a timer that runs
 * for as long as the page is open.
 */
const LIVE_POLL_MS = 10_000;

export function useBatchHistory(bookId: string, enabled = true) {
  return useQuery({
    queryKey: ["batch-history", bookId],
    queryFn: () => fetchJson<BatchHistoryResponse>(`/api/books/${bookId}/batch`),
    enabled: enabled && !!bookId,
    refetchInterval: (query) => {
      const rows = query.state.data?.batches ?? [];
      const live = rows.some((row) => !row.completedAt && !row.halted);
      return live ? LIVE_POLL_MS : false;
    },
  });
}
