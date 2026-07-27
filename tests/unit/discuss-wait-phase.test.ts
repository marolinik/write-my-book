import { describe, it, expect } from "vitest";
import {
  DISCUSS_CANCEL_HINT,
  DISCUSS_CANCEL_LABEL,
  DISCUSS_WAIT_LONG_SECONDS,
  DISCUSS_WAIT_SETTLING_SECONDS,
  discussWaitPhase,
  formatWaitElapsed,
} from "@/lib/editorial/discuss-wait-phase";

/**
 * D-176 (S3, THE P1/P6 v3 floor driver, 3/3 judges twice over) — the copy half.
 *
 * A streamed discuss turn opens with a 19-36 s pre-first-token wall (measured
 * ttft 25 356 / 19 343 / 36 129 ms, 46-series) during which the live bubble
 * showed ONE unchanging line: "The editor is replying…". No elapsed signal, no
 * phase, no cancel. This module owns every word of the replacement so the copy
 * is asserted without a DOM and can never drift into a lie:
 *
 *  - it must never claim to know a provider-internal state we cannot observe;
 *  - the "usually" band it quotes must be the MEASURED band (19-36 s → 20-40 s);
 *  - the cancel hint must promise only what the all-or-nothing abort proves
 *    (nothing saved, no exchange consumed) and must NOT promise "no charge" —
 *    the provider billed ~$0.004 for the aborted 46-series turn.
 */

describe("D-176 — discuss wait phase copy", () => {
  it("opens with a live label and a hint, never an empty line", () => {
    const phase = discussWaitPhase(0);
    expect(phase.label.trim().length).toBeGreaterThan(0);
    expect(phase.hint.trim().length).toBeGreaterThan(0);
    expect(phase.label).toMatch(/replying/i);
  });

  it("escalates to a 'still thinking' phase once the wait passes the settling band", () => {
    const early = discussWaitPhase(DISCUSS_WAIT_SETTLING_SECONDS - 1);
    const thinking = discussWaitPhase(DISCUSS_WAIT_SETTLING_SECONDS);

    expect(thinking.label).not.toBe(early.label);
    expect(thinking.label).toMatch(/still/i);
    // The heartbeat is the phase CHANGE, so the hint must move too.
    expect(thinking.hint).not.toBe(early.hint);
  });

  it("quotes the measured 20-40s first-text band rather than an invented promise", () => {
    expect(discussWaitPhase(20).hint).toMatch(/20[–-]40\s*s/);
  });

  it("admits the wait is unusual past the long band and points at cancel", () => {
    const long = discussWaitPhase(DISCUSS_WAIT_LONG_SECONDS);
    expect(long.hint).toMatch(/longer than usual/i);
    expect(long.hint).toMatch(/cancel/i);
    expect(DISCUSS_WAIT_LONG_SECONDS).toBeGreaterThan(DISCUSS_WAIT_SETTLING_SECONDS);
  });

  it("is total: negative, fractional and non-finite elapsed values still yield phase 1", () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
      expect(discussWaitPhase(bad).label).toBe(discussWaitPhase(0).label);
    }
    expect(discussWaitPhase(0.9).label).toBe(discussWaitPhase(0).label);
  });

  it("promises only what the all-or-nothing abort proves — no billing claim (D-142 honesty)", () => {
    expect(DISCUSS_CANCEL_LABEL).toMatch(/cancel/i);
    expect(DISCUSS_CANCEL_HINT).toMatch(/exchange/i);
    expect(DISCUSS_CANCEL_HINT).not.toMatch(/bill|charge|free|cost/i);
  });

  it("uses typographic dashes in every string it ships (D-182)", () => {
    const strings = [
      DISCUSS_CANCEL_HINT,
      DISCUSS_CANCEL_LABEL,
      ...[0, 10, 60].flatMap((s) => [discussWaitPhase(s).label, discussWaitPhase(s).hint]),
    ];
    for (const s of strings) expect(s).not.toMatch(/ -- /);
  });

  it("formats elapsed time for a glance: seconds, then minutes past a minute", () => {
    expect(formatWaitElapsed(0)).toBe("0s");
    expect(formatWaitElapsed(9)).toBe("9s");
    expect(formatWaitElapsed(59)).toBe("59s");
    expect(formatWaitElapsed(60)).toBe("1m 00s");
    expect(formatWaitElapsed(95)).toBe("1m 35s");
    // Total, like the phase selector.
    expect(formatWaitElapsed(-3)).toBe("0s");
    expect(formatWaitElapsed(Number.NaN)).toBe("0s");
  });
});
