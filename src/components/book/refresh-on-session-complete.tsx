"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAgentSessionStore } from "@/stores/agent-session-store";

/**
 * O8 — the development board is a server component. A background workflow
 * writes its document on the server, the stream hook invalidates the client
 * query cache (which this page does not use), and the board keeps reading
 * "not started" until a manual reload. The writer's reading of that is
 * reasonable and expensive: he starts the same run again.
 *
 * This watches the session store for THIS book and calls router.refresh() when
 * a session reaches a terminal state, which re-renders the server component
 * with the documents the run actually produced.
 */

/**
 * Stable signature of this book's finished sessions. It changes exactly when a
 * session reaches a terminal state, so an effect keyed on it fires once per
 * completion instead of on every store update.
 */
export function terminalSessionSignature(
  sessions: Record<string, { bookId: string; status: string; sessionId: string }>,
  bookId: string
): string {
  return Object.values(sessions)
    .filter(
      (s) =>
        s.bookId === bookId && (s.status === "completed" || s.status === "failed")
    )
    .map((s) => `${s.sessionId}:${s.status}`)
    .sort()
    .join("|");
}

export function RefreshOnSessionComplete({ bookId }: { bookId: string }) {
  const router = useRouter();
  const sessions = useAgentSessionStore((s) => s.sessions);

  const signature = useMemo(
    () => terminalSessionSignature(sessions, bookId),
    [sessions, bookId]
  );

  // The first render is the page's own load, which is already fresh.
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current === null) {
      previous.current = signature;
      return;
    }
    if (previous.current !== signature) {
      previous.current = signature;
      router.refresh();
    }
  }, [signature, router]);

  return null;
}
