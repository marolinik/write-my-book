"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

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

/** Fetch a document's content. */
export function useDocumentContent(bookId: string, documentId: string) {
  return useQuery({
    queryKey: ["document-content", bookId, documentId],
    queryFn: () =>
      fetchJson<{
        id: string;
        type: string;
        title: string | null;
        content: string;
        currentVersion: number;
        chapterNumber?: number | null;
        wordCount?: number;
        createdAt?: string;
        updatedAt?: string;
        createdByAgent?: string | null;
      }>(`/api/books/${bookId}/documents/${documentId}`),
    enabled: !!bookId && !!documentId,
  });
}

/** Save document content. */
export function useSaveDocumentContent(bookId: string, documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      fetchJson(`/api/books/${bookId}/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, changeSource: "manual" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document-content", bookId, documentId] });
      // Don't invalidate versions on every save — only needed when viewing history
      qc.invalidateQueries({ queryKey: ["book-documents", bookId] });
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
