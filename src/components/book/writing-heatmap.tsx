"use client";

import { useMemo, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlameIcon, CalendarIcon, TrendingUpIcon } from "lucide-react";

/**
 * PILLAR 1A: Writing Heatmap — GitHub-style contribution graph.
 * Shows daily writing activity over the past year.
 * The #1 habit-forming hook in writing apps.
 * 
 * Design principles (from research):
 * - Even 50 words gets a light shade (no empty square shame)
 * - Show "Current Streak" and "Best Streak" side by side
 * - Celebration for milestones, never punishment for gaps
 * - Gentle color gradients (green, like GitHub)
 */

interface DayData {
  date: string; // YYYY-MM-DD
  words: number;
}

interface WritingHeatmapProps {
  /** Daily word counts for the past 365 days */
  data: DayData[];
  /** Current active streak in days */
  currentStreak: number;
  /** Best ever streak in days */
  bestStreak: number;
  /** Total words written in the period */
  totalWords: number;
}

/** Color intensity based on word count — NEVER empty for any writing */
function getIntensity(words: number): string {
  if (words === 0) return "bg-muted/40 dark:bg-muted/20";
  if (words < 100) return "bg-green-200 dark:bg-green-900/40"; // Even a little counts
  if (words < 500) return "bg-green-300 dark:bg-green-800/60";
  if (words < 1000) return "bg-green-400 dark:bg-green-700/70";
  if (words < 2000) return "bg-green-500 dark:bg-green-600";
  return "bg-green-600 dark:bg-green-500"; // 2000+ words
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export function WritingHeatmap({
  data,
  currentStreak,
  bestStreak,
  totalWords,
}: WritingHeatmapProps) {
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);

  // Build 365-day grid (52 weeks × 7 days)
  const grid = useMemo(() => {
    const dataMap = new Map<string, number>();
    for (const d of data) {
      dataMap.set(d.date, d.words);
    }

    const today = new Date();
    const weeks: Array<Array<{ date: string; words: number; dayOfWeek: number }>> = [];
    let currentWeek: Array<{ date: string; words: number; dayOfWeek: number }> = [];

    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayOfWeek = d.getDay();

      const entry = { date: dateStr, words: dataMap.get(dateStr) ?? 0, dayOfWeek };

      if (dayOfWeek === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(entry);
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    return weeks;
  }, [data]);

  // Month labels positioned above the correct weeks
  const monthLabels = useMemo(() => {
    const labels: Array<{ label: string; weekIndex: number }> = [];
    let lastMonth = -1;

    grid.forEach((week, weekIndex) => {
      const firstDay = week[0];
      if (firstDay) {
        const month = new Date(firstDay.date).getMonth();
        if (month !== lastMonth) {
          labels.push({ label: MONTH_LABELS[month], weekIndex });
          lastMonth = month;
        }
      }
    });

    return labels;
  }, [grid]);

  // Stats
  const activeDays = data.filter((d) => d.words > 0).length;
  const avgWords = activeDays > 0
    ? Math.round(totalWords / activeDays)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarIcon className="size-4" />
            Writing Activity
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-[10px] gap-1">
              <FlameIcon className="size-3" />
              {currentStreak}d streak
            </Badge>
            {bestStreak > currentStreak && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <TrendingUpIcon className="size-3" />
                Best: {bestStreak}d
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Month labels */}
        <div className="flex gap-[3px] mb-1 ml-8">
          {monthLabels.map((m, i) => (
            <span
              key={i}
              className="text-[9px] text-muted-foreground"
              style={{ marginLeft: `${m.weekIndex * 13 - (i > 0 ? monthLabels[i-1].weekIndex * 13 + 20 : 0)}px` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-0.5">
          {/* Day-of-week labels */}
          <div className="flex flex-col gap-[3px] mr-1">
            {DAY_LABELS.map((label, i) => (
              <span key={i} className="text-[9px] text-muted-foreground h-[11px] leading-[11px]">
                {label}
              </span>
            ))}
          </div>

          {/* Week columns */}
          <div className="flex gap-[3px] overflow-x-auto">
            {grid.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {/* Pad incomplete first week */}
                {wi === 0 && week[0] && Array.from({ length: week[0].dayOfWeek }).map((_, i) => (
                  <div key={`pad-${i}`} className="size-[11px]" />
                ))}
                {week.map((day) => (
                  <Tooltip key={day.date}>
                    <TooltipTrigger asChild>
                      <button
                        className={`size-[11px] rounded-[2px] transition-colors ${getIntensity(day.words)} hover:ring-1 hover:ring-foreground/30`}
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">{day.words.toLocaleString()} words</p>
                      <p className="text-muted-foreground">
                        {new Date(day.date).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend + Stats */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span>Less</span>
            {[0, 100, 500, 1000, 2000].map((words) => (
              <div key={words} className={`size-[9px] rounded-[1px] ${getIntensity(words)}`} />
            ))}
            <span>More</span>
          </div>
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            <span>{totalWords.toLocaleString()} words total</span>
            <span>{activeDays} active days</span>
            <span>{avgWords.toLocaleString()} avg/day</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
