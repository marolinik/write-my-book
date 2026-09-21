"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────

export interface WorkflowCostData {
  min: number;
  max: number;
  formatted: string;
  blocked: boolean;
  reason?: string;
  /**
   * D2: how many of this book's own runs the number is drawn from, or null
   * when it is still the table-driven heuristic. The UI says which it is,
   * because an estimate the writer cannot check is one they cannot trust.
   */
  basedOnRuns?: number | null;
}

interface CostEstimateResponse {
  blocked: boolean;
  reason?: string;
  costEstimate?: {
    min: number;
    max: number;
    formatted: string;
    basedOnRuns?: number | null;
  };
  resolvedModel?: {
    registryId: string;
    displayName: string;
    tier: string;
    resolvedFrom: string;
  };
  currentModel?: {
    registryId: string;
    displayName: string;
    tier: string;
    resolvedFrom: string;
  };
  minimumTier?: string;
}

// ── Hook ──────────────────────────────────────────────────────

/**
 * Fetch cost estimates for multiple workflows in parallel using React Query's useQueries.
 * Returns a Record<workflowId, WorkflowCostData>.
 *
 * Uses staleTime of 60 seconds so estimates are cached across re-renders.
 */
export function useWorkflowCostEstimates(
  bookId: string,
  workflowIds: string[]
): Record<string, WorkflowCostData> {
  const queries = useQueries({
    queries: workflowIds.map((workflowId) => ({
      queryKey: ["cost-estimate", bookId, workflowId],
      queryFn: async (): Promise<{ workflowId: string; data: WorkflowCostData }> => {
        const res = await fetch(
          `/api/books/${bookId}/cost-estimate?workflowId=${encodeURIComponent(workflowId)}`
        );
        if (!res.ok) {
          // Don't throw for individual failures -- return a default
          return {
            workflowId,
            data: { min: 0, max: 0, formatted: "--", blocked: false },
          };
        }

        const json: CostEstimateResponse = await res.json();

        if (json.blocked) {
          return {
            workflowId,
            data: {
              min: 0,
              max: 0,
              formatted: "",
              blocked: true,
              reason: json.reason,
            },
          };
        }

        return {
          workflowId,
          data: {
            min: json.costEstimate?.min ?? 0,
            max: json.costEstimate?.max ?? 0,
            formatted: json.costEstimate?.formatted ?? "--",
            basedOnRuns: json.costEstimate?.basedOnRuns ?? null,
            blocked: false,
          },
        };
      },
      staleTime: 60_000, // 1 minute cache
      enabled: !!bookId,
    })),
  });

  return useMemo(() => {
    const result: Record<string, WorkflowCostData> = {};
    for (const query of queries) {
      if (query.data) {
        result[query.data.workflowId] = query.data.data;
      }
    }
    return result;
  }, [queries]);
}
