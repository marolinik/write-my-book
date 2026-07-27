"use client";

import { useEffect, useState } from "react";

/**
 * D-176 — whole seconds since `startedAt` (ms epoch), ticking once a second.
 *
 * Deliberately client-measured: the discuss route cannot send a progress frame
 * before the provider's first text delta without giving up the first-text gate
 * (which is what buys the honest pre-stream 409/502), so the only truthful
 * liveness signal available during the 19-36 s wall is the writer's own clock.
 *
 * The interval only samples the clock; the elapsed value is DERIVED from
 * `now - startedAt` at render time rather than incremented per tick. A
 * backgrounded tab (throttled timers) therefore reports the TRUE elapsed time
 * when it comes back instead of a count of the ticks it managed to run.
 */
export function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) return 0;
  // Clamped: a turn that started after the last clock sample reads 0, never
  // a negative count.
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
