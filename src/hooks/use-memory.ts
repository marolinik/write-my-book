"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/components/providers/language-provider";
import { responseError, describeApiError, LocalizedError } from "@/lib/api/describe-api-error";
import { rebuildOutcome, type RebuildResponse } from "@/lib/memory/rebuild-outcome";

interface GlobalMemoryStats {
  totalChunks: number;
  totalSearches: number;
  lastIndexed: string | null;
  qdrantHealthy: boolean;
  embeddingCost: number;
  embeddingTokens: number;
  /** P1-S06: the Free word cap has paused prose indexing. */
  indexingPaused?: boolean;
}

interface BookMemoryStats {
  bookId: string;
  chunkCount: number;
  lastIndexed: string | null;
  embeddingCost: number;
  embeddingTokens: number;
  /** P1-S06: the Free word cap has paused prose indexing. */
  indexingPaused?: boolean;
}

export function useMemoryStats() {
  return useQuery<GlobalMemoryStats>({
    queryKey: ["memory-stats"],
    queryFn: async () => {
      const res = await fetch("/api/memory/stats");
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    refetchInterval: 30000,
  });
}

export function useBookMemoryStats(bookId: string) {
  return useQuery<BookMemoryStats>({
    queryKey: ["memory-stats", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/memory/stats?bookId=${bookId}`);
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    enabled: !!bookId,
  });
}

export function useRebuildIndex() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: async (bookId: string) => {
      const res = await fetch("/api/memory/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // The gate's two answers are the product explaining its own limit, so
        // they are said in the writer's language; anything else is a failure
        // whose server reason is the best thing to show.
        if (res.status === 402 || err.indexingPaused === true) {
          throw new LocalizedError(t.toasts.memoryIndexingPaused);
        }
        if (res.status === 503) throw new LocalizedError(t.toasts.memoryIndexingUnavailable);
        throw await responseError(res, err);
      }
      return res.json() as Promise<RebuildResponse>;
    },
    onSuccess: (data, bookId) => {
      qc.invalidateQueries({ queryKey: ["memory-stats"] });
      qc.invalidateQueries({ queryKey: ["memory-stats", bookId] });
      const outcome = rebuildOutcome(data, t);
      if (outcome.ok) toast.success(outcome.text);
      else toast.error(outcome.text);
    },
    onError: (err) => toast.error(describeApiError(err, t)),
  });
}

export function useClearMemory() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: async (bookId: string) => {
      const res = await fetch("/api/memory/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, confirm: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw await responseError(res, err);
      }
      return res.json();
    },
    onSuccess: (_data, bookId) => {
      qc.invalidateQueries({ queryKey: ["memory-stats"] });
      qc.invalidateQueries({ queryKey: ["memory-stats", bookId] });
      toast.success(t.toasts.bookMemoryCleared);
    },
    onError: (err) => toast.error(describeApiError(err, t)),
  });
}
