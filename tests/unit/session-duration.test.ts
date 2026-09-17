/**
 * "Completed in 11 min" was computed as `Date.now() - startedAt` for finished
 * sessions too, so the reported duration of a run that had ended kept growing
 * for as long as its card stayed on screen.
 */

import { describe, it, expect } from "vitest";
import { sessionElapsedMs } from "@/lib/agents/session-duration";

const MIN = 60_000;

describe("session duration", () => {
  it("is fixed once the session completed", () => {
    const session = {
      status: "completed" as const,
      startedAt: 1_000_000,
      completedAt: 1_000_000 + 4 * MIN,
    };

    // Same answer an hour later — this is the whole point.
    expect(sessionElapsedMs(session, 1_000_000 + 5 * MIN)).toBe(4 * MIN);
    expect(sessionElapsedMs(session, 1_000_000 + 65 * MIN)).toBe(4 * MIN);
  });

  it("keeps ticking while the session runs", () => {
    const session = { status: "running" as const, startedAt: 1_000_000 };
    expect(sessionElapsedMs(session, 1_000_000 + 2 * MIN)).toBe(2 * MIN);
    expect(sessionElapsedMs(session, 1_000_000 + 9 * MIN)).toBe(9 * MIN);
  });

  it("uses the recorded end for a failed session", () => {
    const session = {
      status: "failed" as const,
      startedAt: 1_000_000,
      completedAt: 1_000_000 + 21 * MIN,
    };
    expect(sessionElapsedMs(session, Date.now())).toBe(21 * MIN);
  });

  it("returns null when a finished session has no end timestamp", () => {
    // Sessions persisted before completedAt existed: the duration is unknown,
    // and the caller must show nothing rather than a number that grows.
    const session = { status: "completed" as const, startedAt: 1_000_000 };
    expect(sessionElapsedMs(session, 1_000_000 + 30 * MIN)).toBeNull();
  });

  it("never reports a negative duration from a skewed clock", () => {
    const session = {
      status: "completed" as const,
      startedAt: 2_000_000,
      completedAt: 1_999_000,
    };
    expect(sessionElapsedMs(session)).toBe(0);
  });
});
