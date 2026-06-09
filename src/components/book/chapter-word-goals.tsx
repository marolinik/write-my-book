"use client";

import { useMemo } from "react";
import { TargetIcon, CheckCircle2Icon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * D: Chapter-Level Word Count Goals with Visual Rollup.
 * Shows per-chapter progress toward individual word targets,
 * plus a rollup bar for the whole book.
 */

interface ChapterGoal {
  id?: string;
  chapterNumber: number;
  title: string | null;
  currentWords?: number;
  wordCount?: number;
  targetWords?: number | null;
  targetWordCount?: number | null;
}

interface ChapterWordGoalsProps {
  bookId?: string;
  chapters: ChapterGoal[];
  bookTarget?: number;
  bookCurrentWords?: number;
}

export function ChapterWordGoals({
  chapters,
  bookTarget,
  bookCurrentWords,
}: ChapterWordGoalsProps) {
  const { totalTarget, totalCurrent, rollupPct } = useMemo(() => {
    const tt = chapters.reduce((s, c) => s + (c.targetWords ?? 0), 0);
    const tc = chapters.reduce((s, c) => s + (c.currentWords ?? 0), 0);
    return {
      totalTarget: bookTarget ?? tt,
      totalCurrent: bookCurrentWords || tc,
      rollupPct: (bookTarget ?? tt) > 0
        ? Math.min(100, Math.round(((bookCurrentWords || tc) / (bookTarget ?? tt)) * 100))
        : 0,
    };
  }, [chapters, bookTarget, bookCurrentWords]);

  return (
    <div className="space-y-3">
      {/* Book-level rollup */}
      {totalTarget > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <TargetIcon className="size-3" />
              Book Target
            </span>
            <span className="font-medium tabular-nums">
              {totalCurrent.toLocaleString()} / {totalTarget.toLocaleString()} ({rollupPct}%)
            </span>
          </div>
          <Progress value={rollupPct} className="h-2" />
        </div>
      )}

      {/* Per-chapter bars */}
      <div className="space-y-1.5">
        {chapters.map((ch) => {
          const target = (ch.targetWords ?? ch.targetWordCount ?? null) ?? 0;
          const pct = target > 0 ? Math.min(100, Math.round(((ch.currentWords ?? ch.wordCount ?? 0) / target) * 100)) : 0;
          const isComplete = target > 0 && (ch.currentWords ?? ch.wordCount ?? 0) >= target;

          return (
            <Tooltip key={ch.chapterNumber}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 group cursor-default">
                  <span className="text-[10px] text-muted-foreground w-8 shrink-0 tabular-nums">
                    Ch.{ch.chapterNumber}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isComplete ? "bg-green-500" : target > 0 ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                      style={{ width: target > 0 ? `${pct}%` : `${Math.min(100, (ch.currentWords ?? ch.wordCount ?? 0) / 30)}%` }}
                    />
                  </div>
                  {isComplete && (
                    <CheckCircle2Icon className="size-3 text-green-500 shrink-0" />
                  )}
                  <span className="text-[9px] text-muted-foreground tabular-nums w-14 text-right shrink-0">
                    {(ch.currentWords ?? ch.wordCount ?? 0).toLocaleString()}
                    {target > 0 ? `/${(target/1000).toFixed(0)}k` : ""}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <p className="font-medium">
                  Ch.{ch.chapterNumber}{ch.title ? `: ${ch.title}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {(ch.currentWords ?? ch.wordCount ?? 0).toLocaleString()} words
                  {target > 0 ? ` of ${target.toLocaleString()} target (${pct}%)` : " (no target set)"}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
