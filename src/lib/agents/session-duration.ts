/**
 * How long a session ran.
 *
 * A finished run has a fixed duration; the UI used to render
 * `Date.now() - startedAt` for completed sessions too, so "Completed in 11 min"
 * kept climbing while the card sat on screen.
 */

export interface SessionTiming {
  status: "running" | "completed" | "failed";
  /** Date.now() when the run started. */
  startedAt: number;
  /** Date.now() when it reached a terminal state; absent on older sessions. */
  completedAt?: number;
}

/**
 * Elapsed milliseconds: live for a running session, fixed once it ended.
 * Returns null when a finished session has no end timestamp — the duration is
 * genuinely unknown, and guessing it produces the growing-number bug.
 */
export function sessionElapsedMs(
  session: SessionTiming,
  now: number = Date.now(),
): number | null {
  if (session.status === "running") {
    return Math.max(0, now - session.startedAt);
  }
  if (session.completedAt == null) return null;
  return Math.max(0, session.completedAt - session.startedAt);
}
