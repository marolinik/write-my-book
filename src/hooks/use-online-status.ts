"use client";

import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  // SSR/hydration: assume online; the client snapshot corrects after mount.
  return true;
}

/**
 * Reactive `navigator.onLine` via the window `online`/`offline` events.
 *
 * Caveat (spec R2): `navigator.onLine` can report true behind a dead router —
 * callers must ALSO classify fetch-level failures (see `isNetworkError` in
 * `@/lib/api-client`) rather than trusting this signal alone.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
