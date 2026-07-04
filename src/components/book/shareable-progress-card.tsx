"use client";

import { useRef, useCallback } from "react";
import {
  ShareIcon,
  DownloadIcon,
  TwitterIcon,
  BookOpenIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useLocale } from "@/components/providers/language-provider";

/**
 * PILLAR 5U: Shareable Progress Cards
 * Beautiful, screenshot-ready progress cards that writers can share
 * on social media to celebrate milestones.
 * 
 * Inspired by Spotify Wrapped and GitHub contribution graphs.
 */

interface ShareableProgressCardProps {
  bookTitle: string;
  authorName?: string;
  totalWords: number;
  chaptersComplete: number;
  totalChapters: number;
  daysWriting: number;
  currentStreak: number;
  /** Type of milestone being shared */
  milestone?: "first_draft" | "editing_complete" | "beta_passed" | "custom";
  /** Custom milestone text */
  milestoneText?: string;
}

export function ShareableProgressCard({
  bookTitle,
  authorName,
  totalWords,
  chaptersComplete,
  totalChapters,
  daysWriting,
  currentStreak,
  milestone,
  milestoneText,
}: ShareableProgressCardProps) {
  const locale = useLocale();
  const cardRef = useRef<HTMLDivElement>(null);

  const milestoneLabels: Record<string, string> = {
    first_draft: "🎉 First Draft Complete!",
    editing_complete: "✨ Editing Complete!",
    beta_passed: "🏆 Beta Reading Passed!",
    custom: milestoneText ?? "📖 Writing Progress",
  };

  const label = milestone ? milestoneLabels[milestone] : "📖 Writing Progress";
  const pct = totalChapters > 0 ? Math.round((chaptersComplete / totalChapters) * 100) : 0;

  const handleShare = useCallback(async () => {
    const text = `${label}\n\n"${bookTitle}"\n${totalWords.toLocaleString(locale)} words | ${chaptersComplete}/${totalChapters} chapters | ${daysWriting} days\n\n#amwriting #WritingCommunity #WriteMyBook`;

    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Progress copied to clipboard — paste it on social media!");
    } catch {
      toast.error("Failed to copy");
    }
  }, [label, bookTitle, totalWords, chaptersComplete, totalChapters, daysWriting, locale]);

  return (
    <div className="space-y-3">
      {/* The shareable card — designed to look good as a screenshot */}
      <div
        ref={cardRef}
        className="rounded-xl bg-gradient-to-br from-primary/10 via-background to-primary/5 border-2 border-primary/20 p-6 space-y-4"
      >
        {/* Milestone badge */}
        <div className="text-center">
          <p className="text-2xl font-bold">{label}</p>
        </div>

        {/* Book title */}
        <div className="text-center">
          <p className="text-lg font-serif font-semibold italic">"{bookTitle}"</p>
          {authorName && (
            <p className="text-sm text-muted-foreground">by {authorName}</p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center rounded-lg bg-background/50 p-3">
            <p className="text-2xl font-bold tabular-nums">{totalWords.toLocaleString(locale)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Words Written</p>
          </div>
          <div className="text-center rounded-lg bg-background/50 p-3">
            <p className="text-2xl font-bold tabular-nums">{chaptersComplete}/{totalChapters}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Chapters</p>
          </div>
          <div className="text-center rounded-lg bg-background/50 p-3">
            <p className="text-2xl font-bold tabular-nums">{daysWriting}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Days Writing</p>
          </div>
          <div className="text-center rounded-lg bg-background/50 p-3">
            <p className="text-2xl font-bold tabular-nums">{currentStreak}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Day Streak 🔥</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Watermark */}
        <p className="text-[9px] text-muted-foreground/50 text-center">
          Created with WriteMyBook • writemybook.com
        </p>
      </div>

      {/* Share buttons */}
      <div className="flex gap-2 justify-center">
        <Button variant="outline" size="sm" onClick={handleShare}>
          <ShareIcon className="size-3 mr-1" />
          Share Progress
        </Button>
      </div>
    </div>
  );
}
