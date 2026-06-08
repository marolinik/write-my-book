"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
