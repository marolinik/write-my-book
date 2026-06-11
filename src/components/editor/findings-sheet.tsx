"use client";

import type { ReactNode, RefObject } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/**
 * Findings container for viewports below lg (1024px): bottom sheet on
 * phones, right sheet on tablets. Replaces the hand-rolled fixed overlay —
 * Radix supplies focus trapping, the Escape path, and focus restoration,
 * and the bottom variant clears the mobile bottom nav (the old overlay's
 * `inset-y-0` rendered underneath it).
 *
 * The default Radix close button is suppressed: the findings panel rendered
 * inside always carries its own close button in the same corner, and two
 * stacked close affordances would overlap. Escape and overlay click still
 * close the sheet.
 */

const BOTTOM_SHEET_CLASSES = "h-[70dvh] p-0";
const RIGHT_SHEET_CLASSES = "w-80 sm:max-w-none p-0";

/**
 * The sheet is CONTROLLED (no SheetTrigger), so Radix has no trigger to
 * restore focus to on close — it falls back to document.body, stranding
 * keyboard users (WCAG 2.4.3). Restore to the OWNING pane's findings toggle:
 * the lookup is scoped to `paneRootRef` because tablet split view renders
 * two toolbars with two toggles, and a document-wide query would focus the
 * wrong pane. Matched case-insensitively — the label is dynamic
 * ("Toggle Findings" / "Toggle findings, N pending").
 */
const FINDINGS_TOGGLE_SELECTOR = 'button[aria-label^="toggle findings" i]';

export interface FindingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "bottom" | "right";
  /** The owning editor pane's root — scopes the close-focus restore. */
  paneRootRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function FindingsSheet({
  open,
  onOpenChange,
  side,
  paneRootRef,
  children,
}: FindingsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={side === "bottom" ? BOTTOM_SHEET_CLASSES : RIGHT_SHEET_CLASSES}
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          const scope: ParentNode = paneRootRef?.current ?? document;
          const toggle = scope.querySelector<HTMLButtonElement>(
            FINDINGS_TOGGLE_SELECTOR
          );
          if (toggle) {
            event.preventDefault();
            toggle.focus();
          }
        }}
      >
        {/* Radix requires a title for aria-labelledby; the panel renders its own visible header */}
        <SheetTitle className="sr-only">Findings</SheetTitle>
        <div className="flex-1 min-h-0">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
