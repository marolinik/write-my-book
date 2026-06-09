"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

export interface DailyWordCount {
  date: string;
  words: number;
}

export interface WritingGoal {
  id: string;
  bookId: string;
  type: "daily" | "weekly" | "total";
  target: number;
  createdAt: string;
  updatedAt: string;
}

export interface WritingStatsResponse {
  dailyCounts: DailyWordCount[];
  todayWords: number;
  streak: number;
  weeklyAvg: number;
  totalWords: number;
  goals: WritingGoal[];
}

/** Fetch writing stats for a book (daily word counts, streak, goals). */
export function useWritingStats(bookId: string, days = 30) {
  return useQuery({
    queryKey: ["writing-stats", bookId, days],
    queryFn: () =>
      fetchJson<WritingStatsResponse>(
        `/api/books/${bookId}/writing-stats?days=${days}`
      ),
    enabled: !!bookId,
  });
}

/** Create or update a writing goal for a book. */
export function useSetWritingGoal(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: { type: "daily" | "weekly" | "total"; target: number }) =>
      fetchJson<WritingGoal>(`/api/books/${bookId}/writing-stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["writing-stats", bookId] });
    },
  });
}
