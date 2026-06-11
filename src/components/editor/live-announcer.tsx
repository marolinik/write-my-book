"use client";

import { useRef } from "react";
import type { ReactElement } from "react";
import { create } from "zustand";

/**
 * Polite screen-reader live region for transient editor events
 * (F8 finding navigation, immersive mode enter/exit).
 *
 * Save status does NOT route through here — the status bar carries its own
 * aria-live region and double-announcing is a defect (spec §2).
 *
 * Frozen interface (spec §2/§3): `LiveAnnouncer` component + `announce()`.
 * Mount `<LiveAnnouncer />` once (end of editorColumn in manuscript-editor).
 */

/** Collapses rapid-fire calls (e.g. holding F8) into the final message. */
const ANNOUNCE_DEBOUNCE_MS = 150;

/** The region is emptied after this so stale text is never re-read by AT. */
const ANNOUNCE_CLEAR_MS = 3000;

interface AnnouncerState {
  message: string;
  setMessage: (message: string) => void;
}

const useAnnouncerStore = create<AnnouncerState>((set) => ({
  message: "",
  setMessage: (message) => set({ message }),
}));

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Announce a message to screen readers via the mounted `LiveAnnouncer`.
 * Debounced by 150ms (last message wins); the live region clears itself
 * 3s after announcing. Empty/whitespace messages are ignored.
 */
export function announce(message: string): void {
  const trimmed = message.trim();
  if (!trimmed) return;

  if (debounceTimer !== null) clearTimeout(debounceTimer);
  if (clearTimer !== null) clearTimeout(clearTimer);

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    useAnnouncerStore.getState().setMessage(trimmed);

    clearTimer = setTimeout(() => {
      clearTimer = null;
      useAnnouncerStore.getState().setMessage("");
    }, ANNOUNCE_CLEAR_MS);
  }, ANNOUNCE_DEBOUNCE_MS);
}

/**
 * Visually hidden polite live region announcing `announce()` messages.
 * `data-last-announcement` persists after the region text self-clears —
 * the 3s clear makes text-content assertions in tests inherently racy.
 */
export function LiveAnnouncer(): ReactElement {
  const message = useAnnouncerStore((s) => s.message);
  const lastMessageRef = useRef("");
  if (message) {
    lastMessageRef.current = message;
  }

  return (
    <div
      aria-live="polite"
      role="status"
      className="sr-only"
      data-last-announcement={lastMessageRef.current}
    >
      {message}
    </div>
  );
}
