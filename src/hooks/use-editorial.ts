"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

// Types for API responses
interface FindingAlternative {
  label?: string;
  originalText?: string;
  newText: string;
}

interface FindingItem {
  id: string;
  bookId: string;
  chapterNumber: number;
  sessionId: string | null;
  agentType: string;
  severity: string;
  category: string;
  description: string;
  suggestion: string | null;
  originalText: string | null;
  newText: string | null;
  locationStart: string | null;
  locationEnd: string | null;
  status: string;
  dismissReason: string | null;
  appliedAt: string | null;
  createdAt: string;
  confidence?: number | null;
  rationale?: string | null;
  paragraphNumber?: number | null;
  anchorQuote?: string | null;
  alternatives?: FindingAlternative[] | null;
  groundingScore?: number | null;
  chapterVersion?: number | null;
}

interface FindingsResponse {
  findings: FindingItem[];
  total: number;
}

interface EditorialSummary {
  total: number;
  pending: number;
  applied: number;
  dismissed: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  chaptersWithPending: number;
}

interface EditActionItem {
  id: string;
  bookId: string;
  chapterNumber: number;
  actionType: string;
  sessionId: string | null;
  findingId: string | null;
  description: string;
  timestamp: string;
}

interface EditHistoryResponse {
  actions: EditActionItem[];
  total: number;
}

interface FindingsFilters {
  chapterNumber?: number | null;
  severity?: string | null;
  category?: string | null;
  status?: string | null;
  agentType?: string | null;
  limit?: number;
  offset?: number;
}

function buildQueryString(filters: FindingsFilters): string {
  const params = new URLSearchParams();
  if (filters.chapterNumber) params.set("chapterNumber", String(filters.chapterNumber));
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.category) params.set("category", filters.category);
  if (filters.status) params.set("status", filters.status);
  if (filters.agentType) params.set("agentType", filters.agentType);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Fetch findings for a book with optional filters. */
export function useFindings(bookId: string, filters: FindingsFilters = {}) {
  return useQuery({
    queryKey: ["editorial", bookId, "findings", filters],
    queryFn: () =>
      fetchJson<FindingsResponse>(
        `/api/books/${bookId}/editorial/findings${buildQueryString(filters)}`
      ),
    enabled: !!bookId,
  });
}

/** Fetch editorial summary stats for a book. */
export function useEditorialSummary(bookId: string) {
  return useQuery({
    queryKey: ["editorial", bookId, "summary"],
    queryFn: () =>
      fetchJson<EditorialSummary>(`/api/books/${bookId}/editorial/summary`),
    enabled: !!bookId,
  });
}

/** Fetch edit history for a book, optionally filtered by chapter. */
export function useEditHistory(bookId: string, chapterNumber?: number) {
  const params = chapterNumber ? `?chapterNumber=${chapterNumber}` : "";
  return useQuery({
    queryKey: ["editorial", bookId, "history", chapterNumber],
    queryFn: () =>
      fetchJson<EditHistoryResponse>(
        `/api/books/${bookId}/editorial/history${params}`
      ),
    enabled: !!bookId,
  });
}

type ApplyFindingInput =
  | string
  | { findingId: string; alternativeIndex?: number; overrideText?: string };

/** Apply a finding. */
export function useApplyFinding(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: ApplyFindingInput) => {
      const findingId = typeof input === "string" ? input : input.findingId;
      const alternativeIndex = typeof input === "string" ? undefined : input.alternativeIndex;
      const overrideText = typeof input === "string" ? undefined : input.overrideText;
      return fetchJson(`/api/books/${bookId}/editorial/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", alternativeIndex, overrideText }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial", bookId] });
      // Apply rewrites the chapter document server-side (bumps its version).
      // Refetch chapter content so an open editor's clean-resync adopts the
      // new version instead of 409ing on its next autosave.
      qc.invalidateQueries({ queryKey: ["chapter-content", bookId] });
    },
  });
}

type DismissFindingInput = string | { findingId: string; reason?: string };

/** Dismiss a finding with optional reason. */
export function useDismissFinding(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: DismissFindingInput) => {
      const findingId = typeof input === "string" ? input : input.findingId;
      const reason = typeof input === "string" ? undefined : input.reason;
      return fetchJson(`/api/books/${bookId}/editorial/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", reason }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial", bookId] });
    },
  });
}

/** Undo a finding (revert to pending). */
export function useUndoFinding(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (findingId: string) =>
      fetchJson(`/api/books/${bookId}/editorial/findings/${findingId}/undo`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial", bookId] });
      // Undo rewrites the chapter document server-side (bumps its version).
      // Refetch chapter content so an open editor's clean-resync adopts the
      // new version instead of 409ing on its next autosave.
      qc.invalidateQueries({ queryKey: ["chapter-content", bookId] });
    },
  });
}

export type { FindingItem, FindingAlternative, FindingsResponse, EditorialSummary, EditActionItem, EditHistoryResponse, FindingsFilters };
