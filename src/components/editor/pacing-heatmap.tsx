"use client";

import { useMemo, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { BarChart3Icon, XIcon } from "lucide-react";

/**
 * Gap 8: Sentence-Length Visual Pacing Heatmap
 * ProWritingAid-style visualization showing sentence length variation.
 * Renders as a compact bar chart in the editor gutter or toolbar area.
 * Each bar = one sentence, height = word count, color = length category.
 */

interface PacingHeatmapProps {
  /** Plain text content to analyze */
  text: string;
  /** Max height in pixels for the visualization */
  maxHeight?: number;
  /** Called when user clicks a sentence bar to jump to it */
  onSentenceClick?: (sentenceIndex: number) => void;
}

interface SentenceStats {
  text: string;
  words: number;
  category: "short" | "medium" | "long" | "very-long";
}

const CATEGORY_COLORS: Record<string, string> = {
  short: "bg-green-400 dark:bg-green-600",
  medium: "bg-blue-400 dark:bg-blue-500",
  long: "bg-amber-400 dark:bg-amber-500",
  "very-long": "bg-red-400 dark:bg-red-500",
};

function categorize(wordCount: number): SentenceStats["category"] {
  if (wordCount <= 8) return "short";
  if (wordCount <= 18) return "medium";
  if (wordCount <= 30) return "long";
  return "very-long";
}

export function PacingHeatmap({
  text,
  maxHeight = 60,
  onSentenceClick,
}: PacingHeatmapProps) {
  const [expanded, setExpanded] = useState(false);

  const sentences = useMemo((): SentenceStats[] => {
    const raw = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);

    return raw.map((s) => {
      const words = s.trim().split(/\s+/).length;
      return {
        text: s.trim(),
        words,
        category: categorize(words),
      };
    });
  }, [text]);

  const maxWords = Math.max(...sentences.map((s) => s.words), 1);

  // Summary stats
  const avgWords = sentences.length > 0
    ? (sentences.reduce((sum, s) => sum + s.words, 0) / sentences.length).toFixed(1)
    : "0";
  const shortPct = sentences.length > 0
    ? Math.round((sentences.filter((s) => s.category === "short").length / sentences.length) * 100)
    : 0;
  const longPct = sentences.length > 0
    ? Math.round((sentences.filter((s) => s.category === "very-long").length / sentences.length) * 100)
    : 0;

  if (!expanded) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setExpanded(true)}
      >
        <BarChart3Icon className="size-3" />
        Pacing
      </Button>
    );
  }

  return (
    <div className="border rounded-md p-3 space-y-2 bg-background">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium flex items-center gap-1">
          <BarChart3Icon className="size-3" />
          Sentence Pacing
        </h4>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Avg: {avgWords} words</span>
          <span className="text-green-500">{shortPct}% short</span>
          <span className="text-red-500">{longPct}% long</span>
          <button
            onClick={() => setExpanded(false)}
            aria-label="Close pacing heatmap"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      </div>

      {/* Heatmap bars */}
      <div className="flex items-end gap-px" style={{ height: maxHeight }}>
        {sentences.map((s, i) => {
          const height = Math.max(2, (s.words / maxWords) * maxHeight);
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button
                  className={`flex-1 min-w-[2px] max-w-[6px] rounded-t-sm transition-opacity hover:opacity-80 ${CATEGORY_COLORS[s.category]}`}
                  style={{ height }}
                  onClick={() => onSentenceClick?.(i)}
                  aria-label={`Section ${i + 1}: ${s.category} pacing`}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs">
                <p className="font-medium">{s.words} words</p>
                <p className="text-muted-foreground line-clamp-2 mt-0.5">
                  {s.text.slice(0, 100)}...
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-green-400" /> Short (≤8)
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-blue-400" /> Medium (9-18)
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-amber-400" /> Long (19-30)
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-400" /> Very Long (30+)
        </span>
      </div>
    </div>
  );
}
