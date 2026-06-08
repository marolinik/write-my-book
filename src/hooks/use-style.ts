"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useStyleProfile(bookId: string) {
  return useQuery({
    queryKey: ["style-profile", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/style`);
      if (!res.ok) throw new Error("Failed to fetch style profile");
      return res.json();
    },
    enabled: !!bookId,
  });
}

export function useUpdateStyleProfile(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; fingerprint?: string }) => {
      const res = await fetch(`/api/books/${bookId}/style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update style profile");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["style-profile", bookId] });
      toast.success("Style profile saved");
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useCharacterLenses(bookId: string) {
  return useQuery({
    queryKey: ["character-lenses", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/style/lenses`);
      if (!res.ok) throw new Error("Failed to fetch character lenses");
      return res.json();
    },
    enabled: !!bookId,
  });
}

export function useCreateLens(bookId: string) {
  const qc = useQueryClient();
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
        throw new Error(err.error || "Failed to create lens");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character-lenses", bookId] });
      qc.invalidateQueries({ queryKey: ["style-profile", bookId] });
      toast.success("Character lens created");
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateLens(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lensId, ...data }: { lensId: string; [key: string]: any }) => {
      const res = await fetch(`/api/books/${bookId}/style/lenses/${lensId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update lens");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character-lenses", bookId] });
      toast.success("Character lens updated");
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteLens(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lensId: string) => {
      const res = await fetch(`/api/books/${bookId}/style/lenses/${lensId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete lens");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character-lenses", bookId] });
      qc.invalidateQueries({ queryKey: ["style-profile", bookId] });
      toast.success("Character lens deleted");
    },
    onError: (err) => toast.error(err.message),
  });
}
