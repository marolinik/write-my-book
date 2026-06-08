"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AgentRole } from "@/lib/llm";

// ── Types ─────────────────────────────────────────────────────

export interface DefaultModelData {
  defaultModel: string;
  modelGhostwriter: string | null;
  modelEditor: string | null;
  modelBetaReader: string | null;
  modelAnalyst: string | null;
  modelCoach: string | null;
  modelCreative: string | null;
}

/** Map AgentRole to the field name in DefaultModelData. */
const ROLE_TO_FIELD: Record<AgentRole, keyof DefaultModelData> = {
  ghostwriter: "modelGhostwriter",
  editor: "modelEditor",
  "beta-reader": "modelBetaReader",
  analyst: "modelAnalyst",
  coach: "modelCoach",
  creative: "modelCreative",
};

// ── Hooks ─────────────────────────────────────────────────────

/** Fetch the user's global default model and role overrides. */
export function useDefaultModel() {
  return useQuery({
    queryKey: ["default-model"],
    queryFn: async () => {
      const res = await fetch("/api/settings/default-model");
      if (!res.ok) throw new Error("Failed to fetch default model");
      return res.json() as Promise<DefaultModelData>;
    },
  });
}

/** Update the global default model. */
export function useUpdateDefaultModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (defaultModel: string) => {
      const res = await fetch("/api/settings/default-model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultModel }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update default model");
      }
      return res.json() as Promise<DefaultModelData>;
    },
    onSuccess: (data) => {
      qc.setQueryData(["default-model"], data);
      toast.success("Default model updated");
    },
    onError: (err) => toast.error(err.message),
  });
}

/** Update a single global role override. Pass null to clear. */
export function useUpdateGlobalRoleOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      role,
      registryId,
    }: {
      role: AgentRole;
      registryId: string | null;
    }) => {
      const field = ROLE_TO_FIELD[role];
      const res = await fetch("/api/settings/default-model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: registryId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update role override");
      }
      return res.json() as Promise<DefaultModelData>;
    },
    onSuccess: (data) => {
      qc.setQueryData(["default-model"], data);
    },
    onError: (err) => toast.error(err.message),
  });
}
