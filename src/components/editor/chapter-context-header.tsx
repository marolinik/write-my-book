"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getStatusLabel } from "@/lib/i18n/ui-strings";
import { VersionBranching } from "./version-branching";

const STATUS_COLORS: Record<string, string> = {
  undiscussed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  discussed: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  planned: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  drafted: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  dev_edited: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  line_edited: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  beta_read: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  beta_passed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

interface ChapterContextHeaderProps {
  bookId?: string;
  chapterId?: string;
  chapterNumber: number;
  chapterTitle?: string;
  status: string;
  wordCount: number;
  targetWordCount?: number | null;
  language?: string;
}

export function ChapterContextHeader({
  bookId,
  chapterId,
  chapterNumber,
  chapterTitle,
  status,
  wordCount,
  targetWordCount,
  language = "en",
}: ChapterContextHeaderProps) {
  const label = getStatusLabel(status, language);
  const colorClass = STATUS_COLORS[status] ?? STATUS_COLORS.undiscussed;
  const progress = targetWordCount && targetWordCount > 0
    ? Math.min(100, Math.round((wordCount / targetWordCount) * 100))
    : null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 text-sm shrink-0">
      {/* Left: Chapter name + status */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="font-medium truncate">
          Ch. {chapterNumber}
          {chapterTitle ? ` \u2014 ${chapterTitle}` : ""}
        </span>
        <Badge
          variant="secondary"
          className={`text-[10px] px-1.5 py-0 shrink-0 ${colorClass}`}
        >
          {label}
        </Badge>

        {/* Version branching button */}
        {bookId && chapterId && (
          <VersionBranching
            bookId={bookId}
            chapterId={chapterId}
            chapterNumber={chapterNumber}
          />
        )}
      </div>

      {/* Right: Word count + progress */}
      <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {wordCount.toLocaleString()}
          {targetWordCount ? ` / ${targetWordCount.toLocaleString()}` : ""}
          {" words"}
        </span>
        {progress !== null && (
          <Progress value={progress} className="w-16 h-1.5" />
        )}
      </div>
    </div>
  );
}
