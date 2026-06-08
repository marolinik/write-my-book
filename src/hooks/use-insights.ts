"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

// ─── Types ───────────────────────────────────────────────────────

export interface InsightItem {
  id: string;
  bookId: string;
  sourceSessionId: string | null;
  sourceAgentType: string;
  insightType: string;
  status: string;
  domain: string;
  summary: string;
  detail: string;
  targetAgents: string[];
  chapterScope: number[];
  resolvedBy: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InsightsResponse {
  insights: InsightItem[];
  total: number;
}

interface InsightFilters {
  status?: string;
  domain?: string;
}

// ─── Hooks ───────────────────────────────────────────────────────

function buildQueryString(filters: InsightFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.domain) params.set("domain", filters.domain);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Fetch insights for a book with optional status/domain filters. */
export function useBookInsights(
  bookId: string,
  options?: InsightFilters
) {
  const filters = options ?? {};
  return useQuery({
    queryKey: ["insights", bookId, filters],
    queryFn: () =>
      fetchJson<InsightsResponse>(
        `/api/books/${bookId}/insights${buildQueryString(filters)}`
      ),
    enabled: !!bookId,
  });
}

/** Dismiss an insight. */
export function useDismissInsight(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (insightId: string) =>
      fetchJson(`/api/books/${bookId}/insights/${insightId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["insights", bookId] });
    },
  });
}

/** Return count of active insights for a book. */
export function useInsightCount(bookId: string) {
  const { data } = useBookInsights(bookId, { status: "active" });
  return data?.total ?? 0;
}
