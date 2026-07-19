"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { useUpgradeModal } from "@/hooks/use-billing";

export type BookListItem = {
  id: string;
  name: string;
  genre: string | null;
  language: string;
  status: string;
  wordCount: number;
  chapterCount: number;
  bookNumber: number;
  seriesId: string | null;
  s3Prefix: string | null;
  createdAt: string;
  updatedAt: string;
  series: { id: string; title: string } | null;
  settings: Record<string, unknown> | null;
  _count: { chapters: number; documents: number };
};

export type BookDetail = BookListItem & {
  chapters: Array<{
    id: string;
    bookId: string;
    actNumber: number;
    chapterNumber: number;
    title: string | null;
    status: string;
    wordCount: number;
    betaScore: number | null;
    betaGate: string;
    revisionCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
  _count: { documents: number; agentSessions: number };
};

/** Fetch all books for the current user. */
export function useBooks() {
  return useQuery({
    queryKey: ["books"],
    queryFn: () => fetchJson<BookListItem[]>("/api/books"),
  });
}

/** Fetch a single book with chapters and related data. */
export function useBook(bookId: string) {
  return useQuery({
    queryKey: ["books", bookId],
    queryFn: () => fetchJson<BookDetail>(`/api/books/${bookId}`),
    enabled: !!bookId,
  });
}

/** Create a new book. */
export function useCreateBook() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      genre?: string | null;
      language?: string;
      seriesId?: string;
      bookNumber?: number;
    }) => {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Attach upgradeToTier to the error for onError handling
        const err = new Error(body.error ?? `Request failed: ${res.status}`) as Error & {
          status?: number;
          upgradeToTier?: string;
        };
        err.status = res.status;
        err.upgradeToTier = body.upgradeToTier;
        throw err;
      }
      return res.json() as Promise<{ id: string; firstChapterId: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (error) => {
      const err = error as Error & { status?: number; upgradeToTier?: string };
      // Any plan/quota denial (403 create-wall OR 429 quota-wall) carries
      // upgradeToTier → route it to the modal, never a silent toast.
      if (err.upgradeToTier) {
        useUpgradeModal.getState().show(err.message, err.upgradeToTier);
      }
    },
  });
}

/** Update a book. */
export function useUpdateBook(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name?: string;
      genre?: string | null;
      language?: string;
      status?: string;
    }) =>
      fetchJson(`/api/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

/** Delete a book. */
export function useDeleteBook(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchJson(`/api/books/${bookId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
    },
  });
}
