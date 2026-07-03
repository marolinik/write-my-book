"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

export interface SearchSnippet {
  before: string;
  match: string;
  after: string;
}

export interface SearchHit {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  count: number;
  snippets: SearchSnippet[];
}

export interface SearchResponse {
  hits: SearchHit[];
  totalCount: number;
}

export interface ReplaceResponse {
  replaced: Array<{ chapterId: string; count: number; newVersion: number }>;
  totalReplacements: number;
}

/** Live book-wide search preview. `q` must be >= 2 chars to fire. */
export function useBookSearch(
  bookId: string,
  q: string,
  caseSensitive: boolean,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["book-search", bookId, q, caseSensitive],
    queryFn: () =>
      fetchJson<SearchResponse>(
        `/api/books/${bookId}/search?q=${encodeURIComponent(q)}&caseSensitive=${
          caseSensitive ? 1 : 0
        }`
      ),
    enabled: enabled && !!bookId && q.trim().length >= 2,
  });
}

/** Replace across chapters. Invalidates chapter content so the editor reloads. */
export function useBookReplace(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      find: string;
      replace: string;
      chapterIds?: string[];
      caseSensitive: boolean;
    }) =>
      fetchJson<ReplaceResponse>(`/api/books/${bookId}/search/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      // Prefix-match invalidation reloads whichever chapter the editor holds;
      // the editor's clean-resync effect adopts the new version when idle.
      qc.invalidateQueries({ queryKey: ["chapter-content", bookId] });
    },
  });
}
