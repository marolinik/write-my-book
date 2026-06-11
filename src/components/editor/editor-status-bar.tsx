"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  CloudOff,
  RefreshCw,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { AnnotationCounts } from "./annotation-extension";
import type { SaveErrorKind } from "@/stores/editor-store";
import { SessionTimer } from "./session-timer";
import { AuthorshipTracker } from "./authorship-tracker";

interface EditorStatusBarProps {
  wordCount: number;
  isSaving: boolean;
  isDirty: boolean;
  lastSaved: Date | null;
  annotationCounts?: AnnotationCounts | null;
  /** True while an unresolved save conflict is pending (autosave suspended). */
  hasSaveConflict?: boolean;
  /** Opens the save-conflict review dialog. */
  onReviewConflict?: () => void;
  /** Browser connectivity; defaults to true so existing callers keep today's behavior. */
  isOnline?: boolean;
  /** Epoch ms of the last successful IndexedDB draft write; null when nothing is buffered. */
  draftSavedAt?: number | null;
  /** Classification of the most recent autosave failure ("network" enables the sync-pending state). */
  lastSaveErrorKind?: SaveErrorKind | null;
}

/* ── Legend items matching globals.css annotation classes ─────── */

const LEGEND_ITEMS = [
  {
    label: "AI suggestion",
    description: "Has replacement text",
    bgClass: "bg-violet-500/20 dark:bg-violet-400/25",
    borderClass: "border-b-2 border-violet-500 dark:border-violet-400",
  },
  {
    label: "Editorial finding",
    description: "Needs review",
    bgClass: "bg-red-500/20 dark:bg-red-400/25",
    borderClass: "border-b-2 border-red-500 dark:border-red-400",
  },
  {
    label: "Accepted change",
    description: "Inserted text",
    bgClass: "bg-green-500/20 dark:bg-green-400/25",
    borderClass: "border-b-2 border-green-500 dark:border-green-400",
  },
  {
    label: "Deletion",
    description: "Struck-through text",
    bgClass: "bg-red-500/15 dark:bg-red-400/20",
    borderClass: "border-b-0",
    extra: "line-through decoration-red-500/70 dark:decoration-red-400/60",
  },
  {
    label: "Comment",
    description: "Inline note",
    bgClass: "bg-amber-500/20 dark:bg-amber-400/25",
    borderClass: "border-b-2 border-dashed border-amber-500 dark:border-amber-400",
  },
] as const;

/* ── Annotation Legend (popover) ─────────────────────────────── */

