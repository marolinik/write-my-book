"use client";

import { useLanguage } from "@/components/providers/language-provider";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { useState, useMemo } from "react";
import {
  SparklesIcon,
  BookOpenIcon,
  FlameIcon,
  ClockIcon,
  PenLineIcon,
  TrophyIcon,
  ShareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoonIcon,
  SunIcon,
  SunsetIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLocale } from "@/components/providers/language-provider";
import { shortMonthNames, shortWeekdayNames } from "@/lib/i18n/calendar-names";

/**
 * B: Year in Writing Wrapped — Spotify-style annual recap.
 * Swipeable card deck showing personalized writing stats.
 * Each card is screenshot-ready for social sharing.
 */

interface WrappedData {
  year: number;
  totalWords: number;
  totalChapters: number;
  totalSessions: number;
  booksWorkedOn: number;
  longestStreak: number;
  totalDaysWriting: number;
  /** 0-23, or null when no writing sessions exist yet */
  favoriteWritingHour: number | null;
  topGenre: string;
  wordsPerMonth: number[]; // 12 entries
  /** Which month had the most words */
  peakMonth: number; // 0-11
  /** AI sessions cost total */
  totalAICost: number;
  /** Findings reviewed */
  findingsReviewed: number;
  /** Writer personality label */
  writerPersonality: string;
}

interface WrappedCard {
  bg: string;
  content: React.ReactNode;
}

function getTimeOfDayLabel(
  hour: number,
  t: UIStrings
): { label: string; icon: React.ElementType; emoji: string } {
  if (hour >= 5 && hour < 12) return { label: t.bookUI.timeMorning, icon: SunIcon, emoji: "🌅" };
  if (hour >= 12 && hour < 17) return { label: t.bookUI.timeAfternoon, icon: SunsetIcon, emoji: "☀️" };
  if (hour >= 17 && hour < 22) return { label: t.bookUI.timeEvening, icon: SunsetIcon, emoji: "🌆" };
  return { label: t.bookUI.timeNight, icon: MoonIcon, emoji: "🦉" };
}


interface YearInWritingWrappedProps {
  data: WrappedData;
  authorName?: string;
}

