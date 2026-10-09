"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

/**
 * A trim/expand draft beside the chapter as it is now (dev editor v2).
 *
 * The draft replaces a whole chapter when applied, so the writer reads both
 * before deciding. Loaded only when opened: a chapter is long, and most cards
 * are never compared.
 */
export function DraftComparison({
  bookId,
  moveId,
  labels,
}: {
  bookId: string;
  moveId: string;
  labels: { now: string; draft: string; error: string };
}) {
  const query = useQuery({
    queryKey: ["structure-draft", bookId, moveId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/structure/moves/${moveId}/draft`);
      if (!res.ok) throw new Error("draft load failed");
      return res.json() as Promise<{ before: string; after: string }>;
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-destructive">{labels.error}</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        { label: labels.now, text: query.data.before },
        { label: labels.draft, text: query.data.after },
      ].map(({ label, text }) => (
        <div key={label} className="min-w-0 rounded-md border">
          <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">{label}</p>
          <div className="max-h-96 overflow-auto whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed">
            {text}
          </div>
        </div>
      ))}
    </div>
  );
}
