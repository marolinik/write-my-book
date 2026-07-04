"use client";

import {
  PenLineIcon,
  BookOpenIcon,
  FlameIcon,
  ClockIcon,
  TrophyIcon,
  BrainIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/components/providers/language-provider";

/**
 * E: Cumulative Lifetime Stats.
 * "You've written 3 novels' worth of words."
 * Shows all-time writing statistics across all books.
 */

interface LifetimeStatsProps {
  totalWords: number;
  totalChapters: number;
  totalBooks?: number;
  totalSessions?: number;
  longestStreak?: number;
  totalDaysWriting?: number;
  memberSince?: string;
}

function novelEquivalent(words: number): string {
  if (words < 10000) return `${(words / 1000).toFixed(1)}K words — keep going!`;
  if (words < 50000) return `${(words / 1000).toFixed(0)}K words — a solid novella`;
  if (words < 80000) return `${(words / 1000).toFixed(0)}K words — almost a novel`;
  const novels = (words / 80000).toFixed(1);
  return `${novels} novels' worth of words`;
}

export function LifetimeStats({
  totalWords,
  totalChapters,
  totalBooks = 1,
  totalSessions = 0,
  longestStreak = 0,
  totalDaysWriting = 0,
  memberSince = "",
}: LifetimeStatsProps) {
  const locale = useLocale();
  const daysSinceMember = memberSince
    ? Math.floor((Date.now() - new Date(memberSince).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrophyIcon className="size-4 text-amber-500" />
          Your Writing Journey
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Member for {daysSinceMember} days &mdash; {novelEquivalent(totalWords)}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatBox icon={PenLineIcon} value={totalWords.toLocaleString(locale)} label="Total Words" color="text-blue-500" />
          <StatBox icon={BookOpenIcon} value={totalChapters.toString()} label="Chapters" color="text-green-500" />
          <StatBox icon={BookOpenIcon} value={totalBooks.toString()} label="Books" color="text-indigo-500" />
          <StatBox icon={BrainIcon} value={totalSessions.toString()} label="AI Sessions" color="text-purple-500" />
          <StatBox icon={FlameIcon} value={`${longestStreak}d`} label="Best Streak" color="text-orange-500" />
          <StatBox icon={ClockIcon} value={`${totalDaysWriting}d`} label="Days Writing" color="text-cyan-500" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatBox({ icon: Icon, value, label, color }: {
  icon: React.ElementType;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border p-2.5 text-center">
      <Icon className={`size-4 mx-auto mb-1 ${color}`} />
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}
