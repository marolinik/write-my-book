"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/components/providers/language-provider";
import { responseError, describeApiError } from "@/lib/api/describe-api-error";

export function useStyleProfile(bookId: string) {
  return useQuery({
    queryKey: ["style-profile", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/style`);
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    enabled: !!bookId,
  });
}

export function useUpdateStyleProfile(bookId: string) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; fingerprint?: string }) => {
      const res = await fetch(`/api/books/${bookId}/style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["style-profile", bookId] });
      toast.success(t.toasts.styleProfileSaved);
    },
    onError: (err) => toast.error(describeApiError(err, t)),
  });
}

export function useCharacterLenses(bookId: string) {
  return useQuery({
    queryKey: ["character-lenses", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/style/lenses`);
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    enabled: !!bookId,
  });
}

export function useCreateLens(bookId: string) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: async (data: {
      characterName: string;
      sensoryPriority: string;
      metaphorDomain: string;
      interiorStyle: string;
      vocabularyRegister: string;
      blindSpots?: string;
    }) => {
      const res = await fetch(`/api/books/${bookId}/style/lenses`, {
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
      qc.invalidateQueries({ queryKey: ["character-lenses", bookId] });
      qc.invalidateQueries({ queryKey: ["style-profile", bookId] });
      toast.success(t.toasts.characterLensCreated);
    },
    onError: (err) => toast.error(describeApiError(err, t)),
  });
}

export function useUpdateLens(bookId: string) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: async ({ lensId, ...data }: { lensId: string; [key: string]: any }) => {
      const res = await fetch(`/api/books/${bookId}/style/lenses/${lensId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character-lenses", bookId] });
      toast.success(t.toasts.characterLensUpdated);
    },
    onError: (err) => toast.error(describeApiError(err, t)),
  });
}

export function useDeleteLens(bookId: string) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: async (lensId: string) => {
      const res = await fetch(`/api/books/${bookId}/style/lenses/${lensId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character-lenses", bookId] });
      qc.invalidateQueries({ queryKey: ["style-profile", bookId] });
      toast.success(t.toasts.characterLensDeleted);
    },
    onError: (err) => toast.error(describeApiError(err, t)),
  });
}
