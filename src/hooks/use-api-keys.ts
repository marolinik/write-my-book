"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/components/providers/language-provider";
import type { ProviderKey } from "@/lib/llm/providers";
import { responseError, describeApiError } from "@/lib/api/describe-api-error";

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
  /** Null when the stored row can no longer be decrypted (see needsReentry). */
  maskedKey: string | null;
  /** P2-21: the row could not be decrypted; the writer must enter the key again. */
  needsReentry?: boolean;
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
      if (!res.ok) throw await responseError(res);
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
  const { t } = useLanguage();
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
        throw await responseError(res, err);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t.toasts.apiKeySaved);
    },
    onError: (err) => toast.error(describeApiError(err, t)),
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
  const { t } = useLanguage();
  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        // 400 LAST_API_KEY and 409 KEY_IN_USE carry codes with their own
        // sentence in every UI language (describeApiError).
        throw await responseError(res);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t.toasts.apiKeyDeleted);
    },
    onError: (err) => toast.error(describeApiError(err, t)),
  });
}
