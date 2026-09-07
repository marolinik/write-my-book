"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { useFindings } from "@/hooks/use-editorial";
import { useEditorialStore } from "@/stores/editorial-store";
import { ChapterSelector } from "./chapter-selector";
import { FindingCard } from "./finding-card";
import { BookOpenIcon, MessageSquareQuoteIcon, CopyIcon, CheckIcon } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";

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
  const { t } = useLanguage();
  const selectedChapter = useEditorialStore((s) => s.selectedChapter);
  // UDG-20 (personas 4/12/13/19): show pending by default, or all findings
  // (including resolved/applied) when the editor is writing a fuller brief.
  const [status, setStatus] = useState<"pending" | "all">("pending");
  const [copied, setCopied] = useState(false);

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
    ...(status === "pending" ? { status: "pending" } : {}),
  });

  const findings = findingsData?.findings ?? [];

  const copySummary = async () => {
    const synopsisText = synopsis?.content ?? "(no synopsis)";
    const head = findings
      .slice(0, 20)
      .map(
        (f, i) =>
          `${i + 1}. [${f.severity}/${f.category}${selectedChapter ? ` ch.${selectedChapter}` : ""}] ${f.description}${f.suggestion ? ` — ${f.suggestion}` : ""}`
      )
      .join("\n");
    const brief = `STORY SYNOPSIS\n${synopsisText}\n\nCHAPTER FINDINGS (${selectedChapter ?? "all"})\n${head || "(none)"}`;
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — ignore quietly
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-2">
      {/* Story synopsis panel */}
      <div className="flex min-h-0 flex-col rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <BookOpenIcon className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t.editorial.handoff.storySynopsis}</h2>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {synopsis?.content ? (
            <p className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-foreground dark:prose-invert">
              {synopsis.content}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t.editorial.handoff.noSynopsis}
            </p>
          )}
        </div>
      </div>

      {/* Chapter findings panel */}
      <div className="flex min-h-0 flex-col rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <MessageSquareQuoteIcon className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t.editorial.handoff.chapterFindings}</h2>
          <div className="ml-auto flex items-center gap-2">
            <select
              aria-label={t.editorial.handoff.filterLabel}
              value={status}
              onChange={(e) => setStatus(e.target.value as "pending" | "all")}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="pending">{t.editorial.handoff.statusPending}</option>
              <option value="all">{t.editorial.handoff.statusAll}</option>
            </select>
            <button
              type="button"
              onClick={copySummary}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
              title={t.editorial.handoff.copyTitle}
            >
              {copied ? (
                <CheckIcon className="size-3" />
              ) : (
                <CopyIcon className="size-3" />
              )}
              {copied ? t.editorial.handoff.copied : t.editorial.handoff.copy}
            </button>
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
                ? t.editorial.handoff.noFindingsChapter.replace("{status}", status)
                : t.editorial.handoff.noFindingsSelectChapter}
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