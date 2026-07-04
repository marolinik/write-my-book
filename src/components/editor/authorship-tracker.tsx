"use client";

import { useMemo } from "react";
import { UserIcon, BotIcon, PieChartIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/language-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * H: AI Authorship Tracking.
 * Shows what percentage of the chapter was human-written vs AI-generated.
 * Inspired by iA Writer's authorship tracking.
 * 
 * Tracks at the paragraph level using a data attribute on each paragraph
 * in the TipTap editor (data-author="human" | "ai" | "ai-edited").
 */

interface AuthorshipStats {
  humanWords: number;
  aiWords: number;
  aiEditedWords: number;
  totalWords: number;
}

interface AuthorshipTrackerProps {
  stats: AuthorshipStats;
  /** Show detailed breakdown or compact badge */
  compact?: boolean;
}

export function AuthorshipTracker({ stats, compact }: AuthorshipTrackerProps) {
  const locale = useLocale();
  const { humanPct, aiPct, editedPct } = useMemo(() => {
    const total = stats.totalWords || 1;
    return {
      humanPct: Math.round((stats.humanWords / total) * 100),
      aiPct: Math.round((stats.aiWords / total) * 100),
      editedPct: Math.round((stats.aiEditedWords / total) * 100),
    };
  }, [stats]);

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[10px] gap-1 cursor-default">
            <UserIcon className="size-2.5" />
            {humanPct}% yours
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs space-y-1">
          <div className="flex items-center gap-1.5">
            <UserIcon className="size-3 text-blue-500" />
            <span>Human-written: {stats.humanWords.toLocaleString(locale)} words ({humanPct}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BotIcon className="size-3 text-purple-500" />
            <span>AI-generated: {stats.aiWords.toLocaleString(locale)} words ({aiPct}%)</span>
          </div>
          {stats.aiEditedWords > 0 && (
            <div className="flex items-center gap-1.5">
              <PieChartIcon className="size-3 text-amber-500" />
              <span>AI-edited: {stats.aiEditedWords.toLocaleString(locale)} words ({editedPct}%)</span>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          <PieChartIcon className="size-3" />
          Authorship
        </span>
        <span className="font-medium">{humanPct}% yours</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${humanPct}%` }} title="Human" />
        <div className="h-full bg-purple-400 transition-all" style={{ width: `${aiPct}%` }} title="AI" />
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${editedPct}%` }} title="AI-edited" />
      </div>
      <div className="flex gap-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-blue-500" />Human</span>
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-purple-400" />AI</span>
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" />AI-edited</span>
      </div>
    </div>
  );
}
