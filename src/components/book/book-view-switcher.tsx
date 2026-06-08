"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  LayoutGridIcon,
  ListIcon,
  KanbanIcon,
  PlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InlineEditableTitle } from "@/components/book/inline-editable-title";
import { cn } from "@/lib/utils";
import { getStatusLabel } from "@/lib/i18n/ui-strings";
import { BookCanvas } from "./book-canvas";
import { ChapterPipeline } from "./chapter-pipeline";

type ViewMode = "list" | "canvas" | "pipeline";

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  undiscussed: "outline",
  discussed: "outline",
  planned: "secondary",
  drafted: "secondary",
  dev_edited: "default",
  line_edited: "default",
  beta_read: "default",
  beta_passed: "default",
};

export interface ChapterData {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
  wordCount: number;
  actNumber: number;
  targetWordCount: number | null;
  betaScore: number | null;
}

interface BookViewSwitcherProps {
  bookId: string;
  chapters: ChapterData[];
  language?: string;
  labels: {
    chapters: string;
    addChapter: string;
    noChapters: string;
    colNum: string;
    colTitle: string;
    colAct: string;
    colStatus: string;
    colWords: string;
    colScore: string;
    colAction: string;
    untitled: string;
    act: string;
    edit: string;
  };
}

export function BookViewSwitcher({
  bookId,
  chapters,
  language = "en",
  labels,
}: BookViewSwitcherProps) {
  const storageKey = `wmb-book-view-${bookId}`;

  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const saved = localStorage.getItem(storageKey);
    if (saved === "canvas" || saved === "pipeline" || saved === "list") return saved;
    return "list";
  });

  useEffect(() => {
    localStorage.setItem(storageKey, view);
  }, [view, storageKey]);

  const views: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "list", label: "List", icon: <ListIcon className="size-4" /> },
    { key: "canvas", label: "Canvas", icon: <LayoutGridIcon className="size-4" /> },
    { key: "pipeline", label: "Pipeline", icon: <KanbanIcon className="size-4" /> },
  ];

  return (
    <div className="mb-8">
      {/* Header with view toggle and add button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold">{labels.chapters}</h2>
          {/* View toggle */}
          <div className="flex items-center rounded-md border bg-muted/50 p-0.5">
            {views.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  view === v.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v.icon}
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
        </div>
        <Button asChild size="sm">
          <Link href={`/books/${bookId}/chapters/new`}>
            <PlusIcon className="mr-1 size-4" />
            {labels.addChapter}
          </Link>
        </Button>
      </div>

      {/* Content */}
      {chapters.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {labels.noChapters}
          </CardContent>
        </Card>
      ) : view === "list" ? (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">{labels.colNum}</th>
                <th className="px-4 py-2 text-left font-medium">{labels.colTitle}</th>
                <th className="px-4 py-2 text-left font-medium">{labels.colAct}</th>
                <th className="px-4 py-2 text-left font-medium">{labels.colStatus}</th>
                <th className="px-4 py-2 text-right font-medium">{labels.colWords}</th>
                <th className="px-4 py-2 text-right font-medium">Target</th>
                <th className="px-4 py-2 text-center font-medium">{labels.colScore}</th>
                <th className="px-4 py-2 text-right font-medium">{labels.colAction}</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((ch) => {
                const chTarget = ch.targetWordCount ?? 0;
                const chPct = chTarget > 0 ? Math.min(Math.round((ch.wordCount / chTarget) * 100), 100) : -1;
                return (
                  <tr key={ch.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">
                      {ch.chapterNumber}
                    </td>
                    <td className="px-4 py-2">
                      <InlineEditableTitle
                        bookId={bookId}
                        chapterId={ch.id}
                        initialTitle={ch.title ?? ""}
                        placeholder={labels.untitled}
                      />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {labels.act} {ch.actNumber}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={STATUS_COLORS[ch.status] ?? "outline"}
                        className="text-xs"
                      >
                        {getStatusLabel(ch.status, language)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {ch.wordCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {chTarget > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${chPct >= 100 ? "bg-green-500" : "bg-primary/60"}`}
                              style={{ width: `${chPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {chPct}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {ch.betaScore != null ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs font-mono cursor-default",
                                ch.betaScore < 4 && "border-red-500 text-red-600 dark:text-red-400",
                                ch.betaScore >= 4 && ch.betaScore < 7 && "border-yellow-500 text-yellow-600 dark:text-yellow-400",
                                ch.betaScore >= 7 && "border-green-500 text-green-600 dark:text-green-400"
                              )}
                            >
                              {ch.betaScore.toFixed(1)}/10
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {/* TODO: Enrich tooltip with last scored date and iteration count — requires AgentSession query (deferred) */}
                            Beta score: {ch.betaScore.toFixed(1)} / 10
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button asChild variant="ghost" size="xs">
                        <Link href={`/books/${bookId}/chapters/${ch.id}`}>
                          {labels.edit}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : view === "canvas" ? (
        <BookCanvas bookId={bookId} initialChapters={chapters} />
      ) : (
        <ChapterPipeline bookId={bookId} initialChapters={chapters} language={language} />
      )}
    </div>
  );
}
