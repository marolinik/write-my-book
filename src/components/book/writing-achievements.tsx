"use client";

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
  label: string;
  description: string;
  earned: boolean;
  color: string;
}

export function getAchievements(stats: WritingStats): Achievement[] {
  return [
    {
      id: "first-words",
      icon: PenLineIcon,
      label: "First Words",
      description: "Write your first 100 words",
      earned: stats.totalWords >= 100,
      color: "text-blue-500",
    },
    {
      id: "thousand",
      icon: PenLineIcon,
      label: "Getting Started",
      description: "Write 1,000 words",
      earned: stats.totalWords >= 1000,
      color: "text-blue-600",
    },
    {
      id: "ten-thousand",
      icon: StarIcon,
      label: "Serious Writer",
      description: "Write 10,000 words",
      earned: stats.totalWords >= 10000,
      color: "text-indigo-500",
    },
    {
      id: "fifty-thousand",
      icon: TrophyIcon,
      label: "NaNoWriMo!",
      description: "Write 50,000 words (a full novel!)",
      earned: stats.totalWords >= 50000,
      color: "text-amber-500",
    },
    {
      id: "hundred-thousand",
      icon: TrophyIcon,
      label: "Prolific Author",
      description: "Write 100,000 words",
      earned: stats.totalWords >= 100000,
      color: "text-amber-600",
    },
    {
      id: "streak-3",
      icon: FlameIcon,
      label: "On a Roll",
      description: "Write 3 days in a row",
      earned: stats.streak >= 3,
      color: "text-orange-500",
    },
    {
      id: "streak-7",
      icon: FlameIcon,
      label: "Week Warrior",
      description: "Write 7 days in a row",
      earned: stats.streak >= 7,
      color: "text-orange-600",
    },
    {
      id: "streak-30",
      icon: FlameIcon,
      label: "Monthly Master",
      description: "Write 30 days in a row",
      earned: stats.streak >= 30,
      color: "text-red-500",
    },
    {
      id: "first-chapter",
      icon: BookOpenIcon,
      label: "Chapter One",
      description: "Complete your first chapter",
      earned: stats.chaptersCompleted >= 1,
      color: "text-green-500",
    },
    {
      id: "all-drafted",
      icon: BookOpenIcon,
      label: "First Draft Done",
      description: "Draft all chapters",
      earned: stats.chaptersCompleted >= stats.totalChapters && stats.totalChapters > 0,
      color: "text-green-600",
    },
    {
      id: "beta-passed",
      icon: HeartIcon,
      label: "Reader Approved",
      description: "Pass beta reading on all chapters",
      earned: stats.betaPassedChapters >= stats.totalChapters && stats.totalChapters > 0,
      color: "text-pink-500",
    },
    {
      id: "sprint-master",
      icon: ZapIcon,
      label: "Sprint Master",
      description: "Write 500+ words in a single sprint",
      earned: stats.sprintPersonalBest >= 500,
      color: "text-purple-500",
    },
    {
      id: "editor-power",
      icon: TargetIcon,
      label: "Editorial Eye",
      description: "Review 50+ editorial findings",
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
                {a.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{a.description}</TooltipContent>
          </Tooltip>
        ))}
        {earned.length === 0 && (
          <span className="text-xs text-muted-foreground">No achievements yet — start writing!</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <TrophyIcon className="size-4 text-amber-500" />
          Achievements
        </h3>
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
                  <p className="text-[10px] font-medium">{a.label}</p>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-48">
              {a.description}
              {!a.earned && " — Keep writing!"}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
