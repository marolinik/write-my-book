// core/clock.mjs — single time source for the whole harness (W-F3 design §2.2).
//
// Two clocks, always paired:
//   utc  — ISO-8601 Z wall-clock, human/git-anchor readable, timezone-explicit.
//   mono — process-monotonic (performance.now), never goes backwards, immune to
//          NTP steps and timezone arithmetic. "Inside the worker-proof bracket"
//          is decided by mono comparison ONLY — this is the direct countermeasure
//          to the D-60 dispute, which turned on wall-clock/timezone arithmetic.
//
// Node built-ins only. No app coupling.

import { performance } from "node:perf_hooks";

/** @returns {{ utc: string, mono: number }} */
export function now() {
  return { utc: new Date().toISOString(), mono: performance.now() };
}

/**
 * Timezone + offset, recorded ONCE in the env block so a reader can see which
 * wall clock produced the utc stamps — without any stamp depending on it.
 * @returns {{ timeZone: string, offsetMinutes: number }}
 */
export function tzInfo() {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: new Date().getTimezoneOffset(),
  };
}
