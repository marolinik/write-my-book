"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import {
  bodyFitsKeepalive,
  keepaliveBodyBytes,
  reserveKeepaliveBudget,
  releaseKeepaliveBudget,
} from "@/components/editor/save-flush";

/** Fetch chapter markdown content. */
export function useChapterContent(bookId: string, chapterId: string) {
  return useQuery({
    queryKey: ["chapter-content", bookId, chapterId],
    queryFn: () =>
      fetchJson<{
        markdown: string;
        wordCount: number;
        documentId?: string;
        version?: number;
      }>(`/api/books/${bookId}/chapters/${chapterId}/content`),
    enabled: !!bookId && !!chapterId,
  });
}

/** Save chapter markdown content (optionally optimistically locked). */
export function useSaveChapterContent(bookId: string, chapterId: string) {
  const qc = useQueryClient();

  return useMutation({
    // Default networkMode "online" PAUSES the mutation while offline —
    // mutateAsync never settles, isSaving sticks true, and the status bar
    // shows "Saving..." through an outage. "always" lets the fetch fail fast
    // so the editor's own offline machinery (error classification, backoff,
    // IDB draft buffer, reconnect short-circuit) stays in control.
    networkMode: "always",
    mutationFn: async ({
      markdown,
      expectedVersion,
      changeSource,
      keepalive,
    }: {
      markdown: string;
      expectedVersion?: number;
      changeSource?: string;
      // D-133: the pagehide/visibilitychange server flush sets keepalive so the
      // PUT can complete after the page is torn down (sendBeacon can't do PUT +
      // JSON headers; fetch keepalive is the modern equivalent). Normal
      // autosaves leave it undefined and never carry the 64KB keepalive cap.
      keepalive?: boolean;
    }) => {
      const body = JSON.stringify({ markdown, expectedVersion, changeSource });
      // keepalive is best-effort and requested ONLY by the unload flush. Use it
      // only when the body fits the single-request cap AND the shared in-flight
      // budget can hold it. F2: split-editor.tsx mounts TWO panes that flush at
      // once — two bodies that each pass bodyFitsKeepalive can jointly breach
      // the browser's 64KB keepalive cap (it limits the SUM of inflight bodies),
      // and the overflowing fetch throws. Reserve against the budget so the
      // second pane falls back to a plain request (the local draft buffer still
      // covers recovery) rather than losing the PUT.
      const bodyBytes = keepaliveBodyBytes(body);
      const useKeepalive =
        keepalive === true &&
        bodyFitsKeepalive(body) &&
        reserveKeepaliveBudget(bodyBytes);
      try {
        return await fetchJson<{
          wordCount: number;
          version: number;
          bookWordCount: number;
        }>(`/api/books/${bookId}/chapters/${chapterId}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: useKeepalive,
        });
      } finally {
        // Release the reservation once the fetch settles so later flushes (the
        // common phone-backgrounding survival path) regain budget. On the
        // page-death path this never runs — the process is gone — which is fine.
        if (useKeepalive) releaseKeepaliveBudget(bodyBytes);
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: ["chapter-content", bookId, chapterId],
      });
      // Publish the live cumulative book word count for the onboarding watcher
      // (no refetch — the value came back with the save response).
      qc.setQueryData<number>(["book-wordcount", bookId], data.bookWordCount);
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

/** Save document content (optionally optimistically locked, mirroring chapters). */
export function useSaveDocumentContent(bookId: string, documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      content,
      expectedVersion,
      changeSource,
    }: {
      content: string;
      expectedVersion?: number;
      changeSource?: string;
    }) =>
      // When expectedVersion is present the PATCH returns 409 (not a silent
      // overwrite) if the doc moved; absent = last-write-wins (legacy).
      fetchJson<{ version: number }>(
        `/api/books/${bookId}/documents/${documentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            expectedVersion,
            changeSource: changeSource ?? "manual",
          }),
        }
      ),
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
