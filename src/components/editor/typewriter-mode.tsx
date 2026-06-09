"use client";

import { useEffect, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/react";

/**
 * N: Typewriter Mode — keeps the current line vertically centered.
 * The cursor line is always in the middle of the viewport,
 * creating a stable visual anchor that prevents eye fatigue.
 * 
 * Also dims text above/below the current line for additional focus.
 */

interface TypewriterModeProps {
  editor: Editor | null;
  enabled: boolean;
  /** Percentage of viewport height to center at (default: 40% from top) */
  centerPosition?: number;
}

export function TypewriterMode({
  editor,
  enabled,
  centerPosition = 40,
}: TypewriterModeProps) {
  const lastPosRef = useRef<number | null>(null);

  const scrollToCenter = useCallback(() => {
    if (!editor || !enabled) return;

    const { view } = editor;
    const { from } = view.state.selection;

    // Don't scroll if cursor hasn't moved
    if (from === lastPosRef.current) return;
    lastPosRef.current = from;

    const coords = view.coordsAtPos(from);
    if (!coords) return;

    const editorElement = view.dom.closest(".overflow-y-auto") as HTMLElement;
    if (!editorElement) return;

    const editorRect = editorElement.getBoundingClientRect();
    const targetY = editorRect.top + (editorRect.height * centerPosition) / 100;
    const offset = coords.top - targetY;

    editorElement.scrollBy({
      top: offset,
      behavior: "smooth",
    });
  }, [editor, enabled, centerPosition]);

  useEffect(() => {
    if (!editor || !enabled) return;

    // Scroll on every cursor position change
    const handleUpdate = () => {
      requestAnimationFrame(scrollToCenter);
    };

    editor.on("selectionUpdate", handleUpdate);
    editor.on("update", handleUpdate);

    return () => {
      editor.off("selectionUpdate", handleUpdate);
      editor.off("update", handleUpdate);
    };
  }, [editor, enabled, scrollToCenter]);

  // Add CSS class to editor for typewriter styling
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;
    if (enabled) {
      el.classList.add("wmb-typewriter");
      // Add generous top/bottom padding so the first/last lines can center
      el.style.paddingTop = `${centerPosition}vh`;
      el.style.paddingBottom = `${100 - centerPosition}vh`;
    } else {
      el.classList.remove("wmb-typewriter");
      el.style.paddingTop = "";
      el.style.paddingBottom = "";
    }

    return () => {
      el.classList.remove("wmb-typewriter");
      el.style.paddingTop = "";
      el.style.paddingBottom = "";
    };
  }, [editor, enabled, centerPosition]);

  return null; // This is a behavior-only component, no UI
}
