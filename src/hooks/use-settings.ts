"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

export type BookSettingsData = {
  id: string;
  bookId: string;
  modelGhostwriter: string;
  modelEditor: string;
  modelBetaReader: string;
  modelAnalyst: string;
  modelCoach: string;
  modelCreative: string;
  modelResearch: string;
  /** Book-level default model override (registry ID or null). */
  modelOverride: string | null;
  autoCommit: boolean;
  styleStrictness: string;
  betaPanelSize: number;
  betaConsensus: number;
  betaConvergence: number;
  language: string;
};

/** Fetch settings for a book. */
export function useBookSettings(bookId: string) {
  return useQuery({
    queryKey: ["book-settings", bookId],
    queryFn: () =>
      fetchJson<BookSettingsData>(`/api/books/${bookId}/settings`),
    enabled: !!bookId,
  });
}

/** Update settings for a book. */
export function useUpdateBookSettings(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Omit<BookSettingsData, "id" | "bookId">>) =>
      fetchJson<BookSettingsData>(`/api/books/${bookId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["book-settings", bookId] });
    },
  });
}
