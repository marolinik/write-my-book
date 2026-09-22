"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useFindings } from "@/hooks/use-editorial";
import { rankFindings } from "@/lib/editorial/finding-triage";
import type { FindingItem } from "@/hooks/use-editorial";
import { useEditorialStore } from "@/stores/editorial-store";
import { useEditorPaneStore } from "@/stores/editor-store";
import { useLanguage } from "@/components/providers/language-provider";
import { FindingCard } from "./finding-card";

/** How many findings a judged chapter leads with before "show the rest". */
const TRIAGE_LEAD = 5;

interface ChapterInfo {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
}

interface FindingsPanelProps {
  bookId: string;
  chapters?: ChapterInfo[];
}

export function FindingsPanel({ bookId, chapters }: FindingsPanelProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const setScrollToText = useEditorPaneStore("primary", (s) => s.setScrollToText);
  const { filters, selectedChapter, resetFilters } = useEditorialStore();

  const queryFilters = {
    ...filters,
    chapterNumber: selectedChapter,
  };

  const { data, isLoading } = useFindings(bookId, queryFilters);
  const [expanded, setExpanded] = useState<boolean>(false);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const findings = data?.findings ?? [];
  const total = data?.total ?? 0;

  // Triage: a judged chapter opens on what would do the most for a reader,
  // with the rest one click away. An unjudged one is exactly what it was
  // before — creation order — and says so rather than pretending to rank.
  // A list mixes judged and unjudged findings: a chapter's pending notes get
  // triaged, its applied and dismissed ones never do, and the all-chapters
  // view spans both. So the judged ones are ranked and lead, the rest keep
  // the order they had. Requiring every finding to be judged would have
  // meant the ranking never appeared at all.
  const judged = findings.filter((f) => f.triagedAt !== null);
  const unjudged = findings.filter((f) => f.triagedAt === null);
  const isTriaged = judged.length > 0;
  const ordered = isTriaged
    ? [
        ...rankFindings(
          judged.map((f) => ({
            findingId: f.id,
            impact: f.impactScore ?? 0,
            ruleConflict: f.ruleConflict ?? 0,
            impactConfidence: 1,
            finding: f,
          }))
        ).map((r) => r.finding),
        ...unjudged,
      ]
    : findings;
  const leading = isTriaged && !expanded ? ordered.slice(0, TRIAGE_LEAD) : ordered;
  const hidden = ordered.length - leading.length;

  const handleShowInText = (finding: FindingItem) => {
    const text = finding.originalText;
    if (!text) {
      toast.info(finding.description, { duration: 4000 });
      return;
    }

    // Find the chapter to navigate to
    const chapter = chapters?.find(
      (ch) => ch.chapterNumber === finding.chapterNumber
    );
    if (!chapter) {
      toast.error(
        t.editorial.findings.chapterNotFound.replace(
          "{chapterNumber}",
          String(finding.chapterNumber)
        )
      );
      return;
    }

    // Set the text to scroll to, then navigate to the chapter editor
    setScrollToText(text);
    router.push(`/books/${bookId}/chapters/${chapter.id}`);
  };

  // Determine if any filters are active
  const hasActiveFilters =
    filters.severity !== null ||
    filters.category !== null ||
    filters.status !== null ||
    filters.agentType !== null ||
    selectedChapter !== null;

  if (findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        {hasActiveFilters ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t.editorial.findings.noMatch}
            </p>
            <Button variant="outline" size="sm" onClick={resetFilters}>
              {t.editorial.findings.resetFilters}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{t.editorial.findings.empty}</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {t.editorial.findings.emptyDesc}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <span className="text-sm font-medium">
          {isTriaged ? t.editorialUI.triageTitle : t.editorial.findings.title}
        </span>
        <Badge variant="secondary">{total}</Badge>
      </div>
      {!isTriaged && findings.length > TRIAGE_LEAD && (
        <p className="px-4 py-2 text-xs text-muted-foreground border-b">
          {t.editorialUI.triageUntriaged}
        </p>
      )}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {leading.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              bookId={bookId}
              onShowInText={chapters ? handleShowInText : undefined}
            />
          ))}
          {isTriaged && (hidden > 0 || expanded) && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setExpanded((v: boolean) => !v)}
            >
              {expanded
                ? t.editorialUI.triageCollapse
                : t.editorialUI.triageRest.replace("{n}", String(hidden))}
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
