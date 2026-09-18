/**
 * O6 — while Docker was down the worker wrote ~80k `ECONNREFUSED` lines. The
 * same one-line failure, eighty thousand times: it buried every other signal in
 * the log, and the same flood would have gone to Sentry.
 *
 * This collapses a repeating failure to one line per window and counts the rest,
 * so an outage reads as "connection refused, 4,998 more since" instead of a
 * scrollback with nothing else in it. Different failures are never collapsed
 * into each other — a new error must not be hidden by an old one.
 *
 * Pure and time-injected: callers pass `now`, so the behaviour is testable
 * without waiting a minute.
 */

export interface ErrorLogThrottle {
  /** True when this message should be logged now. */
  shouldLog(message: string, now: number): boolean;
  /** How many occurrences have been swallowed since the last emitted line. */
  suppressedCount(message: string): number;
}

/** How many leading words identify a failure. Enough to tell ECONNREFUSED from
 *  READONLY, short enough that an appended attempt counter or host suffix does
 *  not fork the key on every retry. */
const KEY_WORDS = 3;

/**
 * Collapse the volatile tail of a message so retries of the same failure share a
 * key: ports, attempt counters, ids and timestamps change on every attempt while
 * the failure does not.
 */
function keyOf(message: string): string {
  return message
    .toLowerCase()
    // Parenthetical detail ("(attempt 2)", "(after 3s)") is retry noise.
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, KEY_WORDS)
    .join(" ");
}

export function createErrorLogThrottle(windowMs: number): ErrorLogThrottle {
  const lastLoggedAt = new Map<string, number>();
  const suppressed = new Map<string, number>();

  return {
    shouldLog(message: string, now: number): boolean {
      const key = keyOf(message);
      const last = lastLoggedAt.get(key);

      if (last === undefined || now - last >= windowMs) {
        lastLoggedAt.set(key, now);
        suppressed.set(key, 0);
        return true;
      }

      suppressed.set(key, (suppressed.get(key) ?? 0) + 1);
      return false;
    },

    suppressedCount(message: string): number {
      return suppressed.get(keyOf(message)) ?? 0;
    },
  };
}
