"use client";

import { useLanguage } from "@/components/providers/language-provider";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, MapPin, X } from "lucide-react";
import type { AnnotationType } from "./annotation-extension";

interface AnnotationTooltipProps {
  annotationId: string;
  annotationType: AnnotationType;
  description: string;
  /** Original text (for auto-apply findings). */
  originalText?: string | null;
  /** Replacement text (for auto-apply findings). */
  newText?: string | null;
  /** Anchor rect from the annotation element. */
  anchorRect: DOMRect;
  /** Container rect to position within. */
  containerRect: DOMRect;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
  /** Opens the conversational discussion thread for this finding. */
  onDiscuss?: () => void;
  /** Navigates to the flag's jump-target chapter (continuity flags only). */
  onGoToChapter?: () => void;
  /** Marks a continuity flag as intentional (suppresses future re-detection). */
  onIntentional?: () => void;
  /** [Go to Ch N] target chapter for continuity flags. */
  jumpChapter?: number | null;
}

const TYPE_CONFIG: Record<
  AnnotationType,
  { label: (t: UIStrings) => string; color: string; bg: string }
> = {
  insert: {
    label: (t: UIStrings) => t.editorChrome.annInsertion,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-100 dark:bg-green-900/30",
  },
  delete: {
    label: (t: UIStrings) => t.editorChrome.annDeletion,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  comment: {
    label: (t: UIStrings) => t.editorChrome.annComment,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30",
  },
  ai: {
    label: (t: UIStrings) => t.editorChrome.annAiSuggestion,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-900/30",
  },
  finding: {
    label: (t: UIStrings) => t.editorChrome.annFinding,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  "severity-high": {
    label: (t: UIStrings) => t.editorChrome.annHighSeverity,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  "severity-medium": {
    label: (t: UIStrings) => t.editorChrome.annMediumSeverity,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-100 dark:bg-orange-900/30",
  },
  "severity-low": {
    label: (t: UIStrings) => t.editorChrome.annLowSeverity,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/30",
  },
  continuity: {
    label: (t: UIStrings) => t.editorChrome.annContinuity,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-100 dark:bg-orange-900/30",
  },
};

/**
 * Walk up from the popup to the nearest ancestor that contains the editor's
 * contenteditable, so focus can be returned to it on close (spec §2: every
 * close path — Escape / accept / reject / outside-click — restores the editor).
 */
function findNearestEditable(from: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = from?.parentElement ?? null;
  while (node) {
    const editable = node.querySelector<HTMLElement>(
      '[contenteditable="true"]'
    );
    if (editable) return editable;
    node = node.parentElement;
  }
  return null;
}

export function AnnotationTooltip({
  annotationType,
  description,
  originalText,
  newText,
  anchorRect,
  containerRect,
  onAccept,
  onReject,
  onClose,
  onDiscuss,
  onGoToChapter,
  onIntentional,
  jumpChapter,
}: AnnotationTooltipProps) {
  const { t } = useLanguage();
  const tipRef = useRef<HTMLDivElement>(null);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  const editableRef = useRef<HTMLElement | null>(null);
  const config = TYPE_CONFIG[annotationType];
  const isAutoApply = !!(originalText && newText);

  // Focus management: move focus to Accept on open; return it to the editor
  // contenteditable on close (all close paths unmount this component).
  useEffect(() => {
    editableRef.current = findNearestEditable(tipRef.current);
    acceptButtonRef.current?.focus();
    return () => {
      const editable = editableRef.current;
      if (editable && editable.isConnected) {
        editable.focus();
      }
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to prevent the same click that opened the tooltip from closing it
    const timer = setTimeout(
      () => document.addEventListener("mousedown", handler),
      100
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Position relative to the container
  const top = anchorRect.bottom - containerRect.top + 8;
  const left = Math.max(
    8,
    Math.min(
      anchorRect.left - containerRect.left - 80,
      containerRect.width - 340
    )
  );

  return (
    <div
      ref={tipRef}
      role="dialog"
      aria-label={t.editorUI.reviewSuggestion}
      className="absolute z-50 w-[320px] rounded-lg border bg-popover text-popover-foreground shadow-lg"
      style={{ top, left }}
    >
      <div className="p-3 space-y-2">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <Badge className={`${config.bg} ${config.color} text-xs`}>
            {config.label(t)}
          </Badge>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>

        {/* Diff for auto-apply findings */}
        {isAutoApply && (
          <div className="rounded border bg-muted/30 p-2 text-xs font-mono leading-relaxed space-y-1">
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 text-red-500 font-bold select-none">
                -
              </span>
              <span className="text-red-700 dark:text-red-400 line-through decoration-red-400/60">
                {originalText}
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 text-green-500 font-bold select-none">
                +
              </span>
              <span className="text-green-700 dark:text-green-400">
                {newText}
              </span>
            </div>
          </div>
        )}

        {onDiscuss && (
          <Button variant="ghost" size="sm" className="h-7 text-xs justify-start px-1" onClick={onDiscuss}>
            {t.editorChrome.letsTalkAboutThis}
          </Button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {annotationType === "continuity" ? (
            <>
              {onGoToChapter && jumpChapter != null && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onGoToChapter}>
                  <MapPin className="h-3 w-3" />{" "}
                  {t.editorChrome.goToChapter.replace(
                    "{n}",
                    String(jumpChapter)
                  )}
                </Button>
              )}
              {onIntentional && (
                <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" onClick={onIntentional}>
                  <Check className="h-3 w-3" />{t.editorChrome.intentional}</Button>
              )}
            </>
          ) : (
            <>
              <Button
                ref={acceptButtonRef}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={onAccept}
              >
                <Check className="h-3 w-3" />{t.common.accept}</Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={onReject}
              >
                <X className="h-3 w-3" />{t.common.reject}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
