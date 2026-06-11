"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { findTextPositions } from "./annotation-extension";
import type { FindingItem } from "@/hooks/use-editorial";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GutterMarkerData {
  findingId: string;
  top: number;
  severity: string;
  category: string;
  textPreview: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  major: "bg-orange-500",
  moderate: "bg-amber-500",
  minor: "bg-blue-400",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "High",
  major: "High",
  moderate: "Medium",
  minor: "Low",
};

/**
 * The button is a 24px touch target (WCAG 2.5.8) wrapping the 12px visual
 * dot. Offsetting `top` by half the size difference keeps the dot exactly
 * where the old 12px button rendered.
 */
const MARKER_TARGET_OFFSET_PX = 6;

interface GutterMarkersProps {
  editor: Editor | null;
  findings: FindingItem[];
  visible: boolean;
  onMarkerClick: (findingId: string, rect: DOMRect) => void;
}

export function GutterMarkers({
  editor,
  findings,
  visible,
  onMarkerClick,
}: GutterMarkersProps) {
  const [markers, setMarkers] = useState<GutterMarkerData[]>([]);
  const rafRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const recalculate = useCallback(() => {
    if (!editor || !visible || findings.length === 0) {
      setMarkers([]);
      return;
    }

    const editorEl = editor.view.dom;
    const editorRect = editorEl.getBoundingClientRect();
    const scrollParent = editorEl.closest(".overflow-y-auto");
    const scrollTop = scrollParent?.scrollTop ?? 0;

    const newMarkers: GutterMarkerData[] = [];

    for (const finding of findings) {
      if (finding.status === "dismissed") continue;
      const searchText = finding.originalText ?? finding.locationStart;
      if (!searchText) continue;

      const positions = findTextPositions(editor.state.doc, searchText);
      if (positions.length === 0) continue;

      const pos = positions[0];
      try {
        const coords = editor.view.coordsAtPos(pos.from);
        const top = coords.top - editorRect.top + scrollTop;
        const severity = finding.severity ?? "minor";
        const preview = finding.description
          ? finding.description.length > 80
            ? finding.description.substring(0, 80) + "..."
            : finding.description
          : "";
        newMarkers.push({
          findingId: finding.id,
          top,
          severity,
          category: finding.category ?? "general",
          textPreview: preview,
        });
      } catch {
        // Position might be out of range during doc transitions
      }
    }

    setMarkers(newMarkers);
  }, [editor, findings, visible]);

  // Recalculate on findings/visibility changes
  useEffect(() => {
    recalculate();
  }, [recalculate]);

  // Recalculate on scroll (throttled with rAF)
  useEffect(() => {
    if (!editor || !visible) return;

    const scrollParent = editor.view.dom.closest(".overflow-y-auto");
    if (!scrollParent) return;

    const handleScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(recalculate);
    };

    scrollParent.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollParent.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [editor, visible, recalculate]);

  if (!visible || markers.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={containerRef}
        className="absolute right-0 top-0 w-6 h-full pointer-events-none z-[5]"
      >
        {markers.map((marker) => {
          const severityLabel = SEVERITY_LABELS[marker.severity] ?? "Low";
          return (
            <Tooltip key={marker.findingId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="group absolute pointer-events-auto h-6 w-6 flex items-center justify-center cursor-pointer"
                  style={{
                    top: marker.top - MARKER_TARGET_OFFSET_PX,
                    right: 0,
                  }}
                  onClick={(e) => {
                    // Anchor the tooltip to the visual dot, not the larger
                    // touch target, so positioning matches the old layout.
                    const dot = e.currentTarget.firstElementChild;
                    const rect =
                      dot instanceof HTMLElement
                        ? dot.getBoundingClientRect()
                        : e.currentTarget.getBoundingClientRect();
                    onMarkerClick(marker.findingId, rect);
                  }}
                  aria-label={`${marker.category} finding: ${severityLabel}`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-3 h-3 rounded-sm transition-transform group-hover:scale-[1.3] ${SEVERITY_COLORS[marker.severity] ?? SEVERITY_COLORS.minor}`}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[250px]">
                <p className="font-medium">
                  {marker.category} &middot; {severityLabel}
                </p>
                {marker.textPreview && (
                  <p className="text-[11px] opacity-80 mt-0.5">
                    {marker.textPreview}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
