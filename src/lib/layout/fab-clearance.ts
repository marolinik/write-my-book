import { isFullWidthRoute } from "@/stores/agent-ui-store";

/**
 * D-139 (third recurrence) — reserve bottom room in the scrolling content column
 * so page content can always come to rest clear of the fixed AI companion
 * bubble.
 *
 * The bubble is `fixed bottom-5 right-5 size-12` on desktop and `bottom-20` on
 * mobile (above the h-14 bottom nav). Anything that ends in the bottom-right
 * corner is occluded by it — most visibly the chapters table's Action column on
 * the book overview, which renders as "Ed…" instead of "Edit" (45a/45g), and
 * previously the bottom-anchored toasts (fixed in app-toaster.tsx).
 *
 * Full-width surfaces (chapter editor, editorial review) are excluded: they own
 * their own scroll regions and fixed chrome, and padding the shell column there
 * would add a phantom scroll tail under a full-height editor. They keep only the
 * mobile bottom-nav reserve.
 *
 * Returns AT MOST one `pb-*` class: two Tailwind padding-bottom utilities on one
 * element resolve by stylesheet order, not by class order, so emitting both
 * would be a coin flip.
 */
export function mainBottomPaddingClass(input: { pathname: string; isMobile: boolean }): string {
  const { pathname, isMobile } = input;
  const fullWidth = isFullWidthRoute(pathname);

  if (isMobile) {
    // h-14 bottom nav; plus bubble (bottom-20 + size-12) on content surfaces.
    return fullWidth ? "pb-14" : "pb-32";
  }
  // bottom-5 + size-12 ≈ 4.25rem of fixed chrome; pb-20 (5rem) clears it.
  return fullWidth ? "" : "pb-20";
}
