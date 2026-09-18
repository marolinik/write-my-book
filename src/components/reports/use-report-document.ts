"use client";

import { useQuery } from "@tanstack/react-query";

interface DocumentSummary {
  id: string;
  type: string;
  title: string | null;
  updatedAt: string;
}

/**
 * The report of a given type, WITH its prose.
 *
 * The reports tabs listed the book's documents and then read `rawContent` off
 * the list entry. The list carries metadata only, so the field was always
 * undefined and every tab rendered "No content available." over a report that
 * existed and was 21kB long (S3-10). The content lives behind the single
 * document endpoint, which is a second request — so the tabs make it.
 */
export function useReportDocument(bookId: string, type: string) {
  const list = useQuery({
    queryKey: ["book-documents", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const documents: DocumentSummary[] = Array.isArray(list.data)
    ? list.data
    : (list.data?.documents ?? []);
  const summary = documents.find((d) => d.type === type);

  const body = useQuery({
    queryKey: ["document-content", bookId, summary?.id],
    enabled: !!summary?.id,
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents/${summary!.id}`);
      if (!res.ok) throw new Error("Failed to load document");
      return res.json() as Promise<{ content?: string }>;
    },
  });

  return {
    document: summary ?? null,
    content: body.data?.content ?? "",
    /** True while either request is still out. */
    isLoading: list.isLoading || (!!summary && body.isLoading),
    /** The report exists but its stored prose is gone — not the same as absent. */
    isEmpty: !!summary && !body.isLoading && (body.data?.content ?? "") === "",
  };
}
