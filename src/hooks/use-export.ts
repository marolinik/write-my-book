"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

// ─── Types ──────────────────────────────────────────────────────

interface ExportResultResponse {
  filename: string;
  storageKey: string;
  wordCount: number;
  chapterCount: number;
  estimatedPages: number;
  warnings: string[];
  format: string;
}

interface ExportHistoryItem {
  storageKey: string;
  filename: string;
  format: string;
}

interface ExportHistoryResponse {
  exports: ExportHistoryItem[];
}

interface ExportConfig {
  metadata: {
    title: string;
    subtitle: string;
    author: string;
    seriesName: string;
    seriesNumber: string;
    isbn: string;
    publisher: string;
    copyrightYear: string;
  };
  format: {
    defaultFormats: { docx: boolean; pdf: boolean; epub: boolean };
    trimSize: string;
    customWidth: string;
    customHeight: string;
    genreTemplate: string;
  };
  sceneBreakGlyph: string;
  frontMatter: {
    coverPage: boolean;
    halfTitle: boolean;
    titlePage: boolean;
    copyrightPage: boolean;
    dedication: boolean;
    tableOfContents: boolean;
    coverImagePath: string;
    dedicationPath: string;
  };
  backMatter: {
    aboutAuthor: boolean;
    alsoBy: boolean;
    acknowledgments: boolean;
    aboutAuthorPath: string;
    alsoByPath: string;
    acknowledgmentsPath: string;
  };
  styleGuide: {
    oxfordComma: boolean;
    spellOutNumbers: boolean;
    closedEmDashes: boolean;
    thinSpaceEllipsis: boolean;
    sentenceCaseHeadings: boolean;
  };
  customTemplates: {
    docxReference: string;
    epubCss: string;
    typstTemplate: string;
  };
  typography: {
    autoHyphenation: boolean;
    widowOrphanControl: "strict" | "relaxed" | "off";
    justifiedText: boolean;
  };
}

// ─── Hooks ──────────────────────────────────────────────────────

/** Trigger a manuscript export. */
export function useExportManuscript(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      format: "docx" | "pdf" | "epub";
      isDraft?: boolean;
      sceneBreakGlyph?: string;
      template?: string;
    }) =>
      fetchJson<ExportResultResponse>(`/api/books/${bookId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["export", bookId, "history"] });
    },
  });
}

/** List previous exports. */
export function useExportHistory(bookId: string) {
  return useQuery({
    queryKey: ["export", bookId, "history"],
    queryFn: () =>
      fetchJson<ExportHistoryResponse>(`/api/books/${bookId}/export`),
    enabled: !!bookId,
  });
}

/** Get export config. */
export function useExportConfig(bookId: string) {
  return useQuery({
    queryKey: ["export", bookId, "config"],
    queryFn: () =>
      fetchJson<ExportConfig>(`/api/books/${bookId}/export/config`),
    enabled: !!bookId,
  });
}

/** Update export config (partial merge). */
export function useUpdateExportConfig(bookId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<ExportConfig>) =>
      fetchJson<ExportConfig>(`/api/books/${bookId}/export/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["export", bookId, "config"] });
    },
  });
}

/** Download an exported file (blob -> object URL -> anchor click). */
export function useDownloadExport(bookId: string) {
  return async (filename: string) => {
    const res = await fetch(`/api/books/${bookId}/export/${filename}`);
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
}

export type {
  ExportResultResponse,
  ExportHistoryItem,
  ExportHistoryResponse,
  ExportConfig,
};
