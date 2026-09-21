"use client";

import { countWithNoun, pluralNoun } from "@/lib/i18n/plural";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { useLanguage } from "@/components/providers/language-provider";
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
import { useLocale } from "@/components/providers/language-provider";
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
    label: (t: UIStrings) => t.editorChrome.annAiSuggestion,
    description: (t: UIStrings) => t.editorChrome.legendAiSuggestionDesc,
    bgClass: "bg-violet-500/20 dark:bg-violet-400/25",
    borderClass: "border-b-2 border-violet-500 dark:border-violet-400",
  },
  {
    label: (t: UIStrings) => t.editorChrome.annFinding,
    description: (t: UIStrings) => t.editorChrome.legendFindingDesc,
    bgClass: "bg-red-500/20 dark:bg-red-400/25",
    borderClass: "border-b-2 border-red-500 dark:border-red-400",
  },
  {
    label: (t: UIStrings) => t.editorChrome.legendAcceptedChange,
    description: (t: UIStrings) => t.editorChrome.legendAcceptedDesc,
    bgClass: "bg-green-500/20 dark:bg-green-400/25",
    borderClass: "border-b-2 border-green-500 dark:border-green-400",
  },
  {
    label: (t: UIStrings) => t.editorChrome.annDeletion,
    description: (t: UIStrings) => t.editorChrome.legendDeletionDesc,
    bgClass: "bg-red-500/15 dark:bg-red-400/20",
    borderClass: "border-b-0",
    extra: "line-through decoration-red-500/70 dark:decoration-red-400/60",
  },
  {
    label: (t: UIStrings) => t.editorChrome.annComment,
    description: (t: UIStrings) => t.editorChrome.legendCommentDesc,
    bgClass: "bg-amber-500/20 dark:bg-amber-400/25",
    borderClass: "border-b-2 border-dashed border-amber-500 dark:border-amber-400",
  },
] as const;

/* ── Annotation Legend (popover) ─────────────────────────────── */

