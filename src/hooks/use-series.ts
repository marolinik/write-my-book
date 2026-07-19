"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { useUpgradeModal } from "@/hooks/use-billing";

export type SeriesListItem = {
  id: string;
  title: string;
  genre: string | null;
  language: string;
  seriesType: string;
  plannedBooks: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  books: Array<{
    id: string;
    bookNumber: number;
    name: string;
    status: string;
    wordCount: number;
  }>;
  documents?: Array<{
    id: string;
    type: string;
    title: string | null;
    storageKey: string;
    currentVersion: number;
    chapterNumber: number | null;
    createdAt: string;
    updatedAt: string;
  }>;
  _count: { books: number; documents: number };
};

/** Fetch all series for the current user. */
export function useSeries() {
  return useQuery({
    queryKey: ["series"],
    queryFn: () => fetchJson<SeriesListItem[]>("/api/series"),
  });
}

/** Alias for useSeries — fetch all series for dashboard use. */
export const useSeriesList = useSeries;

/** Fetch a single series with books. */
export function useSeriesDetail(seriesId: string) {
  return useQuery({
    queryKey: ["series", seriesId],
    queryFn: () => fetchJson<SeriesListItem>(`/api/series/${seriesId}`),
    enabled: !!seriesId,
  });
}

/** Create a new series. */
export function useCreateSeries() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      genre?: string;
      language?: string;
      seriesType?: string;
      plannedBooks?: number;
      description?: string;
    }) => {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error ?? `Request failed: ${res.status}`) as Error & {
          status?: number;
          upgradeToTier?: string;
        };
        err.status = res.status;
        err.upgradeToTier = body.upgradeToTier;
        throw err;
      }
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["series"] });
    },
    onError: (error) => {
      const err = error as Error & { status?: number; upgradeToTier?: string };
      // Any plan/quota denial (403 OR 429) carries upgradeToTier → modal.
      if (err.upgradeToTier) {
        useUpgradeModal.getState().show(err.message, err.upgradeToTier);
      }
    },
  });
}

/** Update a series. */
export function useUpdateSeries(seriesId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title?: string;
      genre?: string | null;
      seriesType?: string;
      plannedBooks?: number;
      description?: string;
    }) =>
      fetchJson(`/api/series/${seriesId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["series"] });
    },
  });
}

// ─── Series Management Hooks ───────────────────────────────────

export type SeriesAnalytics = {
  books: Array<{
    bookId: string;
    bookNumber: number;
    name: string;
    status: string;
    wordCount: number;
    chapterCount: number;
    documentCount: number;
    chapterStatusCounts: Record<string, number>;
  }>;
  totals: {
    totalBooks: number;
    totalWordCount: number;
    totalChapters: number;
    totalDocuments: number;
  };
};

/** Fetch series analytics. */
export function useSeriesAnalytics(seriesId: string) {
  return useQuery({
    queryKey: ["series", seriesId, "analytics"],
    queryFn: () =>
      fetchJson<SeriesAnalytics>(`/api/series/${seriesId}/analytics`),
    enabled: !!seriesId,
  });
}

/** Add an existing or new book to the series. */
export function useAddBookToSeries(seriesId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: { bookId?: string; name?: string; genre?: string; language?: string }) =>
      fetchJson(`/api/series/${seriesId}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["series", seriesId] });
      qc.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

/** Remove a book from the series (detach). */
export function useRemoveBookFromSeries(seriesId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (bookId: string) =>
      fetchJson(`/api/series/${seriesId}/books/${bookId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["series", seriesId] });
      qc.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

/** Reorder a book within the series. */
export function useReorderBook(seriesId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: { bookId: string; newBookNumber: number }) =>
      fetchJson(`/api/series/${seriesId}/books/${data.bookId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newBookNumber: data.newBookNumber }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["series", seriesId] });
    },
  });
}

export type InheritanceStateItem = {
  seriesDocType: string;
  bookDocType: string;
  label: string;
  status: "own" | "inherited" | "missing";
  seriesVersion: number | null;
  bookVersion: number | null;
};

/** Check inheritance state for a book in a series. */
export function useInheritanceState(seriesId: string, bookId: string | null) {
  return useQuery({
    queryKey: ["series", seriesId, "inherit", bookId],
    queryFn: () =>
      fetchJson<InheritanceStateItem[]>(
        `/api/series/${seriesId}/inherit?bookId=${bookId}`
      ),
    enabled: !!seriesId && !!bookId,
  });
}

/** Apply inheritance from series to book. */
export function useApplyInheritance(seriesId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: { bookId: string; documentTypes?: string[] }) =>
      fetchJson(`/api/series/${seriesId}/inherit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ["series", seriesId, "inherit", variables.bookId],
      });
    },
  });
}

export type BookContributionItem = {
  bookId: string;
  bookName: string;
  bookNumber: number;
  hasArtifact: boolean;
};

/** Synthesize a book's artifact into the series doc. */
export function useSynthesize(seriesId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      bookId: string;
      bookNumber: number;
      artifactType: string;
    }) =>
      fetchJson(`/api/series/${seriesId}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["series", seriesId] });
    },
  });
}
