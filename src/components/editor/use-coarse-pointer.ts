"use client";

/**
 * D-132 — phone soft keyboards have no Tab or F2 key, so a quick-assist
 * affordance that advertises only a hardware key is dead on a real phone.
 * This hook reports whether the device's primary pointer is coarse (touch), so
 * callers can show a tap hint and hide keyboard-only badges.
 *
 * Guarded for jsdom / SSR where `matchMedia` is absent — it reports `false`
 * (fine pointer) there so the hardware hint stays the default.
 */
import { useEffect, useState } from "react";

const COARSE_POINTER_QUERY = "(pointer: coarse)";

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia(COARSE_POINTER_QUERY);
    setCoarse(mq.matches);

    const onChange = (e: MediaQueryListEvent) => setCoarse(e.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    // Older Safari only exposes the deprecated addListener API.
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return coarse;
}
