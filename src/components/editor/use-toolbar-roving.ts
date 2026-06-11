"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Roving tabindex for a `role="toolbar"` container (WAI-ARIA toolbar
 * pattern): the toolbar is a single Tab stop; ArrowLeft/ArrowRight move
 * focus between enabled buttons, Home/End jump to the first/last one.
 *
 * Scope rules:
 * - Only `<button>` elements that are not disabled participate.
 * - Buttons inside Radix-managed surfaces (dropdown menus, dialogs,
 *   listboxes) are skipped — Radix runs its own keyboard interaction and
 *   portals that content outside the toolbar anyway.
 * - Visually hidden buttons (e.g. compact-density audio controls kept
 *   mounted for playback continuity) are skipped via the offsetParent check.
 */

const FOCUSABLE_BUTTON_SELECTOR = "button:not([disabled])";

/** Surfaces whose internals manage their own keyboard interaction. */
const SELF_MANAGED_KEYS_SELECTOR =
  '[role="menu"], [role="dialog"], [role="listbox"]';

const ROVING_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

function getToolbarButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(FOCUSABLE_BUTTON_SELECTOR)
  ).filter(
    (button) =>
      !button.closest(SELF_MANAGED_KEYS_SELECTOR) &&
      button.offsetParent !== null
  );
}

function nextIndexForKey(key: string, from: number, count: number): number {
  switch (key) {
    case "ArrowLeft":
      return (from - 1 + count) % count;
    case "ArrowRight":
      return (from + 1) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return from;
  }
}

export function useToolbarRoving(
  containerRef: RefObject<HTMLDivElement | null>
): void {
  const activeIndexRef = useRef(0);

  // Intentionally no dependency array: the toolbar's button set only changes
  // through React re-renders (density reshuffles, conditional toggles), so
  // re-applying tab stops after every render keeps the single-Tab-stop
  // invariant without a MutationObserver. It also covers the first render
  // where the ref is still null (TipTap editors mount asynchronously).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const applyTabStops = () => {
      const buttons = getToolbarButtons(container);
      if (buttons.length === 0) return;
      const active = Math.min(activeIndexRef.current, buttons.length - 1);
      activeIndexRef.current = active;
      buttons.forEach((button, index) => {
        button.tabIndex = index === active ? 0 : -1;
      });
    };

    /** Keep the roving position in sync with clicks / programmatic focus. */
    const handleFocusIn = (event: FocusEvent) => {
      const buttons = getToolbarButtons(container);
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      if (index === -1) return;
      activeIndexRef.current = index;
      applyTabStops();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!ROVING_KEYS.has(event.key)) return;
      const target = event.target as HTMLElement | null;
      if (!target || target.closest(SELF_MANAGED_KEYS_SELECTOR)) return;

      const buttons = getToolbarButtons(container);
      if (buttons.length === 0) return;

      const currentIndex = buttons.indexOf(target as HTMLButtonElement);
      const from =
        currentIndex === -1
          ? Math.min(activeIndexRef.current, buttons.length - 1)
          : currentIndex;
      const next = nextIndexForKey(event.key, from, buttons.length);

      event.preventDefault();
      activeIndexRef.current = next;
      applyTabStops();
      buttons[next].focus();
    };

    applyTabStops();
    container.addEventListener("keydown", handleKeyDown);
    container.addEventListener("focusin", handleFocusIn);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      container.removeEventListener("focusin", handleFocusIn);
    };
  });
}
