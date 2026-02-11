"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export type ChapterItem = {
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
};

/** Fetch chapters for a book. */
export function useChapters(bookId: string) {
  return useQuery({
    queryKey: ["chapters", bookId],
    queryFn: () =>
      fetchJson<ChapterItem[]>(`/api/books/${bookId}/chapters`),
    enabled: !!bookId,
  });
}

/** Create a new chapter. */
export function useCreateChapter(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      actNumber: number;
      chapterNumber: number;
      title?: string;
    }) =>
      fetchJson<ChapterItem>(`/api/books/${bookId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", bookId] });
      qc.invalidateQueries({ queryKey: ["books", bookId] });
      qc.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

/** Update a chapter. */
export function useUpdateChapter(bookId: string, chapterId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title?: string;
      status?: string;
      actNumber?: number;
    }) =>
      fetchJson(`/api/books/${bookId}/chapters/${chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", bookId] });
      qc.invalidateQueries({ queryKey: ["books", bookId] });
    },
  });
}

/** Delete a chapter. */
export function useDeleteChapter(bookId: string, chapterId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchJson(`/api/books/${bookId}/chapters/${chapterId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", bookId] });
      qc.invalidateQueries({ queryKey: ["books", bookId] });
      qc.invalidateQueries({ queryKey: ["books"] });
    },
  });
}
