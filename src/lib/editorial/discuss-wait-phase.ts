/**
 * D-176 — every word of the pre-first-token discuss wait.
 *
 * The streamed discuss turn cannot emit before the provider's first *text*
 * delta: the first-text gate is what lets the route answer an honest 502/409 as
 * JSON before a single byte flushes, and `qwen/qwen3.6-27b` is a reasoning model
 * whose reasoning deltas are (correctly) never forwarded. Measured across three
 * consecutive turns, that opening wall was 25 356 / 19 343 / 36 129 ms, and for
 * all of it the bubble showed one unchanging line.
 *
 * We do not touch the gate. Instead the WAIT becomes legible with signals the
 * client can measure honestly: whole seconds elapsed, and a phase that escalates
 * as the wait grows. The bands below quote the measured 19-36 s window, so the
 * copy stays true to the product rather than to a hope.
 *
 * Honesty rules baked in here (asserted in discuss-wait-phase.test.ts):
 *  - never claim a provider-internal state we cannot observe;
 *  - the cancel hint promises only what the all-or-nothing abort proves —
 *    nothing saved, no exchange consumed. It does NOT promise "no charge": the
 *    provider billed roughly $0.004 for the aborted 46-series turn, which the
 *    app could not record.
 */

export interface DiscussWaitPhase {
  /** Rendered in the live bubble while there is no prose yet. */
  label: string;
  /** Second line: what is happening, and what the writer can do about it. */
  hint: string;
}

/** Below this, a wait is just a round trip — no need to editorialise. */
export const DISCUSS_WAIT_SETTLING_SECONDS = 8;
/** Past the measured band, stop calling it normal. */
export const DISCUSS_WAIT_LONG_SECONDS = 40;

export const DISCUSS_CANCEL_LABEL = "Cancel";
export const DISCUSS_CANCEL_HINT =
  "Cancelling stops the reply — nothing is saved and none of your 3 exchanges are used.";

const WAITING = "The editor is replying…";
const STILL_WAITING = "The editor is still thinking…";

/** Whole, non-negative seconds — the phase selector is total by construction. */
function wholeSeconds(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds)) return 0;
  return Math.max(0, Math.floor(elapsedSeconds));
}

export function discussWaitPhase(elapsedSeconds: number): DiscussWaitPhase {
  const seconds = wholeSeconds(elapsedSeconds);

  if (seconds < DISCUSS_WAIT_SETTLING_SECONDS) {
    return { label: WAITING, hint: "Thinking before the first word." };
  }
  if (seconds < DISCUSS_WAIT_LONG_SECONDS) {
    return {
      label: STILL_WAITING,
      hint: "This editor reasons before it writes — the first words usually land 20–40s in.",
    };
  }
  return {
    label: STILL_WAITING,
    hint: "Longer than usual. You can cancel and keep your turn — nothing is saved until a reply arrives.",
  };
}

/** "9s", "59s", "1m 35s" — glanceable, and total like the phase selector. */
export function formatWaitElapsed(elapsedSeconds: number): string {
  const seconds = wholeSeconds(elapsedSeconds);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}
