// src/hooks/use-continuity-scan.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

export type ScanFlag = ContinuityFlagInput & { id: string };

export function useContinuityScan(bookId: string) {
  const [flags, setFlags] = useState<ScanFlag[]>([]);
  const [scanning, setScanning] = useState(false);
  const inFlight = useRef(false);

  const scan = useCallback(async (chapterNumber: number) => {
    if (inFlight.current) return; // per-instance coalescing (multi-tab is server-idempotent)
    inFlight.current = true;
    setScanning(true);
    try {
      const res = await fetchJson<{ flags: ScanFlag[]; degraded?: boolean }>(
        `/api/books/${bookId}/continuity/scan?chapterNumber=${chapterNumber}`,
        { method: "POST" }
      );
      // A degraded (timed-out/errored) check means the scan couldn't run — keep
      // the prior flags displayed rather than falsely clearing them to "clean".
      if (!res.degraded) setFlags(res.flags ?? []);
    } catch {
      /* best-effort: keep prior flags, never surface an error */
    } finally {
      inFlight.current = false;
      setScanning(false);
    }
  }, [bookId]);

  const markIntentional = useCallback(async (flagId: string) => {
    try {
      await fetchJson(`/api/books/${bookId}/continuity/intentional`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId }),
      });
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch { /* next scan reconciles */ }
  }, [bookId]);

  return { flags, scanning, scan, markIntentional };
}

/** Scan ~debounceMs after the last EDIT (activityKey must change per keystroke),
 *  and immediately on chapter switch. */
export function useIdleContinuityScan(opts: {
  chapterNumber: number | null;
  activityKey: number; // a monotonically-increasing per-edit counter
  scan: (chapterNumber: number) => void;
  debounceMs?: number;
}) {
  const { chapterNumber, activityKey, scan, debounceMs = 20_000 } = opts;

  useEffect(() => {
    if (chapterNumber == null) return;
    scan(chapterNumber);
  }, [chapterNumber, scan]);

  useEffect(() => {
    if (chapterNumber == null) return;
    const t = setTimeout(() => scan(chapterNumber), debounceMs);
    return () => clearTimeout(t);
  }, [activityKey, chapterNumber, scan, debounceMs]);
}
