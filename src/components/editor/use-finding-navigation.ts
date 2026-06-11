"use client";

/**
 * F8 / Shift+F8 finding navigation for the manuscript editor (Tier 2.5 —
 * THE keyboard path to act on annotations). Extracted from
 * manuscript-editor.tsx (file is over the size cap).
 *
 * Behaviors owned here:
 *  - Navigable finding ids are computed against the CURRENT doc at keypress
 *    time — a memo keyed on findings alone goes permanently stale when the
 *    findings query resolves before chapter content loads.
 *  - Split-view single-ownership: both panes register document-level keydown
 *    listeners; only the pane that owns focus handles the press (the primary
 *    pane handles it when focus is outside every pane, e.g. on body).
 *  - The review tooltip anchors after the smooth scroll settles ("scrollend"
 *    when supported, timeout fallback) — a fixed delay samples coordinates
 *    mid-scroll on long chapters and detaches the tooltip from its text.
 *  - Pending anchor timers/listeners are cancelled on cleanup and on
 *    subsequent presses.
 */

import { useEffect, useRef, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import type { FindingItem } from "@/hooks/use-editorial";
import { useEditorialStore } from "@/stores/editorial-store";
import { findTextPositions } from "./annotation-extension";
import { announce } from "./live-announcer";
import type { TooltipState } from "./editor-utils";

/** Fallback settle delay when the browser doesn't emit "scrollend". */
const SCROLL_SETTLE_FALLBACK_MS = 700;

/** Editor shortcuts must not fire from form fields or dialogs. */
const SHORTCUT_GUARD_SELECTOR = 'input, textarea, [role="dialog"]';

/** Marks each editor pane's root for split-view shortcut ownership. */
export const EDITOR_PANE_ATTR = "data-editor-pane";

/**
 * True when this pane should handle a document-level editor shortcut:
 * the event originated inside this pane, or outside every pane and this
 * is the primary pane (so shortcuts work right after page load, before
 * the writer has clicked into either editor).
 */
export function ownsEditorShortcut(
  target: EventTarget | null,
  paneRoot: HTMLElement | null,
  isPrimary: boolean
): boolean {
  const el = target instanceof HTMLElement ? target : null;
  const inAnyPane = !!el?.closest(`[${EDITOR_PANE_ATTR}]`);
  if (inAnyPane) {
    return !!paneRoot && !!el && paneRoot.contains(el);
  }
  return isPrimary;
}

export interface UseFindingNavigationOptions {
  editor: Editor | null;
  editorRef: { current: Editor | null };
  editorAreaRef: { current: HTMLDivElement | null };
  paneRootRef: { current: HTMLDivElement | null };
  isPrimary: boolean;
  findings: FindingItem[];
  scrollToFinding: (finding: FindingItem) => void;
  setTooltipState: (state: TooltipState | null) => void;
}

export interface FindingNavigationApi {
  /** Position-ordered ids of findings anchored in the current doc. */
  computeNavigableFindingIds: () => string[];
}

export function useFindingNavigation({
  editor,
  editorRef,
  editorAreaRef,
  paneRootRef,
  isPrimary,
  findings,
  scrollToFinding,
  setTooltipState,
}: UseFindingNavigationOptions): FindingNavigationApi {
  // Pending tooltip-anchor work — cancelled on re-press and unmount.
  const cancelAnchorRef = useRef<(() => void) | null>(null);

  const computeNavigableFindingIds = useCallback((): string[] => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed || findings.length === 0) return [];
    const tuples: [string, number][] = [];
    for (const f of findings) {
      if (!f.originalText || f.status === "dismissed") continue;
      const positions = findTextPositions(ed.state.doc, f.originalText);
      if (positions.length > 0) {
        tuples.push([f.id, positions[0].from]);
      }
    }
    tuples.sort((a, b) => a[1] - b[1]);
    return tuples.map(([id]) => id);
  }, [editorRef, findings]);

  /** Open the same Accept/Reject tooltip the gutter-marker click opens. */
  const anchorTooltipWhenSettled = useCallback(
    (finding: FindingItem) => {
      cancelAnchorRef.current?.();

      const ed = editorRef.current;
      const scrollContainer = ed?.view.dom.closest(".overflow-y-auto") ?? null;
      let done = false;

      const open = () => {
        if (done) return;
        done = true;
        cleanup();
        const liveEd = editorRef.current;
        if (!liveEd || liveEd.isDestroyed) return;
        const annoSpan = editorAreaRef.current?.querySelector(
          `[data-annotation-id="finding-${finding.id}"]`
        );
        let rect: DOMRect | null = annoSpan?.getBoundingClientRect() ?? null;
        if (!rect && finding.originalText) {
          try {
            const positions = findTextPositions(
              liveEd.state.doc,
              finding.originalText
            );
            if (positions.length > 0) {
              const c = liveEd.view.coordsAtPos(positions[0].from);
              rect = new DOMRect(
                c.left,
                c.top,
                Math.max(c.right - c.left, 1),
                Math.max(c.bottom - c.top, 1)
              );
            }
          } catch {
            // coordsAtPos throws on stale positions — tooltip stays closed
          }
        }
        if (!rect) return;
        setTooltipState({
          annotationId: `finding-${finding.id}`,
          annotationType: finding.newText ? "ai" : "comment",
          rect,
          finding,
        });
      };

      // "scrollend" fires once the smooth scroll settles; the timeout covers
      // browsers without it AND the no-scroll-needed case (already in view).
      scrollContainer?.addEventListener("scrollend", open, { once: true });
      const timer = window.setTimeout(open, SCROLL_SETTLE_FALLBACK_MS);

      const cleanup = () => {
        scrollContainer?.removeEventListener("scrollend", open);
        window.clearTimeout(timer);
      };
      cancelAnchorRef.current = () => {
        done = true;
        cleanup();
      };
    },
    [editorRef, editorAreaRef, setTooltipState]
  );

  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "F8") return;
      if ((e.target as HTMLElement | null)?.closest(SHORTCUT_GUARD_SELECTOR)) {
        return;
      }
      if (!ownsEditorShortcut(e.target, paneRootRef.current, isPrimary)) {
        return;
      }
      e.preventDefault();
      const store = useEditorialStore.getState();
      // Compute against the CURRENT doc — never a stale snapshot.
      const ids = computeNavigableFindingIds();
      if (ids.length === 0) return;
      const currentId = store.selectedFindingId;
      const currentIdx = currentId ? ids.indexOf(currentId) : -1;
      const nextIdx = e.shiftKey
        ? currentIdx <= 0
          ? ids.length - 1
          : currentIdx - 1
        : currentIdx >= ids.length - 1
          ? 0
          : currentIdx + 1;
      const nextId = ids[nextIdx];
      if (!nextId) return;
      store.setSelectedFinding(nextId);
      store.setHighlightedFinding(nextId);
      const finding = findings.find((f) => f.id === nextId);
      if (!finding) return;
      scrollToFinding(finding);
      announce(
        `Finding ${nextIdx + 1} of ${ids.length}: ${finding.category}, ${finding.severity}`
      );
      anchorTooltipWhenSettled(finding);
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      cancelAnchorRef.current?.();
    };
  }, [
    editor,
    findings,
    isPrimary,
    paneRootRef,
    scrollToFinding,
    computeNavigableFindingIds,
    anchorTooltipWhenSettled,
  ]);

  return { computeNavigableFindingIds };
}