export function YearInWritingWrapped({ data, authorName }: YearInWritingWrappedProps) {
  const { t } = useLanguage();
  const [cardIndex, setCardIndex] = useState(0);
  const locale = useLocale();

  const peakMonthName = shortMonthNames(locale)[data.peakMonth];
  const maxMonthWords = Math.max(...data.wordsPerMonth, 1);

  const cards: WrappedCard[] = useMemo(() => {
    const deck: WrappedCard[] = [
      // Card: Opener
      {
        bg: "from-primary/20 via-background to-primary/10",
        content: (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <SparklesIcon className="size-12 text-primary animate-pulse" />
            <div>
              <p className="text-lg text-muted-foreground">{t.bookUI.yourYear}</p>
              <p className="text-5xl font-bold">{data.year}</p>
              <p className="text-lg text-muted-foreground">{t.bookUI.inWriting}</p>
            </div>
            {authorName && <p className="text-sm text-muted-foreground">{authorName}</p>}
          </div>
        ),
      },
      // Card: Total words
      {
        bg: "from-blue-500/20 via-background to-blue-500/10",
        content: (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <p className="text-sm text-muted-foreground">{t.bookUI.youWrote}</p>
            <p className="text-6xl font-bold tabular-nums">{data.totalWords.toLocaleString(locale)}</p>
            <p className="text-lg text-muted-foreground">{t.bookUI.wordsThisYear}</p>
            <p className="text-xs text-muted-foreground mt-4">
              {t.bookUI.thatsPages.replace(
                "{pages}",
                String(Math.round(data.totalWords / 250))
              )}
              {data.totalWords >= 80000
                ? t.bookUI.novelFull
                : data.totalWords >= 50000
                  ? t.bookUI.novelAlmost
                  : data.totalWords >= 20000
                    ? t.bookUI.novellaStrong
                    : t.bookUI.everyWordCounts}
            </p>
          </div>
        ),
      },
    ];

    // Card: Streak — only when there is real daily-writing history
    if (data.longestStreak > 0 || data.totalDaysWriting > 0) {
      deck.push({
        bg: "from-orange-500/20 via-background to-orange-500/10",
        content: (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <FlameIcon className="size-16 text-orange-500" />
            <div>
              <p className="text-sm text-muted-foreground">{t.bookUI.longestStreak}</p>
              <p className="text-5xl font-bold">{data.longestStreak}</p>
              <p className="text-lg text-muted-foreground">{t.bookUI.daysInARow}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.bookUI.showedUpDays.replace(
                "{days}",
                String(data.totalDaysWriting)
              )}
            </p>
          </div>
        ),
      });
    }

    // Card: Writing time — only when a favorite hour is known
    if (data.favoriteWritingHour != null) {
      const favoriteHour = data.favoriteWritingHour;
      const timeOfDay = getTimeOfDayLabel(favoriteHour, t);
      deck.push({
        bg: "from-indigo-500/20 via-background to-indigo-500/10",
        content: (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <p className="text-4xl">{timeOfDay.emoji}</p>
            <div>
              <p className="text-sm text-muted-foreground">{t.bookUI.youAreA}</p>
              <p className="text-3xl font-bold">{timeOfDay.label}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {t.bookUI.writingHappensAround.replace(
                  "{time}",
                  `${favoriteHour > 12 ? favoriteHour - 12 : favoriteHour}${
                    favoriteHour >= 12 ? "pm" : "am"
                  }`
                )}
              </p>
            </div>
          </div>
        ),
      });
    }

    // Card: Monthly breakdown — only when any month has words
    if (data.wordsPerMonth.some((w) => w > 0)) {
      deck.push({
        bg: "from-green-500/20 via-background to-green-500/10",
        content: (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <p className="text-sm text-muted-foreground">{t.bookUI.peakMonthWas}</p>
            <p className="text-4xl font-bold">{peakMonthName}</p>
            <p className="text-sm text-muted-foreground">
              {t.bookUI.wordsCount.replace(
                "{count}",
                data.wordsPerMonth[data.peakMonth]?.toLocaleString(locale) ?? "0"
              )}
            </p>
            <div className="flex items-end gap-1 h-16 mt-4">
              {data.wordsPerMonth.map((w, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <div
                    className={`w-4 rounded-t-sm transition-all ${
                      i === data.peakMonth ? "bg-green-500" : "bg-green-500/30"
                    }`}
                    style={{ height: `${Math.max(2, (w / maxMonthWords) * 60)}px` }}
                  />
                  <span className="text-[7px] text-muted-foreground">{shortMonthNames(locale)[i][0]}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      });
    }

    // Card: Personality + summary
    deck.push({
      bg: "from-purple-500/20 via-background to-purple-500/10",
      content: (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
          <TrophyIcon className="size-12 text-amber-500" />
          <div>
            <p className="text-sm text-muted-foreground">{t.bookUI.writerPersonality}</p>
            <p className="text-3xl font-bold">{data.writerPersonality}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
            <div className="rounded-lg bg-background/50 p-2">
              <p className="font-bold text-lg">{data.booksWorkedOn}</p>
              <p className="text-muted-foreground">{t.bookUI.books}</p>
            </div>
            <div className="rounded-lg bg-background/50 p-2">
              <p className="font-bold text-lg">{data.totalSessions}</p>
              <p className="text-muted-foreground">{t.bookUI.aiSessions}</p>
            </div>
            <div className="rounded-lg bg-background/50 p-2">
              <p className="font-bold text-lg">{data.findingsReviewed}</p>
              <p className="text-muted-foreground">{t.bookUI.editsReviewed}</p>
            </div>
            <div className="rounded-lg bg-background/50 p-2">
              <p className="font-bold text-lg">{data.totalChapters}</p>
              <p className="text-muted-foreground">{t.bookUI.chapters}</p>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/50 mt-4">WriteMyBook &bull; writemybook.com</p>
        </div>
      ),
    });

    return deck;
  }, [data, authorName, peakMonthName, maxMonthWords, locale]);

  const handleShare = async () => {
    const stats = t.bookUI.wrappedShareStats
      .replace("{words}", data.totalWords.toLocaleString(locale))
      .replace("{days}", String(data.longestStreak))
      .replace("{personality}", data.writerPersonality);
    const text = [
      t.bookUI.wrappedShare.replace("{year}", String(data.year)),
      stats,
      "#amwriting #WritingCommunity #YearInWriting",
    ].join("\n");
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast.success(t.toasts.copiedToClipboard);
    } catch { /* ignore */ }
  };

  // Deck length varies with available data — keep the index in range
  const activeIndex = Math.min(cardIndex, cards.length - 1);

  return (
    <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
      {/* Card */}
      <div
        className={`w-full aspect-[9/16] max-h-[500px] rounded-2xl bg-gradient-to-br ${cards[activeIndex].bg} border-2 border-primary/10 p-8 flex flex-col shadow-xl transition-all duration-500`}
      >
        {cards[activeIndex].content}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost" size="icon" className="size-8"
          onClick={() => setCardIndex(Math.max(0, activeIndex - 1))}
          disabled={activeIndex === 0}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>

        {/* Dots */}
        <div className="flex gap-1.5">
          {cards.map((_, i) => (
            <button
              key={i}
              className={`size-2 rounded-full transition-all ${
                i === activeIndex ? "bg-primary scale-125" : "bg-muted-foreground/30"
              }`}
              onClick={() => setCardIndex(i)}
            />
          ))}
        </div>

        <Button
          variant="ghost" size="icon" className="size-8"
          onClick={() => setCardIndex(Math.min(cards.length - 1, activeIndex + 1))}
          disabled={activeIndex === cards.length - 1}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      {/* Share */}
      <Button variant="outline" size="sm" onClick={handleShare}>
        <ShareIcon className="size-3 mr-1.5" />{t.bookUI.shareYourWrapped}</Button>
    </div>
  );
}
