"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { responseError } from "@/lib/api/describe-api-error";

interface WikiEntity {
  id: string;
  bookId: string;
  type: string;
  name: string;
  aliases: string[];
  description: string;
  attributes: Record<string, unknown>;
  mentions: Array<{ chapterId: string; chapterNumber: number; context: string }>;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
}

export type { WikiEntity };

export function useWikiEntities(bookId: string, type = "all", search = "") {
  return useQuery<WikiEntity[]>({
    queryKey: ["wiki", bookId, type, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (type !== "all") params.set("type", type);
      if (search) params.set("search", search);
      const res = await fetch(`/api/books/${bookId}/wiki?${params}`);
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    enabled: !!bookId,
  });
}

export function useCreateWikiEntity(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<WikiEntity>) => {
      const res = await fetch(`/api/books/${bookId}/wiki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wiki", bookId] });
    },
  });
}

export function useUpdateWikiEntity(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entityId, data }: { entityId: string; data: Partial<WikiEntity> }) => {
      const res = await fetch(`/api/books/${bookId}/wiki/${entityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wiki", bookId] });
    },
  });
}

export function useDeleteWikiEntity(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entityId: string) => {
      const res = await fetch(`/api/books/${bookId}/wiki/${entityId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wiki", bookId] });
    },
  });
}

export function usePopulateWiki(bookId: string) {
  const qc = useQueryClient();
  return useMutation<{ created: number; total: number }>({
    mutationFn: async () => {
      const res = await fetch(`/api/books/${bookId}/wiki/populate`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw await responseError(res, body);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wiki", bookId] });
    },
  });
}
