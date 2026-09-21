"use client";

import { useLanguage } from "@/components/providers/language-provider";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
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

function novelEquivalent(words: number, t: UIStrings): string {
  const thousands = (digits: number) => (words / 1000).toFixed(digits);
  if (words < 10000) return t.bookUI.lifeKeepGoing.replace("{k}", thousands(1));
  if (words < 50000) return t.bookUI.lifeNovella.replace("{k}", thousands(0));
  if (words < 80000) return t.bookUI.lifeAlmostNovel.replace("{k}", thousands(0));
  return t.bookUI.lifeNovels.replace("{n}", (words / 80000).toFixed(1));
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
  const { t } = useLanguage();
  const locale = useLocale();
  const daysSinceMember = memberSince
    ? Math.floor((Date.now() - new Date(memberSince).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrophyIcon className="size-4 text-amber-500" />{t.bookUI.writingJourney}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t.bookUI.memberForDays
            .replace("{days}", String(daysSinceMember))
            .replace("{equivalent}", novelEquivalent(totalWords, t))}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatBox icon={PenLineIcon} value={totalWords.toLocaleString(locale)} label={t.bookUI.totalWords} color="text-blue-500" />
          <StatBox icon={BookOpenIcon} value={totalChapters.toString()} label={t.bookUI.chapters} color="text-green-500" />
          <StatBox icon={BookOpenIcon} value={totalBooks.toString()} label={t.bookUI.books} color="text-indigo-500" />
          <StatBox icon={BrainIcon} value={totalSessions.toString()} label={t.bookUI.aiSessions} color="text-purple-500" />
          <StatBox icon={FlameIcon} value={`${longestStreak}d`} label={t.bookUI.bestStreak} color="text-orange-500" />
          <StatBox icon={ClockIcon} value={`${totalDaysWriting}d`} label={t.bookUI.daysWriting} color="text-cyan-500" />
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
