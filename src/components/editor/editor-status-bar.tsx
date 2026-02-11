"use client";

import { Check, Loader2, AlertCircle } from "lucide-react";

interface EditorStatusBarProps {
  wordCount: number;
  isSaving: boolean;
  isDirty: boolean;
  lastSaved: Date | null;
}

export function EditorStatusBar({
  wordCount,
  isSaving,
  isDirty,
  lastSaved,
}: EditorStatusBarProps) {
  const readingTime = Math.max(1, Math.ceil(wordCount / 250));

  return (
    <div className="flex items-center justify-between border-t px-4 py-1.5 text-xs text-muted-foreground bg-background/95">
      <div className="flex items-center gap-4">
        <span>
          {wordCount.toLocaleString()} word{wordCount !== 1 ? "s" : ""}
        </span>
        <span>{readingTime} min read</span>
      </div>

      <div className="flex items-center gap-1.5">
        {isSaving ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Saving...</span>
          </>
        ) : isDirty ? (
          <>
            <AlertCircle className="h-3 w-3" />
            <span>Unsaved</span>
          </>
        ) : lastSaved ? (
          <>
            <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
            <span>
              Saved{" "}
              {lastSaved.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
