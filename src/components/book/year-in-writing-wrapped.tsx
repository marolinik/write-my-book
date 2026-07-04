"use client";

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

function getTimeOfDayLabel(hour: number): { label: string; icon: React.ElementType; emoji: string } {
  if (hour >= 5 && hour < 12) return { label: "Morning Writer", icon: SunIcon, emoji: "🌅" };
  if (hour >= 12 && hour < 17) return { label: "Afternoon Author", icon: SunsetIcon, emoji: "☀️" };
  if (hour >= 17 && hour < 22) return { label: "Evening Storyteller", icon: SunsetIcon, emoji: "🌆" };
  return { label: "Night Owl", icon: MoonIcon, emoji: "🦉" };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface YearInWritingWrappedProps {
  data: WrappedData;
  authorName?: string;
}

export function YearInWritingWrapped({ data, authorName }: YearInWritingWrappedProps) {
  const [cardIndex, setCardIndex] = useState(0);
  const locale = useLocale();

  const peakMonthName = MONTH_NAMES[data.peakMonth];
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
              <p className="text-lg text-muted-foreground">Your</p>
              <p className="text-5xl font-bold">{data.year}</p>
              <p className="text-lg text-muted-foreground">in Writing</p>
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
            <p className="text-sm text-muted-foreground">You wrote</p>
            <p className="text-6xl font-bold tabular-nums">{data.totalWords.toLocaleString(locale)}</p>
            <p className="text-lg text-muted-foreground">words this year</p>
            <p className="text-xs text-muted-foreground mt-4">
              That&apos;s {Math.round(data.totalWords / 250)} pages &mdash;
              {data.totalWords >= 80000 ? " a full novel!" :
               data.totalWords >= 50000 ? " almost a novel!" :
               data.totalWords >= 20000 ? " a strong novella!" :
               " and every word counts!"}
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
              <p className="text-sm text-muted-foreground">Your longest streak</p>
              <p className="text-5xl font-bold">{data.longestStreak}</p>
              <p className="text-lg text-muted-foreground">days in a row</p>
            </div>
            <p className="text-xs text-muted-foreground">
              You showed up {data.totalDaysWriting} out of 365 days
            </p>
          </div>
        ),
      });
    }

    // Card: Writing time — only when a favorite hour is known
    if (data.favoriteWritingHour != null) {
      const favoriteHour = data.favoriteWritingHour;
      const timeOfDay = getTimeOfDayLabel(favoriteHour);
      deck.push({
        bg: "from-indigo-500/20 via-background to-indigo-500/10",
        content: (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <p className="text-4xl">{timeOfDay.emoji}</p>
            <div>
              <p className="text-sm text-muted-foreground">You&apos;re a</p>
              <p className="text-3xl font-bold">{timeOfDay.label}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Most of your writing happens around {favoriteHour > 12 ? favoriteHour - 12 : favoriteHour}
                {favoriteHour >= 12 ? "pm" : "am"}
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
            <p className="text-sm text-muted-foreground">Your peak month was</p>
            <p className="text-4xl font-bold">{peakMonthName}</p>
            <p className="text-sm text-muted-foreground">
              {data.wordsPerMonth[data.peakMonth]?.toLocaleString(locale)} words
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
                  <span className="text-[7px] text-muted-foreground">{MONTH_NAMES[i][0]}</span>
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
            <p className="text-sm text-muted-foreground">Your writer personality</p>
            <p className="text-3xl font-bold">{data.writerPersonality}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
            <div className="rounded-lg bg-background/50 p-2">
              <p className="font-bold text-lg">{data.booksWorkedOn}</p>
              <p className="text-muted-foreground">books</p>
            </div>
            <div className="rounded-lg bg-background/50 p-2">
              <p className="font-bold text-lg">{data.totalSessions}</p>
              <p className="text-muted-foreground">AI sessions</p>
            </div>
            <div className="rounded-lg bg-background/50 p-2">
              <p className="font-bold text-lg">{data.findingsReviewed}</p>
              <p className="text-muted-foreground">edits reviewed</p>
            </div>
            <div className="rounded-lg bg-background/50 p-2">
              <p className="font-bold text-lg">{data.totalChapters}</p>
              <p className="text-muted-foreground">chapters</p>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/50 mt-4">WriteMyBook &bull; writemybook.com</p>
        </div>
      ),
    });

    return deck;
  }, [data, authorName, peakMonthName, maxMonthWords, locale]);

  const handleShare = async () => {
    const text = `My ${data.year} in Writing:\n${data.totalWords.toLocaleString(locale)} words | ${data.longestStreak}-day streak | ${data.writerPersonality}\n#amwriting #WritingCommunity #YearInWriting`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
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
        <ShareIcon className="size-3 mr-1.5" />
        Share Your Wrapped
      </Button>
    </div>
  );
}
