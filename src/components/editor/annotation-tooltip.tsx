"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
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
}

const TYPE_CONFIG: Record<
  AnnotationType,
  { label: string; color: string; bg: string }
> = {
  insert: {
    label: "Insertion",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-100 dark:bg-green-900/30",
  },
  delete: {
    label: "Deletion",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  comment: {
    label: "Comment",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30",
  },
  ai: {
    label: "AI Suggestion",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-900/30",
  },
  finding: {
    label: "Editorial Finding",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  "severity-high": {
    label: "High Severity",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  "severity-medium": {
    label: "Medium Severity",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-100 dark:bg-orange-900/30",
  },
  "severity-low": {
    label: "Low Severity",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/30",
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
}: AnnotationTooltipProps) {
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
      aria-label="Review suggestion"
      className="absolute z-50 w-[320px] rounded-lg border bg-popover text-popover-foreground shadow-lg"
      style={{ top, left }}
    >
      <div className="p-3 space-y-2">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <Badge className={`${config.bg} ${config.color} text-xs`}>
            {config.label}
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
            Let&apos;s talk about this
          </Button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            ref={acceptButtonRef}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onAccept}
          >
            <Check className="h-3 w-3" />
            Accept
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onReject}
          >
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
