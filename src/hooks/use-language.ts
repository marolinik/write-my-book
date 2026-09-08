"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const LANGUAGE_CHANNEL = "wmb:language";

/**
 * UDG round-5 (Hana): keep open tabs in sync when the user changes language in
 * another tab. The React Query language cache is per-QueryClient-instance (i.e.
 * per browser tab), so a PATCH in one tab only updates that tab. We broadcast the
 * new language over a BroadcastChannel and apply it to every other tab's cache;
 * the optimistic `setQueryData` in useUpdateLanguage already re-renders every
 * `useLanguage()`/`useLocale()` consumer in the active tab (intra-tab is correct).
 */
export function broadcastLanguageChange(language: string) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return;
  }
  try {
    new BroadcastChannel(LANGUAGE_CHANNEL).postMessage({ language });
  } catch {
    // BroadcastChannel unavailable (older Safari) — intra-tab update still works.
  }
}

export function useLanguageBroadcast() {
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return;
    }
    const channel = new BroadcastChannel(LANGUAGE_CHANNEL);
    channel.onmessage = (event) => {
      const language = event?.data?.language as string | undefined;
      if (!language) return;
      // Only respond to changes from another tab to avoid self-loops.
      const current = qc.getQueryData<{ language: string }>(["user-language"]);
      if (current?.language === language) return;
      qc.setQueryData(["user-language"], { language });
    };
    return () => channel.close();
  }, [qc]);
}

export function useUserLanguage() {
  return useQuery<{ language: string }>({
    queryKey: ["user-language"],
    queryFn: async () => {
      const res = await fetch("/api/settings/language");
      if (!res.ok) throw new Error("Failed to fetch language preference");
      return res.json();
    },
    staleTime: Infinity,
  });
}

export function useUpdateLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (language: string) => {
      const res = await fetch("/api/settings/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update language");
      }
      return res.json();
    },
    onMutate: async (language) => {
      await qc.cancelQueries({ queryKey: ["user-language"] });
      const previous = qc.getQueryData<{ language: string }>(["user-language"]);
      qc.setQueryData(["user-language"], { language });
      broadcastLanguageChange(language);
      return { previous };
    },
    onError: (_err, _lang, context) => {
      if (context?.previous) {
        qc.setQueryData(["user-language"], context.previous);
      }
      toast.error("Failed to update language");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["user-language"] });
    },
  });
}