function AnnotationLegend() {
  const [hasAnimated, setHasAnimated] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Subtle pulse on first mount to draw attention
  useEffect(() => {
    const seen = sessionStorage.getItem("wmb:legend-seen");
    if (!seen) {
      setHasAnimated(true);
      const timer = setTimeout(() => {
        setHasAnimated(false);
        sessionStorage.setItem("wmb:legend-seen", "1");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          aria-label="Annotation legend"
          className={`inline-flex items-center justify-center rounded p-0.5 hover:bg-muted transition-colors ${
            hasAnimated ? "animate-pulse" : ""
          }`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        className="w-56 p-3"
      >
        <p className="text-xs font-medium mb-2">Annotation Legend</p>
        <ul className="space-y-1.5">
          {LEGEND_ITEMS.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-xs">
              <span
                className={`inline-block w-8 h-3.5 rounded-sm shrink-0 ${item.bgClass} ${item.borderClass}`}
              />
              <span className="text-foreground">{item.label}</span>
              <span className="text-muted-foreground ml-auto text-[10px] leading-tight">
                {item.description}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/* ── Status Bar ──────────────────────────────────────────────── */

export function EditorStatusBar({
  wordCount,
  isSaving,
  isDirty,
  lastSaved,
  annotationCounts,
  hasSaveConflict,
  onReviewConflict,
  isOnline = true,
  draftSavedAt = null,
  lastSaveErrorKind = null,
}: EditorStatusBarProps) {
  const readingTime = Math.max(1, Math.ceil(wordCount / 250));

  return (
    <div className="flex items-center justify-between border-t px-4 py-1.5 text-xs text-muted-foreground bg-background/95">
      <div className="flex items-center gap-4 min-w-0">
        <span className="shrink-0">
          {wordCount.toLocaleString()} word{wordCount !== 1 ? "s" : ""}
        </span>
        <span className="hidden min-[400px]:inline shrink-0">
          {readingTime} min read
        </span>

        {/* Timer + authorship: hidden on phones — the word count and the
            save cluster are the load-bearing items at narrow widths */}
        <div className="hidden sm:flex items-center gap-4">
          <SessionTimer currentWordCount={wordCount} />
          <AuthorshipTracker
            stats={{ humanWords: wordCount, aiWords: 0, aiEditedWords: 0, totalWords: wordCount }}
            compact
          />
        </div>

        {/* Count cluster: hidden on phones (word count, reading time, timer,
            and the save cluster stay visible at all widths). Each count pairs
            the frozen visible text (aria-hidden) with a descriptive sr-only
            twin — aria-label is prohibited on generic spans (ARIA 1.2). */}
        {annotationCounts && (
          <div
            role="group"
            aria-label="Annotation summary"
            className="hidden sm:flex items-center gap-4"
          >
            {(annotationCounts.insert ?? 0) > 0 && (
              <span className="text-green-600 dark:text-green-400">
                <span aria-hidden="true">
                  +{annotationCounts.insert} insert
                  {annotationCounts.insert !== 1 ? "s" : ""}
                </span>
                <span className="sr-only">
                  {annotationCounts.insert} insertion
                  {annotationCounts.insert !== 1 ? "s" : ""}
                </span>
              </span>
            )}
            {(annotationCounts.delete ?? 0) > 0 && (
              <span className="text-red-600 dark:text-red-400">
                <span aria-hidden="true">
                  -{annotationCounts.delete} delete
                  {annotationCounts.delete !== 1 ? "s" : ""}
                </span>
                <span className="sr-only">
                  {annotationCounts.delete} deletion
                  {annotationCounts.delete !== 1 ? "s" : ""}
                </span>
              </span>
            )}
            {(annotationCounts.comment ?? 0) > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                <span aria-hidden="true">
                  {annotationCounts.comment} comment
                  {annotationCounts.comment !== 1 ? "s" : ""}
                </span>
                <span className="sr-only">
                  {annotationCounts.comment} comment
                  {annotationCounts.comment !== 1 ? "s" : ""}
                </span>
              </span>
            )}
            {(annotationCounts["severity-high"] ?? 0) > 0 && (
              <span className="text-red-600 dark:text-red-400">
                <span aria-hidden="true">
                  {annotationCounts["severity-high"]} high
                </span>
                <span className="sr-only">
                  {annotationCounts["severity-high"]} high severity finding
                  {annotationCounts["severity-high"] !== 1 ? "s" : ""}
                </span>
              </span>
            )}
            {(annotationCounts["severity-medium"] ?? 0) > 0 && (
              <span className="text-orange-600 dark:text-orange-400">
                <span aria-hidden="true">
                  {annotationCounts["severity-medium"]} med
                </span>
                <span className="sr-only">
                  {annotationCounts["severity-medium"]} medium severity finding
                  {annotationCounts["severity-medium"] !== 1 ? "s" : ""}
                </span>
              </span>
            )}
            {(annotationCounts["severity-low"] ?? 0) > 0 && (
              <span className="text-blue-600 dark:text-blue-400">
                <span aria-hidden="true">
                  {annotationCounts["severity-low"]} low
                </span>
                <span className="sr-only">
                  {annotationCounts["severity-low"]} low severity finding
                  {annotationCounts["severity-low"] !== 1 ? "s" : ""}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* shrink-0: the save status must never be squeezed out by the left
          cluster on narrow phones */}
      <div className="flex items-center gap-2 shrink-0">
        <AnnotationLegend />

        {/* Persistent conflict chip — durable affordance after the toast expires */}
        {hasSaveConflict && (
          <button
            type="button"
            onClick={onReviewConflict}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors"
          >
            <AlertTriangle className="h-3 w-3" />
            Conflict — click to review
          </button>
        )}

        <div
          className="flex items-center gap-1.5"
          data-testid="editor-save-status"
          role="status"
          aria-live="polite"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          ) : !isOnline && isDirty && draftSavedAt != null ? (
            <>
              <CloudOff className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              <span className="text-amber-600 dark:text-amber-400">
                Offline — saved on this device
              </span>
            </>
          ) : !isOnline && isDirty ? (
            <>
              <CloudOff className="h-3 w-3 text-red-600 dark:text-red-400" />
              <span className="text-red-600 dark:text-red-400">
                Offline — changes not saved
              </span>
            </>
          ) : isOnline && isDirty && lastSaveErrorKind === "network" ? (
            <>
              <RefreshCw className="h-3 w-3" />
              <span>Sync pending</span>
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
    </div>
  );
}
