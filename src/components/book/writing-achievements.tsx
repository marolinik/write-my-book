"use client";

import { useLanguage } from "@/components/providers/language-provider";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { useMemo } from "react";
import {
  TrophyIcon,
  FlameIcon,
  PenLineIcon,
  BookOpenIcon,
  StarIcon,
  TargetIcon,
  ZapIcon,
  HeartIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Gap 10: Writing Achievements / Gamification
 * NaNoWriMo-style achievement badges that track writing milestones.
 * Displayed on the Writing Dashboard and in the sidebar.
 */

interface WritingStats {
  totalWords: number;
  streak: number;
  chaptersCompleted: number;
  totalChapters: number;
  betaPassedChapters: number;
  findingsReviewed: number;
  sessionsCompleted: number;
  sprintPersonalBest: number;
}

interface Achievement {
  id: string;
  icon: React.ElementType;
  label: (t: UIStrings) => string;
  description: (t: UIStrings) => string;
  earned: boolean;
  color: string;
}

export function getAchievements(stats: WritingStats): Achievement[] {
  return [
    {
      id: "first-words",
      icon: PenLineIcon,
      label: (t: UIStrings) => t.bookUI.achFirstWords,
      description: (t: UIStrings) => t.bookUI.achFirstWordsDesc,
      earned: stats.totalWords >= 100,
      color: "text-blue-500",
    },
    {
      id: "thousand",
      icon: PenLineIcon,
      label: (t: UIStrings) => t.bookUI.achGettingStarted,
      description: (t: UIStrings) => t.bookUI.achGettingStartedDesc,
      earned: stats.totalWords >= 1000,
      color: "text-blue-600",
    },
    {
      id: "ten-thousand",
      icon: StarIcon,
      label: (t: UIStrings) => t.bookUI.achSerious,
      description: (t: UIStrings) => t.bookUI.achSeriousDesc,
      earned: stats.totalWords >= 10000,
      color: "text-indigo-500",
    },
    {
      id: "fifty-thousand",
      icon: TrophyIcon,
      label: (t: UIStrings) => t.bookUI.achNaNo,
      description: (t: UIStrings) => t.bookUI.achNaNoDesc,
      earned: stats.totalWords >= 50000,
      color: "text-amber-500",
    },
    {
      id: "hundred-thousand",
      icon: TrophyIcon,
      label: (t: UIStrings) => t.bookUI.achProlific,
      description: (t: UIStrings) => t.bookUI.achProlificDesc,
      earned: stats.totalWords >= 100000,
      color: "text-amber-600",
    },
    {
      id: "streak-3",
      icon: FlameIcon,
      label: (t: UIStrings) => t.bookUI.achOnRoll,
      description: (t: UIStrings) => t.bookUI.achOnRollDesc,
      earned: stats.streak >= 3,
      color: "text-orange-500",
    },
    {
      id: "streak-7",
      icon: FlameIcon,
      label: (t: UIStrings) => t.bookUI.achWeek,
      description: (t: UIStrings) => t.bookUI.achWeekDesc,
      earned: stats.streak >= 7,
      color: "text-orange-600",
    },
    {
      id: "streak-30",
      icon: FlameIcon,
      label: (t: UIStrings) => t.bookUI.achMonthly,
      description: (t: UIStrings) => t.bookUI.achMonthlyDesc,
      earned: stats.streak >= 30,
      color: "text-red-500",
    },
    {
      id: "first-chapter",
      icon: BookOpenIcon,
      label: (t: UIStrings) => t.bookUI.achChapterOne,
      description: (t: UIStrings) => t.bookUI.achChapterOneDesc,
      earned: stats.chaptersCompleted >= 1,
      color: "text-green-500",
    },
    {
      id: "all-drafted",
      icon: BookOpenIcon,
      label: (t: UIStrings) => t.bookUI.achFirstDraft,
      description: (t: UIStrings) => t.bookUI.achFirstDraftDesc,
      earned: stats.chaptersCompleted >= stats.totalChapters && stats.totalChapters > 0,
      color: "text-green-600",
    },
    {
      id: "beta-passed",
      icon: HeartIcon,
      label: (t: UIStrings) => t.bookUI.achReaderApproved,
      description: (t: UIStrings) => t.bookUI.achReaderApprovedDesc,
      earned: stats.betaPassedChapters >= stats.totalChapters && stats.totalChapters > 0,
      color: "text-pink-500",
    },
    {
      id: "sprint-master",
      icon: ZapIcon,
      label: (t: UIStrings) => t.bookUI.achSprint,
      description: (t: UIStrings) => t.bookUI.achSprintDesc,
      earned: stats.sprintPersonalBest >= 500,
      color: "text-purple-500",
    },
    {
      id: "editor-power",
      icon: TargetIcon,
      label: (t: UIStrings) => t.bookUI.achEditorialEye,
      description: (t: UIStrings) => t.bookUI.achEditorialEyeDesc,
      earned: stats.findingsReviewed >= 50,
      color: "text-cyan-500",
    },
  ];
}

interface WritingAchievementsProps {
  stats: WritingStats;
  compact?: boolean;
}

export function WritingAchievements({ stats, compact }: WritingAchievementsProps) {
  const { t } = useLanguage();
  const achievements = useMemo(() => getAchievements(stats), [stats]);
  const earned = achievements.filter((a) => a.earned);
  const total = achievements.length;

  if (compact) {
    // Compact: just show earned badges in a row
    return (
      <div className="flex flex-wrap gap-1">
        {earned.map((a) => (
          <Tooltip key={a.id}>
            <TooltipTrigger>
              <Badge
                variant="secondary"
                className={`text-[10px] gap-1 ${a.color}`}
              >
                <a.icon className="size-3" />
                {a.label(t)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{a.description(t)}</TooltipContent>
          </Tooltip>
        ))}
        {earned.length === 0 && (
          <span className="text-xs text-muted-foreground">{t.appUI.noAchievements}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <TrophyIcon className="size-4 text-amber-500" />{t.bookUI.achievements}</h3>
        <span className="text-xs text-muted-foreground">
          {earned.length}/{total}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {achievements.map((a) => (
          <Tooltip key={a.id}>
            <TooltipTrigger asChild>
              <div
                className={`flex items-center gap-2 rounded-md border p-2 transition-opacity ${
                  a.earned ? "opacity-100" : "opacity-30 grayscale"
                }`}
              >
                <a.icon className={`size-4 shrink-0 ${a.earned ? a.color : "text-muted-foreground"}`} />
                <div>
                  <p className="text-[10px] font-medium">{a.label(t)}</p>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-48">
              {a.description(t)}
              {!a.earned && ` — ${t.bookUI.keepWriting}`}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
