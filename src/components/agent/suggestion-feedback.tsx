"use client";

import { useState, useCallback } from "react";
import { ThumbsUpIcon, ThumbsDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { toast } from "sonner";

/**
 * I: Thumbs-up/down AI Suggestion Training.
 * Lets writers rate AI suggestions to calibrate future output.
 * Feedback is stored and used to update writer memory preferences.
 */

interface SuggestionFeedbackProps {
  bookId: string;
  suggestionId: string;
  /** Type of suggestion (finding, rewrite, ghost-text, etc.) */
  suggestionType: string;
  /** The suggestion text for context */
  suggestionText?: string;
  /** Compact mode — just icons */
  compact?: boolean;
  onFeedback?: (positive: boolean) => void;
}

export function SuggestionFeedback({
  bookId,
  suggestionId,
  suggestionType,
  suggestionText,
  compact,
  onFeedback,
}: SuggestionFeedbackProps) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const submitFeedback = useCallback(
    async (positive: boolean) => {
      const newFeedback = positive ? "up" : "down";
      if (feedback === newFeedback) return; // Already submitted

      setFeedback(newFeedback as "up" | "down");
      onFeedback?.(positive);

      try {
        await fetchJson(`/api/books/${bookId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            suggestionId,
            suggestionType,
            positive,
            suggestionText: suggestionText?.slice(0, 500),
          }),
        });
      } catch {
        // Non-critical — don't bother the user
      }
    },
    [bookId, suggestionId, suggestionType, suggestionText, feedback, onFeedback]
  );

  if (compact) {
    return (
      <div className="flex gap-0.5">
        <button
          onClick={() => submitFeedback(true)}
          className={`p-0.5 rounded transition-colors ${
            feedback === "up"
              ? "text-green-500"
              : "text-muted-foreground/40 hover:text-green-500"
          }`}
          title="Helpful suggestion"
        >
          <ThumbsUpIcon className="size-3" />
        </button>
        <button
          onClick={() => submitFeedback(false)}
          className={`p-0.5 rounded transition-colors ${
            feedback === "down"
              ? "text-red-500"
              : "text-muted-foreground/40 hover:text-red-500"
          }`}
          title="Not helpful"
        >
          <ThumbsDownIcon className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground">Was this helpful?</span>
      <Button
        variant={feedback === "up" ? "default" : "ghost"}
        size="sm"
        className="h-6 text-xs gap-1"
        onClick={() => submitFeedback(true)}
      >
        <ThumbsUpIcon className="size-3" />
        Yes
      </Button>
      <Button
        variant={feedback === "down" ? "destructive" : "ghost"}
        size="sm"
        className="h-6 text-xs gap-1"
        onClick={() => submitFeedback(false)}
      >
        <ThumbsDownIcon className="size-3" />
        No
      </Button>
      {feedback && (
        <span className="text-[10px] text-muted-foreground">
          {feedback === "up" ? "Thanks! We\'ll suggest more like this." : "Noted — we\'ll adjust."}
        </span>
      )}
    </div>
  );
}
