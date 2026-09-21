"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { useMemo } from "react";
import {
  CalendarIcon,
  TrendingUpIcon,
  TargetIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/language-provider";

/**
 * PILLAR 4S: Manuscript Completion Forecast
 * "At your current pace, you'll finish by..."
 * Shows projected completion date based on recent writing velocity.
 */

interface CompletionForecastProps {
  currentWords: number;
  targetWords: number;
  /** Daily word counts for the last 30 days */
  recentDaily: number[];
  /** Date the book was started */
  startDate?: string;
}

export function CompletionForecast({
  currentWords,
  targetWords,
  recentDaily,
  startDate,
}: CompletionForecastProps) {
  const { t } = useLanguage();
  const locale = useLocale();
  const forecast = useMemo(() => {
    if (targetWords <= 0 || currentWords >= targetWords) return null;

    const remaining = targetWords - currentWords;
    const activeDays = recentDaily.filter((d) => d > 0);

    if (activeDays.length === 0) return { daysLeft: null, date: null, pace: 0 };

    // Average words per ACTIVE day (not calendar day)
    const avgPerDay = activeDays.reduce((sum, d) => sum + d, 0) / activeDays.length;

    // Writing frequency: what % of days are active
    const frequency = activeDays.length / Math.max(recentDaily.length, 1);

    // Effective daily rate = avg per active day × frequency
    const effectiveDaily = avgPerDay * frequency;

    if (effectiveDaily <= 0) return { daysLeft: null, date: null, pace: 0 };

    const daysLeft = Math.ceil(remaining / effectiveDaily);
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + daysLeft);

    return {
      daysLeft,
      date: completionDate.toLocaleDateString(locale, {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      pace: Math.round(effectiveDaily),
      frequency: Math.round(frequency * 100),
    };
  }, [currentWords, targetWords, recentDaily, locale]);

  if (!forecast || targetWords <= 0) return null;

  const pct = Math.round((currentWords / targetWords) * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarIcon className="size-4" />{t.bookUI.completionForecast}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {forecast.date ? (
          <>
            <div className="text-center py-2">
              <p className="text-xs text-muted-foreground">{t.appUI.atCurrentPace}</p>
              <p className="text-lg font-bold">{forecast.date}</p>
              <p className="text-xs text-muted-foreground">
                {t.bookUI.daysFromNow.replace("{days}", String(forecast.daysLeft))}
              </p>
            </div>
            <div className="flex justify-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUpIcon className="size-3" />
                {t.bookUI.wordsPerDayAvg.replace("{count}", String(forecast.pace))}
              </span>
              <span className="flex items-center gap-1">
                <TargetIcon className="size-3" />
                {t.bookUI.wordsRemaining.replace(
                  "{count}",
                  (targetWords - currentWords).toLocaleString(locale)
                )}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">{t.bookUI.forecastNeedsData}</p>
        )}
      </CardContent>
    </Card>
  );
}
