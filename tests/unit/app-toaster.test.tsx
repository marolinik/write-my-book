// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act, waitFor } from "@testing-library/react";
import { toast } from "sonner";

/**
 * D-139 (S3, bulletproof-QA v6 panel) — the app rendered ONE global sonner
 * <Toaster position="bottom-right" />. On a 390px phone every bottom-anchored
 * toast (the quick-assist 422 backstop, ghost-text fallback errors, save
 * errors — everything using toast.*) lands over the h-14 bottom tab nav and
 * under the on-screen keyboard: the exact occlusion the D-134 cap-wall banner
 * escaped by going TOP-anchored. AppToaster re-anchors toasts to top-center on
 * small screens (<= 640px) and keeps the original bottom-right on desktop.
 *
 * The position logic is exercised three ways, cheapest → most integrated:
 *  1. `toasterPosition(isSmall)` — the pure branch, no DOM.
 *  2. `useSmallViewport()` — the SSR-safe matchMedia hook (mirrors
 *     use-coarse-pointer.ts), via a tiny probe component.
 *  3. The real <AppToaster/> mounted with a live sonner Toaster: a fired toast
 *     forces sonner to render its <ol data-sonner-toaster> and we read the
 *     data-y-position / data-x-position attributes the installed sonner (2.0.7)
 *     actually emits.
 */

import {
  AppToaster,
  useSmallViewport,
  toasterPosition,
} from "@/components/ui/app-toaster";

// jsdom has no matchMedia; the hook and sonner both read it, so stub it per
// test. `small` drives the (max-width: 640px) probe; any other query (e.g.
// sonner's own prefers-color-scheme check) resolves to a harmless no-match.
function stubViewport(small: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: small && query.includes("max-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

// A one-line probe that surfaces the hook's boolean into the DOM, mirroring the
// repo's component-render test style rather than pulling in renderHook.
function SmallViewportProbe() {
  const small = useSmallViewport();
  return <span data-testid="small">{String(small)}</span>;
}

afterEach(() => {
  cleanup();
  // Live sonner keeps a module-level store; clear it so a toast fired in one
  // test can't linger into the next.
  toast.dismiss();
  vi.unstubAllGlobals();
});

describe("toasterPosition — pure position selection", () => {
  it("small viewport picks top-center (clears the keyboard + bottom nav)", () => {
    expect(toasterPosition(true)).toBe("top-center");
  });

  it("desktop keeps the original bottom-right", () => {
    expect(toasterPosition(false)).toBe("bottom-right");
  });
});

describe("useSmallViewport — SSR-safe matchMedia probe", () => {
  it("reports true when (max-width: 640px) matches", () => {
    stubViewport(true);
    const { getByTestId } = render(<SmallViewportProbe />);
    expect(getByTestId("small").textContent).toBe("true");
  });

  it("reports false on a wide (desktop) viewport", () => {
    stubViewport(false);
    const { getByTestId } = render(<SmallViewportProbe />);
    expect(getByTestId("small").textContent).toBe("false");
  });
});

describe("AppToaster — sonner anchors top on small screens, bottom-right on desktop", () => {
  it("small viewport: sonner renders the toaster at the TOP (y=top, x=center)", async () => {
    stubViewport(true);
    render(<AppToaster />);

    // A toast is required for sonner to render its <ol data-sonner-toaster>.
    act(() => {
      toast("Ghost text unavailable", { duration: Infinity });
    });

    await waitFor(() => {
      const el = document.querySelector("[data-sonner-toaster]");
      expect(el).not.toBeNull();
      // D-139: top-anchored on the phone so the toast clears the soft keyboard
      // and the bottom tab nav — the D-134 banner's escape, applied to toasts.
      expect(el?.getAttribute("data-y-position")).toBe("top");
      expect(el?.getAttribute("data-x-position")).toBe("center");
    });
  });

  it("desktop viewport: sonner keeps the original bottom-right (y=bottom, x=right)", async () => {
    stubViewport(false);
    render(<AppToaster />);

    act(() => {
      toast("Saved", { duration: Infinity });
    });

    await waitFor(() => {
      const el = document.querySelector("[data-sonner-toaster]");
      expect(el).not.toBeNull();
      expect(el?.getAttribute("data-y-position")).toBe("bottom");
      expect(el?.getAttribute("data-x-position")).toBe("right");
    });
  });
});
