"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { useFindings } from "@/hooks/use-editorial";
import { useEditorialStore } from "@/stores/editorial-store";
import { ChapterSelector } from "./chapter-selector";
import { FindingCard } from "./finding-card";
import { BookOpenIcon, MessageSquareQuoteIcon } from "lucide-react";

interface ChapterInfo {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
}

interface DocumentRow {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  chapterNumber: number | null;
}

interface HandoffPanelProps {
  bookId: string;
  chapters?: ChapterInfo[];
}

/**
 * UDG-3 (Elena): chapter handoff summary — the story synopsis side by side
 * with that chapter's editorial findings, so an editor can brief a client on
 * "where the story stands and what still needs polish" in one read.
 */
export function HandoffPanel({ bookId, chapters }: HandoffPanelProps) {
  const selectedChapter = useEditorialStore((s) => s.selectedChapter);

  const { data: docsData } = useQuery({
    queryKey: ["handoff", "documents", bookId],
    queryFn: () =>
      fetchJson<DocumentRow[]>(`/api/books/${bookId}/documents`),
    enabled: !!bookId,
  });

  const synopsis = useMemo(
    () => docsData?.find((d) => d.type === "SYNOPSIS"),
    [docsData]
  );

  const { data: findingsData, isLoading: findingsLoading } = useFindings(bookId, {
    chapterNumber: selectedChapter,
    status: "pending",
  });

  const findings = findingsData?.findings ?? [];

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-2">
      {/* Story synopsis panel */}
      <div className="flex min-h-0 flex-col rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <BookOpenIcon className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Story Synopsis</h2>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {synopsis?.content ? (
            <p className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-foreground dark:prose-invert">
              {synopsis.content}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No story synopsis yet — run the &quot;Write synopsis&quot; workflow
              to generate one, then brief your client from here.
            </p>
          )}
        </div>
      </div>

      {/* Chapter findings panel */}
      <div className="flex min-h-0 flex-col rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <MessageSquareQuoteIcon className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Chapter Findings</h2>
          <div className="ml-auto">
            <ChapterSelector chapters={chapters ?? []} />
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-4">
          {findingsLoading && (
            <p className="text-xs text-muted-foreground">Loading findings…</p>
          )}
          {!findingsLoading && findings.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedChapter
                ? "No pending findings for this chapter."
                : "Select a chapter to see its pending findings."}
            </p>
          )}
          {findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} bookId={bookId} />
          ))}
        </div>
      </div>
    </div>
  );
}