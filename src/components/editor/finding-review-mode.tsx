"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  XIcon,
  SkipForwardIcon,
  ListIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { FindingItem } from "@/hooks/use-editorial";
import { useApplyFinding, useDismissFinding } from "@/hooks/use-editorial";

// ---------------------------------------------------------------------------
// Issue 6: Finding Review Mode
// One-at-a-time review with keyboard navigation.
// Replaces ping-pong scrolling between findings panel and editor text.
// ---------------------------------------------------------------------------

interface FindingReviewModeProps {
  bookId: string;
  findings: FindingItem[];
  /** Called when user exits review mode */
  onExit: () => void;
  /** Called to scroll editor to a specific finding */
  onScrollToFinding?: (finding: FindingItem) => void;
  /** Chapter content for context display */
  chapterContent?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-500 bg-red-500/10",
  important: "text-orange-500 bg-orange-500/10",
  suggestion: "text-blue-500 bg-blue-500/10",
  minor: "text-muted-foreground bg-muted",
};

export function FindingReviewMode({
  bookId,
  findings,
  onExit,
  onScrollToFinding,
  chapterContent,
}: FindingReviewModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const pendingFindings = useMemo(
    () => findings.filter((f) => f.status === "pending"),
    [findings]
  );

  const currentFinding = pendingFindings[currentIndex];
  const totalPending = pendingFindings.length;
  const reviewedCount = reviewedIds.size;
  const progressPct = totalPending > 0 ? Math.round((reviewedCount / totalPending) * 100) : 100;

  const applyMutation = useApplyFinding(bookId);
  const dismissMutation = useDismissFinding(bookId);

  // Scroll editor to current finding
  useEffect(() => {
    if (currentFinding && onScrollToFinding) {
      onScrollToFinding(currentFinding);
    }
  }, [currentFinding, onScrollToFinding]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, totalPending - 1));
  }, [totalPending]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleApply = useCallback(
    (alternativeIndex?: number) => {
      if (!currentFinding) return;
      applyMutation.mutate(
        { findingId: currentFinding.id, alternativeIndex: alternativeIndex ?? 0 },
        {
          onSuccess: () => {
            setReviewedIds((prev) => new Set([...prev, currentFinding.id]));
            goNext();
          },
        }
      );
    },
    [currentFinding, applyMutation, goNext]
  );

  const handleDismiss = useCallback(() => {
    if (!currentFinding) return;
    dismissMutation.mutate(
      { findingId: currentFinding.id },
      {
        onSuccess: () => {
          setReviewedIds((prev) => new Set([...prev, currentFinding.id]));
          goNext();
        },
      }
    );
  }, [currentFinding, dismissMutation, goNext]);

  const handleSkip = useCallback(() => {
    goNext();
  }, [goNext]);

  // Keyboard navigation: j/k for next/prev, a for apply, d for dismiss, s for skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don\'t capture when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          goNext();
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          goPrev();
          break;
        case "a":
          e.preventDefault();
          handleApply();
          break;
        case "d":
          e.preventDefault();
          handleDismiss();
          break;
        case "s":
          e.preventDefault();
          handleSkip();
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [goNext, goPrev, handleApply, handleDismiss, handleSkip, onExit]);

  // All reviewed state
  if (totalPending === 0 || currentIndex >= totalPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-full bg-green-500/10 p-4">
          <CheckIcon className="size-8 text-green-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Review Complete!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You reviewed {reviewedCount} findings.
          </p>
        </div>
        <Button onClick={onExit} variant="outline">
          <ListIcon className="mr-2 size-4" />
          Back to Editor
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onExit}>
            <XIcon className="size-4 mr-1" />
            Exit Review
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} of {totalPending}
          </span>
        </div>
        <Progress value={progressPct} className="w-32 h-1.5" />
      </div>

      {/* Finding card */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Card className="border-2">
          <CardContent className="pt-4 space-y-3">
            {/* Severity + Category badges */}
            <div className="flex flex-wrap gap-2">
              {currentFinding.severity && (
                <Badge
                  className={`text-xs ${SEVERITY_COLORS[currentFinding.severity] ?? ""}`}
                  variant="secondary"
                >
                  {currentFinding.severity}
                </Badge>
              )}
              {currentFinding.category && (
                <Badge variant="outline" className="text-xs">
                  {currentFinding.category}
                </Badge>
              )}
              {currentFinding.agentType && (
                <Badge variant="outline" className="text-xs">
                  {currentFinding.agentType.replace(/-/g, " ")}
                </Badge>
              )}
            </div>

            {/* Description */}
            <p className="text-sm leading-relaxed">{currentFinding.description}</p>

            {/* Anchor quote */}
            {currentFinding.anchorQuote && (
              <div className="rounded-md bg-muted/50 p-3 border-l-2 border-primary">
                <p className="text-sm italic text-muted-foreground">
                  &ldquo;{currentFinding.anchorQuote}&rdquo;
                </p>
              </div>
            )}

            {/* Alternatives */}
            {currentFinding.alternatives && currentFinding.alternatives.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Suggested rewrites
                </p>
                {currentFinding.alternatives.map((alt, i) => (
                  <div
                    key={i}
                    className="rounded-md border p-3 hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => handleApply(i)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {alt.label && (
                          <p className="text-xs font-medium mb-1">{alt.label}</p>
                        )}
                        <p className="text-sm">{alt.newText}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <CheckIcon className="size-3 mr-1" />
                        Apply
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Keyboard shortcuts legend */}
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground justify-center">
          <span><kbd className="px-1 py-0.5 rounded border bg-muted text-[10px]">a</kbd> Apply</span>
          <span><kbd className="px-1 py-0.5 rounded border bg-muted text-[10px]">d</kbd> Dismiss</span>
          <span><kbd className="px-1 py-0.5 rounded border bg-muted text-[10px]">s</kbd> Skip</span>
          <span><kbd className="px-1 py-0.5 rounded border bg-muted text-[10px]">j/k</kbd> Navigate</span>
          <span><kbd className="px-1 py-0.5 rounded border bg-muted text-[10px]">Esc</kbd> Exit</span>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between border-t px-4 py-3 shrink-0 bg-background">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={currentIndex === 0}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={currentIndex >= totalPending - 1}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            <SkipForwardIcon className="size-4 mr-1" />
            Skip
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDismiss}>
            <XIcon className="size-4 mr-1" />
            Dismiss
          </Button>
          <Button size="sm" onClick={() => handleApply()}>
            <CheckIcon className="size-4 mr-1" />
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
