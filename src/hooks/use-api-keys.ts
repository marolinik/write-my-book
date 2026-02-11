"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await fetch("/api/settings/api-keys");
      if (!res.ok) throw new Error("Failed to fetch API keys");
      return res.json();
    },
  });
}

export function useAddApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      provider: string;
      key: string;
      label?: string;
    }) => {
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
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(
        data.validatedAt ? "API key added and validated" : "API key added"
      );
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete API key");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key deleted");
    },
    onError: (err) => toast.error(err.message),
  });
}
