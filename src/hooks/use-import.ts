"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ImportPreviewResponse } from "@/lib/validation";

interface ImportResponse {
  chapters: Array<{ number: number; title: string; wordCount: number }>;
  totalWordCount: number;
  warnings?: string[];
}

/** Upload manuscript files and auto-detect chapters (legacy direct import). */
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

async function previewOneFile(bookId: string, file: File): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append("files", file);

  const res = await fetch(`/api/books/${bookId}/import/preview`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Preview failed: ${res.status}`);
  }

  return res.json();
}

/** Appends one file's preview, numbering its chapters on from the last one —
 *  the same numbering the route gives several files sent together. */
function appendPreview(
  merged: ImportPreviewResponse,
  next: ImportPreviewResponse
): ImportPreviewResponse {
  const offset = merged.chapters.length;
  const warnings = [...(merged.warnings ?? []), ...(next.warnings ?? [])];
  return {
    chapters: [
      ...merged.chapters,
      ...next.chapters.map((ch) => ({ ...ch, number: offset + ch.number })),
    ],
    existingChapters: next.existingChapters ?? merged.existingChapters,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/** Preview uploaded files — parses chapters without persisting.
 *  One request per file: each body then stays under the upload cap
 *  (MAX_UPLOAD_REQUEST_BYTES), so several large manuscripts picked together
 *  are not refused for their combined size (UAT P6-S01/S06). */
export function useImportPreview(bookId: string) {
  return useMutation({
    mutationFn: async (files: File[]): Promise<ImportPreviewResponse> => {
      let merged: ImportPreviewResponse = { chapters: [] };
      for (const file of files) {
        merged = appendPreview(merged, await previewOneFile(bookId, file));
      }
      return merged;
    },
  });
}

interface ImportConfirmChapter {
  number: number;
  title: string;
  content: string;
  action: "create" | "replace" | "skip";
}

interface ImportConfirmResponse {
  created: number;
  replaced: number;
  totalWordCount: number;
  chapterCount: number;
}

/** Confirm import — sends structured chapter list after preview/edit/reorder. */
export function useImportConfirm(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (chapters: ImportConfirmChapter[]): Promise<ImportConfirmResponse> => {
      const res = await fetch(`/api/books/${bookId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Import confirm failed: ${res.status}`);
      }

      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books", bookId] });
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["book-documents", bookId] });
    },
  });
}

export type { ImportResponse, ImportConfirmChapter, ImportConfirmResponse };
