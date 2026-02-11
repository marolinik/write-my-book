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

/** Fetch chapter markdown content. */
export function useChapterContent(bookId: string, chapterId: string) {
  return useQuery({
    queryKey: ["chapter-content", bookId, chapterId],
    queryFn: () =>
      fetchJson<{ markdown: string; wordCount: number; documentId?: string }>(
        `/api/books/${bookId}/chapters/${chapterId}/content`
      ),
    enabled: !!bookId && !!chapterId,
  });
}

/** Save chapter markdown content. */
export function useSaveChapterContent(bookId: string, chapterId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (markdown: string) =>
      fetchJson<{ wordCount: number }>(
        `/api/books/${bookId}/chapters/${chapterId}/content`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown }),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["chapter-content", bookId, chapterId],
      });
    },
  });
}

/** Fetch version history for a document. */
export function useDocumentVersions(bookId: string, docId: string | null) {
  return useQuery({
    queryKey: ["document-versions", bookId, docId],
    queryFn: () =>
      fetchJson<
        Array<{
          id: string;
          version: number;
          changeType: string;
          changeSource: string;
          wordCount: number;
          createdAt: string;
        }>
      >(`/api/books/${bookId}/documents/${docId}/versions`),
    enabled: !!bookId && !!docId,
  });
}

/** Fetch content of a specific version. */
export function useVersionContent(
  bookId: string,
  docId: string | null,
  version: number | null
) {
  return useQuery({
    queryKey: ["version-content", bookId, docId, version],
    queryFn: () =>
      fetchJson<{ version: number; content: string }>(
        `/api/books/${bookId}/documents/${docId}/versions/${version}`
      ),
    enabled: !!bookId && !!docId && version !== null,
  });
}

/** Restore a specific version. */
export function useRestoreVersion(bookId: string, docId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (version: number) =>
      fetchJson(`/api/books/${bookId}/documents/${docId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["document-versions", bookId, docId],
      });
      qc.invalidateQueries({
        queryKey: ["chapter-content", bookId],
      });
    },
  });
}
