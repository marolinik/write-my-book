"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AgentRole } from "@/lib/llm";
import { ROLE_TO_USER_FIELD } from "@/lib/llm";

// ── Types ─────────────────────────────────────────────────────

export interface DefaultModelData {
  defaultModel: string;
  /** Server-reported: the self-hosted fleet is reachable on this install. */
  localFleet?: boolean;
  modelGhostwriter: string | null;
  modelCoach: string | null;
  modelCreative: string | null;
  modelStylist: string | null;
  modelEditor: string | null;
  modelBetaReader: string | null;
  modelPlanner: string | null;
  modelReader: string | null;
  modelResearch: string | null;
  modelAnalyst: string | null;
}

// A-28: one role-to-field table, in the resolver. Two more copies used to
// live in the client -- here and in the settings section -- so a new role
// reached the server and the UI kept writing to the field it knew.
const ROLE_TO_FIELD: Record<AgentRole, keyof DefaultModelData> =
  ROLE_TO_USER_FIELD as Record<AgentRole, keyof DefaultModelData>;

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
