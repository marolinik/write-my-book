"use client";

import { useState, useMemo } from "react";
import {
  CheckIcon,
  XIcon,
  RefreshCwIcon,
  CopyIcon,
  ArrowLeftRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Gap 5: AI Rewrite Split-View Comparison
 * Shows original text on the left and AI rewrite on the right
 * with inline diff highlighting (word-level changes).
 * Accept replaces the selection in the editor, reject dismisses.
 */

interface AIRewriteComparisonProps {
  /** Original text from the editor */
  original: string;
  /** AI-generated rewrite */
  rewrite: string;
  /** Label describing the rewrite type (e.g., "Line Edit", "Tighten Prose") */
  rewriteLabel?: string;
  /** Accept — second arg flags whether the writer edited the suggestion first. */
  onAccept: (newText: string, wasEdited: boolean) => void;
  /** Reject — dismiss without changes */
  onReject: () => void;
  /** Request a new rewrite */
  onRegenerate?: () => void;
  /** Whether a regeneration is in progress */
  isRegenerating?: boolean;
  /** When true, show an "Edit" affordance that turns the rewrite pane into a textarea. */
  allowEdit?: boolean;
}

/** Simple word-level diff for highlighting changes */
function computeWordDiff(
  original: string,
  rewrite: string
): { originalWords: Array<{ text: string; changed: boolean }>; rewriteWords: Array<{ text: string; changed: boolean }> } {
  const origWords = original.split(/\s+/);
  const rewWords = rewrite.split(/\s+/);

  // Simple LCS-based approach for highlighting
  const origSet = new Set(origWords);
  const rewSet = new Set(rewWords);

  const originalAnnotated = origWords.map((w) => ({
    text: w,
    changed: !rewSet.has(w),
  }));

  const rewriteAnnotated = rewWords.map((w) => ({
    text: w,
    changed: !origSet.has(w),
  }));

  return { originalWords: originalAnnotated, rewriteWords: rewriteAnnotated };
}

export function AIRewriteComparison({
  original,
  rewrite,
  rewriteLabel,
  onAccept,
  onReject,
  onRegenerate,
  isRegenerating,
  allowEdit,
}: AIRewriteComparisonProps) {
  const [showDiff, setShowDiff] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rewrite);

  const { originalWords, rewriteWords } = useMemo(
    () => computeWordDiff(original, rewrite),
    [original, rewrite]
  );

  // Word count comparison
  const origWordCount = original.split(/\s+/).length;
  const rewWordCount = rewrite.split(/\s+/).length;
  const wordDelta = rewWordCount - origWordCount;

  return (
    <Card className="border-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowLeftRightIcon className="size-4" />
            AI Rewrite Comparison
          </CardTitle>
          <div className="flex items-center gap-2">
            {rewriteLabel && (
              <Badge variant="secondary" className="text-[10px]">
                {rewriteLabel}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {wordDelta >= 0 ? "+" : ""}{wordDelta} words
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Split panels */}
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2">
          {/* Original */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Original ({origWordCount} words)
            </p>
            <ScrollArea className="h-48 rounded-md border p-3 bg-red-500/5">
              <p className="text-sm leading-relaxed font-serif">
                {showDiff
                  ? originalWords.map((w, i) => (
                      <span
                        key={i}
                        className={w.changed ? "bg-red-200 dark:bg-red-900/40 line-through decoration-red-400" : ""}
                      >
                        {w.text}{" "}
                      </span>
                    ))
                  : original}
              </p>
            </ScrollArea>
          </div>

          {/* Rewrite */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              AI Rewrite ({rewWordCount} words)
            </p>
            {editing ? (
              <textarea
                className="h-48 w-full rounded-md border p-3 text-sm leading-relaxed font-serif bg-green-500/5"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              <ScrollArea className="h-48 rounded-md border p-3 bg-green-500/5">
                <p className="text-sm leading-relaxed font-serif">
                  {showDiff
                    ? rewriteWords.map((w, i) => (
                        <span
                          key={i}
                          className={w.changed ? "bg-green-200 dark:bg-green-900/40 font-medium" : ""}
                        >
                          {w.text}{" "}
                        </span>
                      ))
                    : rewrite}
                </p>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => setShowDiff(!showDiff)}
            >
              {showDiff ? "Hide diff" : "Show diff"}
            </Button>
            {onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px]"
                onClick={onRegenerate}
                disabled={isRegenerating}
              >
                <RefreshCwIcon className={`size-3 mr-1 ${isRegenerating ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {allowEdit && !editing && (
              <Button variant="ghost" size="sm" onClick={() => { setDraft(rewrite); setEditing(true); }}>
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onReject}>
              <XIcon className="size-3 mr-1" />
              Reject
            </Button>
            <Button size="sm" onClick={() => onAccept(editing ? draft : rewrite, editing)}>
              <CheckIcon className="size-3 mr-1" />
              {editing ? "Use edited" : "Accept Rewrite"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
