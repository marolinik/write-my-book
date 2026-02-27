"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface GlobalMemoryStats {
  totalChunks: number;
  totalSearches: number;
  lastIndexed: string | null;
  qdrantHealthy: boolean;
  embeddingCost: number;
  embeddingTokens: number;
}

interface BookMemoryStats {
  bookId: string;
  chunkCount: number;
  lastIndexed: string | null;
  embeddingCost: number;
  embeddingTokens: number;
}

export function useMemoryStats() {
  return useQuery<GlobalMemoryStats>({
    queryKey: ["memory-stats"],
    queryFn: async () => {
      const res = await fetch("/api/memory/stats");
      if (!res.ok) throw new Error("Failed to fetch memory stats");
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
      if (!res.ok) throw new Error("Failed to fetch book memory stats");
      return res.json();
    },
    enabled: !!bookId,
  });
}

export function useRebuildIndex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookId: string) => {
      const res = await fetch("/api/memory/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to rebuild index");
      }
      return res.json();
    },
    onSuccess: (_data, bookId) => {
      qc.invalidateQueries({ queryKey: ["memory-stats"] });
      qc.invalidateQueries({ queryKey: ["memory-stats", bookId] });
      toast.success("Memory index rebuilt successfully");
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useClearMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookId: string) => {
      const res = await fetch("/api/memory/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, confirm: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to clear memory");
      }
      return res.json();
    },
    onSuccess: (_data, bookId) => {
      qc.invalidateQueries({ queryKey: ["memory-stats"] });
      qc.invalidateQueries({ queryKey: ["memory-stats", bookId] });
      toast.success("Book memory cleared");
    },
    onError: (err) => toast.error(err.message),
  });
}
