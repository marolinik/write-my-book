"use client";

/**
 * D-139 (S3, bulletproof-QA v6 panel) — the root layout rendered ONE global
 * sonner <Toaster richColors position="bottom-right" />. On a 390px phone a
 * bottom-anchored toast (the quick-assist 422 backstop, ghost-text fallback
 * errors, save errors — everything routed through toast.*) lands over the h-14
 * bottom tab nav and UNDER the on-screen keyboard: the exact occlusion class the
 * D-134 cap-wall banner escaped by going TOP-anchored. This component re-anchors
 * toasts to top-center on small screens and keeps the original bottom-right on
 * desktop, so nothing changes for pointer/desktop writers.
 */
import { useEffect, useState } from "react";
import { Toaster } from "sonner";

// D-139: the small-screen cutover. 640px = Tailwind's `sm` breakpoint, the same
// width the mobile bottom nav / soft-keyboard occlusion concern lives at.
const SMALL_VIEWPORT_QUERY = "(max-width: 640px)";

// D-139: top toasts must clear the fixed app chrome — h-12 (3rem) AppHeader plus
// the ~2rem sticky editor toolbar ≈ 5rem — so they don't render behind the
// header. env(safe-area-inset-top) adds the notch, mirroring the D-134 banner's
// own top-[calc(6rem+env(safe-area-inset-top))] geometry.
//
// TRADEOFF (D-134 sibling): the D-134 wall banner is a separate fixed element at
// top-[calc(6rem+safe-area)] z-40, max-w-md, centered. A top-center toast at
// ~5rem can transiently overlap that banner when a cap-429 and another toast
// coincide. Accepted, not fought: toasts auto-dismiss (the banner persists), the
// banner is narrow+centered while sonner's mobile toast spans full width just
// above it, and NEITHER is permanently hidden. The alternative — the pre-fix
// bottom toast buried under the keyboard — was the actual reported defect, and
// it is eliminated. Permanently reserving vertical space to dodge the banner
// would penalise the common (no-banner) case, so we keep the offsets aligned and
// accept the rare transient overlap.
const SMALL_TOP_OFFSET = "calc(5rem + env(safe-area-inset-top))";

/**
 * SSR-safe small-viewport probe. Mirrors use-coarse-pointer.ts exactly: defaults
 * `false` (desktop) before mount so the server render and the first client paint
 * agree, then reads matchMedia in an effect. Guarded for jsdom / SSR where
 * `matchMedia` is absent — it stays `false` there (desktop bottom-right default).
 */
export function useSmallViewport(): boolean {
  const [small, setSmall] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia(SMALL_VIEWPORT_QUERY);
    setSmall(mq.matches);

    const onChange = (e: MediaQueryListEvent) => setSmall(e.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    // Older Safari only exposes the deprecated addListener API.
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return small;
}

/**
 * D-139: pure position selection, exported so the branch is unit-testable
 * without reaching into sonner's DOM. Small → top-center (clears the keyboard +
 * bottom nav); desktop → the original bottom-right.
 */
export function toasterPosition(
  isSmall: boolean
): "top-center" | "bottom-right" {
  return isSmall ? "top-center" : "bottom-right";
}

/**
 * D-139: the single app-wide toast host. Replaces the root layout's bare
 * <Toaster richColors position="bottom-right" />.
 */
export function AppToaster() {
  const isSmall = useSmallViewport();

  return (
    <Toaster
      richColors
      position={toasterPosition(isSmall)}
      // D-139: only push the top offset on small screens; desktop bottom-right
      // keeps sonner's default offset. `offset` (>601px) and `mobileOffset`
      // (<=600px) are both typed on sonner 2.0.7's ToasterProps
      // (Offset = { top?; right?; bottom?; left? } | string | number), so the
      // top gap applies across the whole small-screen range, not just one band.
      offset={isSmall ? { top: SMALL_TOP_OFFSET } : undefined}
      mobileOffset={isSmall ? { top: SMALL_TOP_OFFSET } : undefined}
    />
  );
}
