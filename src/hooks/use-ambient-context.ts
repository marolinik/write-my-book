"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import type {
  AmbientCharacterView,
  AmbientThreadView,
} from "@/lib/series/ambient-context";

export interface AmbientContextData {
  series: { id: string; title: string; seriesType: string; currentBookNumber: number } | null;
  chapterNumber: number;
  characters: AmbientCharacterView[];
  threads: AmbientThreadView[];
  toneDrift: { baselineBook: number; metrics: Array<{ key: string; current: number; baseline: number; deltaPct: number; material: boolean }> } | null;
  meta: { notReady: boolean; sourcesAvailable: { graph: boolean; style: boolean } };
}

/**
 * Fetches ambient series context for the currently-open chapter. Cached 5 min,
 * re-queried on chapter switch (chapterNumber is part of the key). Disabled
 * until the panel is open and a chapter is loaded.
 */
export function useAmbientContext(
  bookId: string,
  chapterNumber: number | null,
  enabled: boolean
): UseQueryResult<AmbientContextData> {
  return useQuery<AmbientContextData>({
    queryKey: ["ambient-context", bookId, chapterNumber],
    queryFn: () =>
      fetchJson(`/api/books/${bookId}/series-context?chapterNumber=${chapterNumber}`),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: enabled && chapterNumber != null,
  });
}