function AnnotationLegend() {
  const { t } = useLanguage();
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
          aria-label={t.editorUI.annotationLegend}
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
        <p className="text-xs font-medium mb-2">{t.editorUI.annotationLegend}</p>
        <ul className="space-y-1.5">
          {LEGEND_ITEMS.map((item) => (
            <li key={item.label(t)} className="flex items-center gap-2 text-xs">
              <span
                className={`inline-block w-8 h-3.5 rounded-sm shrink-0 ${item.bgClass} ${item.borderClass}`}
              />
              <span className="text-foreground">{item.label(t)}</span>
              <span className="text-muted-foreground ml-auto text-[10px] leading-tight">
                {item.description(t)}
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
  const { t, language } = useLanguage();
  const locale = useLocale();
  const readingTime = Math.max(1, Math.ceil(wordCount / 250));

  return (
    <div className="flex items-center justify-between border-t px-4 py-1.5 text-xs text-muted-foreground bg-background/95">
      <div className="flex items-center gap-4 min-w-0">
        <span className="shrink-0">
          {wordCount.toLocaleString(locale)}{" "}
          {pluralNoun(wordCount, t.editorChrome.wordOne, t.editorChrome.wordMany, {
            few: t.editorChrome.wordFew,
            language,
          })}
        </span>
        <span className="hidden min-[400px]:inline shrink-0">
          {t.editorChrome.minRead.replace("{count}", String(readingTime))}
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
            aria-label={t.editorUI.annotationSummary}
            className="hidden sm:flex items-center gap-4"
          >
            {(annotationCounts.insert ?? 0) > 0 && (
              <span className="text-green-600 dark:text-green-400">
                <span aria-hidden="true">
                  +
                  {countWithNoun(
                    annotationCounts.insert,
                    t.editorChrome.insertOne,
                    t.editorChrome.insertMany,
                    { few: t.editorChrome.insertFew, language }
                  )}
                </span>
                <span className="sr-only">
                  {countWithNoun(
                    annotationCounts.insert,
                    t.editorChrome.insertOne,
                    t.editorChrome.insertMany,
                    { few: t.editorChrome.insertFew, language }
                  )}
                </span>
              </span>
            )}
            {(annotationCounts.delete ?? 0) > 0 && (
              <span className="text-red-600 dark:text-red-400">
                <span aria-hidden="true">
                  -
                  {countWithNoun(
                    annotationCounts.delete,
                    t.editorChrome.deleteOne,
                    t.editorChrome.deleteMany,
                    { few: t.editorChrome.deleteFew, language }
                  )}
                </span>
                <span className="sr-only">
                  {countWithNoun(
                    annotationCounts.delete,
                    t.editorChrome.deleteOne,
                    t.editorChrome.deleteMany,
                    { few: t.editorChrome.deleteFew, language }
                  )}
                </span>
              </span>
            )}
            {(annotationCounts.comment ?? 0) > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                <span>
                  {countWithNoun(
                    annotationCounts.comment,
                    t.editorChrome.commentOne,
                    t.editorChrome.commentMany,
                    { few: t.editorChrome.commentFew, language }
                  )}
                </span>
              </span>
            )}
            {(annotationCounts["severity-high"] ?? 0) > 0 && (
              <span className="text-red-600 dark:text-red-400">
                <span aria-hidden="true">
                  {t.editorChrome.severityHighShort.replace(
                    "{count}",
                    String(annotationCounts["severity-high"])
                  )}
                </span>
                <span className="sr-only">
                  {t.editorChrome.severityHighFindings.replace(
                    "{countNoun}",
                    countWithNoun(
                      annotationCounts["severity-high"] ?? 0,
                      t.agentUI.findingOne,
                      t.agentUI.findingMany,
                      { few: t.agentUI.findingFew, language }
                    )
                  )}
                </span>
              </span>
            )}
            {(annotationCounts["severity-medium"] ?? 0) > 0 && (
              <span className="text-orange-600 dark:text-orange-400">
                <span aria-hidden="true">
                  {t.editorChrome.severityMediumShort.replace(
                    "{count}",
                    String(annotationCounts["severity-medium"])
                  )}
                </span>
                <span className="sr-only">
                  {t.editorChrome.severityMediumFindings.replace(
                    "{countNoun}",
                    countWithNoun(
                      annotationCounts["severity-medium"] ?? 0,
                      t.agentUI.findingOne,
                      t.agentUI.findingMany,
                      { few: t.agentUI.findingFew, language }
                    )
                  )}
                </span>
              </span>
            )}
            {(annotationCounts["severity-low"] ?? 0) > 0 && (
              <span className="text-blue-600 dark:text-blue-400">
                <span aria-hidden="true">
                  {t.editorChrome.severityLowShort.replace(
                    "{count}",
                    String(annotationCounts["severity-low"])
                  )}
                </span>
                <span className="sr-only">
                  {t.editorChrome.severityLowFindings.replace(
                    "{countNoun}",
                    countWithNoun(
                      annotationCounts["severity-low"] ?? 0,
                      t.agentUI.findingOne,
                      t.agentUI.findingMany,
                      { few: t.agentUI.findingFew, language }
                    )
                  )}
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
            <AlertTriangle className="h-3 w-3" />{t.editorChrome.conflictReview}</button>
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
              <span>{t.editorUI.saving}</span>
            </>
          ) : !isOnline && isDirty && draftSavedAt != null ? (
            <>
              <CloudOff className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              <span className="text-amber-600 dark:text-amber-400">{t.editorChrome.offlineSavedLocally}</span>
            </>
          ) : !isOnline && isDirty ? (
            <>
              <CloudOff className="h-3 w-3 text-red-600 dark:text-red-400" />
              <span className="text-red-600 dark:text-red-400">{t.editorChrome.offlineNotSaved}</span>
            </>
          ) : isOnline && isDirty && lastSaveErrorKind === "network" ? (
            <>
              <RefreshCw className="h-3 w-3" />
              <span>{t.editorUI.syncPending}</span>
            </>
          ) : isDirty ? (
            <>
              <AlertCircle className="h-3 w-3" />
              <span>{t.editorUI.unsaved}</span>
            </>
          ) : lastSaved ? (
            <>
              <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              <span>
                {t.editorChrome.savedAt.replace(
                  "{time}",
                  lastSaved.toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                )}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
