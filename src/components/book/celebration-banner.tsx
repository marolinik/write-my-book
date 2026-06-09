"use client";

import { useState, useEffect } from "react";
import { PartyPopperIcon, XIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Quick Win #8: Progress celebration moments
// Shows a celebratory banner when the author reaches milestones.

interface CelebrationBannerProps {
  bookId: string;
  milestone: "all_drafted" | "all_edited" | "all_beta_passed" | "manuscript_ready";
  bookName?: string;
  onDismiss?: () => void;
}

const CELEBRATIONS: Record<string, { emoji: string; title: string; subtitle: string; color: string }> = {
  all_drafted: {
    emoji: "🎉",
    title: "All chapters drafted!",
    subtitle: "Your first draft is complete. Time to refine!",
    color: "border-blue-500/30 bg-blue-500/5",
  },
  all_edited: {
    emoji: "✨",
    title: "All chapters edited!",
    subtitle: "Your manuscript is polished. Beta reading awaits.",
    color: "border-amber-500/30 bg-amber-500/5",
  },
  all_beta_passed: {
    emoji: "🏆",
    title: "All chapters passed beta reading!",
    subtitle: "Your manuscript is reader-tested and ready.",
    color: "border-green-500/30 bg-green-500/5",
  },
  manuscript_ready: {
    emoji: "📖",
    title: "Your manuscript is ready!",
    subtitle: "All checks passed. Time to publish!",
    color: "border-primary/30 bg-primary/5",
  },
};

export function CelebrationBanner({
  bookId,
  milestone,
  bookName,
  onDismiss,
}: CelebrationBannerProps) {
  const [visible, setVisible] = useState(true);
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    // Check if already dismissed for this milestone
    try {
      const key = `wmb-celebration-${bookId}-${milestone}`;
      if (localStorage.getItem(key) === "dismissed") {
        setVisible(false);
        return;
      }
    } catch {}

    // Stop animation after 3 seconds
    const timer = setTimeout(() => setAnimating(false), 3000);
    return () => clearTimeout(timer);
  }, [bookId, milestone]);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(`wmb-celebration-${bookId}-${milestone}`, "dismissed");
    } catch {}
    onDismiss?.();
  };

  if (!visible) return null;

  const c = CELEBRATIONS[milestone];
  if (!c) return null;

  return (
    <Card className={`${c.color} border-2 ${animating ? "animate-pulse" : ""}`}>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="text-4xl shrink-0">{c.emoji}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{c.title}</p>
          <p className="text-xs text-muted-foreground">{c.subtitle}</p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <XIcon className="size-4" />
        </button>
      </CardContent>
    </Card>
  );
}
