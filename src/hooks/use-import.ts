"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ImportResponse {
  chapters: Array<{ number: number; title: string; wordCount: number }>;
  totalWordCount: number;
  warnings?: string[];
}

/** Upload manuscript files and auto-detect chapters. */
export function useImportManuscript(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (files: File[]): Promise<ImportResponse> => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const res = await fetch(`/api/books/${bookId}/import`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Import failed: ${res.status}`);
      }

      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books", bookId] });
      qc.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

export type { ImportResponse };
