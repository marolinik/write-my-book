"use client";

import { useState, useEffect } from "react";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import {
  GiftIcon,
  LockIcon,
  UnlockIcon,
  PaletteIcon,
  SparklesIcon,
  MusicIcon,
  ImageIcon,
  TypeIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/providers/language-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

/**
 * T: Milestone Unlockable Rewards.
 * Writers unlock editor themes, soundscapes, fonts, and writing prompts
 * by hitting milestones. Never punitive — always celebratory.
 */

interface Reward {
  id: string;
  label: (t: UIStrings) => string;
  description: (t: UIStrings) => string;
  icon: React.ElementType;
  category: "theme" | "sound" | "font" | "prompt" | "badge";
  unlockedAt: string; // milestone that unlocks it
  requiresWords?: number;
  requiresStreak?: number;
  requiresChapters?: number;
}

const ALL_REWARDS: Reward[] = [
  { id: "theme-midnight", label: (t: UIStrings) => t.bookUI.rewardMidnight, description: (t: UIStrings) => t.bookUI.rewardMidnightDesc, icon: PaletteIcon, category: "theme", unlockedAt: "1000 words", requiresWords: 1000 },
  { id: "theme-forest", label: (t: UIStrings) => t.bookUI.rewardForest, description: (t: UIStrings) => t.bookUI.rewardForestDesc, icon: PaletteIcon, category: "theme", unlockedAt: "5000 words", requiresWords: 5000 },
  { id: "theme-sunrise", label: (t: UIStrings) => t.bookUI.rewardSunrise, description: (t: UIStrings) => t.bookUI.rewardSunriseDesc, icon: PaletteIcon, category: "theme", unlockedAt: "10000 words", requiresWords: 10000 },
  { id: "theme-galaxy", label: (t: UIStrings) => t.bookUI.rewardGalaxy, description: (t: UIStrings) => t.bookUI.rewardGalaxyDesc, icon: PaletteIcon, category: "theme", unlockedAt: "50000 words", requiresWords: 50000 },
  { id: "sound-thunder", label: (t: UIStrings) => t.bookUI.rewardThunder, description: (t: UIStrings) => t.bookUI.rewardThunderDesc, icon: MusicIcon, category: "sound", unlockedAt: "3-day streak", requiresStreak: 3 },
  { id: "sound-space", label: (t: UIStrings) => t.bookUI.rewardSpace, description: (t: UIStrings) => t.bookUI.rewardSpaceDesc, icon: MusicIcon, category: "sound", unlockedAt: "7-day streak", requiresStreak: 7 },
  { id: "font-garamond", label: () => "Garamond", description: (t: UIStrings) => t.bookUI.rewardGaramondDesc, icon: TypeIcon, category: "font", unlockedAt: "First chapter", requiresChapters: 1 },
  { id: "font-literata", label: () => "Literata", description: (t: UIStrings) => t.bookUI.rewardLiterataDesc, icon: TypeIcon, category: "font", unlockedAt: "5 chapters", requiresChapters: 5 },
  { id: "badge-novelist", label: (t: UIStrings) => t.bookUI.rewardNovelist, description: (t: UIStrings) => t.bookUI.rewardNovelistDesc, icon: SparklesIcon, category: "badge", unlockedAt: "50000 words", requiresWords: 50000 },
  { id: "badge-ironwriter", label: (t: UIStrings) => t.bookUI.rewardIronWriter, description: (t: UIStrings) => t.bookUI.rewardIronWriterDesc, icon: SparklesIcon, category: "badge", unlockedAt: "30-day streak", requiresStreak: 30 },
];

interface MilestoneRewardsProps {
  totalWords: number;
  currentStreak: number;
  chaptersComplete: number;
}

export function MilestoneRewards({ totalWords, currentStreak, chaptersComplete }: MilestoneRewardsProps) {
  const { t } = useLanguage();
  const [justUnlocked, setJustUnlocked] = useState<string | null>(null);

  const rewards = ALL_REWARDS.map((r) => {
    const unlocked =
      (r.requiresWords ? totalWords >= r.requiresWords : true) &&
      (r.requiresStreak ? currentStreak >= r.requiresStreak : true) &&
      (r.requiresChapters ? chaptersComplete >= r.requiresChapters : true);
    return { ...r, unlocked };
  });

  const unlockedCount = rewards.filter((r) => r.unlocked).length;

  // Check for newly unlocked rewards
  useEffect(() => {
    const storageKey = "wmb-unlocked-rewards";
    try {
      const prev = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[];
      const current = rewards.filter((r) => r.unlocked).map((r) => r.id);
      const newlyUnlocked = current.filter((id) => !prev.includes(id));
      if (newlyUnlocked.length > 0) {
        const reward = rewards.find((r) => r.id === newlyUnlocked[0]);
        if (reward) {
          setJustUnlocked(reward.id);
          toast.success(t.bookUI.rewardUnlockedNamed.replace("{reward}", reward.label(t)), {
            description: reward.description(t),
          });
          setTimeout(() => setJustUnlocked(null), 3000);
        }
        localStorage.setItem(storageKey, JSON.stringify(current));
      }
    } catch {}
  }, [rewards]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <GiftIcon className="size-4 text-primary" />{t.bookUI.rewards}</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {unlockedCount}/{rewards.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-2">
          {rewards.map((r) => {
            const Icon = r.icon;
            const isNew = r.id === justUnlocked;
            return (
              <Tooltip key={r.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex flex-col items-center gap-1 rounded-md border p-2 transition-all ${
                      r.unlocked
                        ? isNew ? "bg-primary/20 ring-2 ring-primary animate-pulse" : "bg-muted/30"
                        : "opacity-30 grayscale"
                    }`}
                  >
                    {r.unlocked ? (
                      <Icon className="size-5 text-primary" />
                    ) : (
                      <LockIcon className="size-5 text-muted-foreground" />
                    )}
                    <span className="text-[8px] text-center leading-tight">{r.label(t)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-48">
                  <p className="font-medium">{r.label(t)}</p>
                  <p className="text-muted-foreground">{r.description(t)}</p>
                  <p className="text-muted-foreground mt-1">
                    {r.unlocked
                      ? t.bookUI.rewardUnlocked
                      : t.bookUI.rewardUnlockAt.replace("{target}", r.unlockedAt)}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
