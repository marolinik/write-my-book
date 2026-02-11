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
    mutationFn: (data: {
      name: string;
      genre?: string | null;
      language?: string;
      seriesId?: string;
      bookNumber?: number;
    }) =>
      fetchJson<{ id: string }>("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
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
