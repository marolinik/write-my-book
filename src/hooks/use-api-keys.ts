"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ProviderKey } from "@/lib/llm/providers";

// ─── Types ─────────────────────────────────────────────────────

export interface ApiKeyUsage {
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
}

export interface ApiKeyEntry {
  id: string;
  provider: string;
  label: string | null;
  isDefault: boolean;
  validatedAt: string | null;
  createdAt: string;
  maskedKey: string;
  usage: ApiKeyUsage;
}

export interface ApiKeyCreateResponse {
  id: string;
  provider: string;
  label: string | null;
  isDefault: boolean;
  validatedAt: string | null;
  maskedKey: string;
  usage: null;
}

// ─── Hooks ─────────────────────────────────────────────────────

/**
 * Fetch all API keys for the current user with per-provider usage stats.
 */
export function useApiKeys() {
  return useQuery<ApiKeyEntry[]>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await fetch("/api/settings/api-keys");
      if (!res.ok) throw new Error("Failed to fetch API keys");
      return res.json();
    },
  });
}

/**
 * Derive per-provider usage from the API keys list query.
 * Returns usage stats for a specific provider, or null if not found.
 */
export function useProviderUsage(provider: ProviderKey) {
  const { data: keys } = useApiKeys();

  const entry = keys?.find((k) => k.provider === provider);
  return entry?.usage ?? null;
}

/**
 * Add (or update) an API key for a provider.
 * The server validates the key before storing -- returns 400 if invalid.
 */
export function useAddApiKey() {
  const qc = useQueryClient();
  return useMutation<
    ApiKeyCreateResponse,
    Error,
    { provider: string; key: string; label?: string }
  >({
    mutationFn: async (data) => {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add API key");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key validated and saved");
    },
    onError: (err) => toast.error(err.message),
  });
}

/**
 * Delete an API key by ID.
 * Handles specific error cases:
 * - 400: last key removal blocked
 * - 409: active sessions running
 */
export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();

        // Surface specific error messages from the server
        if (res.status === 400 || res.status === 409) {
          throw new Error(err.error);
        }

        throw new Error(err.error || "Failed to delete API key");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key deleted");
    },
    onError: (err) => toast.error(err.message),
  });
}
