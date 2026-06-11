"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import type { FindingItem } from "@/hooks/use-editorial";

interface OverlappingFindingsPopoverProps {
  findings: FindingItem[];
  anchorRect: DOMRect;
  containerRect: DOMRect;
  onSelect: (finding: FindingItem) => void;
  onClose: () => void;
}

const SEVERITY_DOT_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  major: "bg-orange-500",
  moderate: "bg-amber-500",
  minor: "bg-blue-400",
};

/**
 * Walk up from the popover to the nearest ancestor that contains the editor's
 * contenteditable, so focus can be returned to it on close (spec §2).
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

export function OverlappingFindingsPopover({
  findings,
  anchorRect,
  containerRect,
  onSelect,
  onClose,
}: OverlappingFindingsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const firstRowRef = useRef<HTMLButtonElement>(null);
  const editableRef = useRef<HTMLElement | null>(null);

  // Focus management: move focus to the first finding row on open; return it
  // to the editor contenteditable on close. When a row is selected, the
  // AnnotationTooltip that the parent opens next claims focus after this
  // cleanup runs (React runs unmount cleanups before mount effects).
  useEffect(() => {
    editableRef.current = findNearestEditable(popoverRef.current);
    firstRowRef.current?.focus();
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
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    // Delay to prevent the same click that opened the popover from closing it
    const timer = setTimeout(
      () => document.addEventListener("mousedown", handler),
      100
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Position below the anchor rect, relative to the container
  const top = anchorRect.bottom - containerRect.top + 8;
  const left = Math.max(
    8,
    Math.min(
      anchorRect.left - containerRect.left - 60,
      containerRect.width - 300
    )
  );

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Overlapping findings"
      className="absolute z-50 w-[280px] rounded-lg border bg-popover text-popover-foreground shadow-lg"
      style={{ top, left }}
    >
      <div className="p-2 space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground px-2 py-1">
          Multiple findings at this position
        </p>
        {findings.map((finding, index) => (
          <button
            key={finding.id}
            ref={index === 0 ? firstRowRef : undefined}
            className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left hover:bg-muted/50 transition-colors"
            onClick={() => onSelect(finding)}
          >
            {/* Severity dot (decorative — severity is announced via sr-only text) */}
            <span
              aria-hidden="true"
              className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${
                SEVERITY_DOT_COLORS[finding.severity] ??
                SEVERITY_DOT_COLORS.minor
              }`}
            />
            <span className="sr-only">{`${finding.severity} severity`}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {finding.category}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {finding.description.length > 60
                  ? finding.description.substring(0, 60) + "..."
                  : finding.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
