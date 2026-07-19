import { describe, it, expect } from "vitest";
import {
  deriveExtractionStatus,
  type ChapterExtractionFacts,
} from "@/lib/continuity/extraction-status";

/**
 * RC-4 state-honesty: the old scan response returned `{"flags":[]}` for FOUR
 * distinct states — never-extracted (pending), extraction-in-progress
 * (extracting), permanently-failing (failed), and genuinely clean (checked).
 * A writer told "no flags" could not tell "continuity is protected" from
 * "nothing was ever analysed" or "analysis keeps failing" — the "failure
 * states LIE" theme that floor-capped D7 (trust) at 3.0.
 *
 * deriveExtractionStatus turns the raw Chapter-node facts into one honest,
 * unambiguous state. Pure — no Neo4j, no clock beyond the injected `now`.
 */

const NOW = new Date("2026-07-19T10:00:00.000Z");
const MIN_INTERVAL = 90_000;
const MAX_ATTEMPTS = 5;

function facts(over: Partial<ChapterExtractionFacts> = {}): ChapterExtractionFacts {
  return {
    hasNode: true,
    contentHash: null,
    emptyExtractionCount: 0,
    lastEmptyExtractionAt: null,
    lowYield: false,
    updatedAt: null,
    ...over,
  };
}

function derive(over: {
  facts?: Partial<ChapterExtractionFacts>;
  justTriggered?: boolean;
  throttled?: boolean;
}) {
  return deriveExtractionStatus({
    facts: facts(over.facts),
    justTriggered: over.justTriggered ?? false,
    throttled: over.throttled ?? false,
    now: NOW,
    minIntervalMs: MIN_INTERVAL,
    maxAttempts: MAX_ATTEMPTS,
  });
}

describe("deriveExtractionStatus — the four previously-indistinguishable states", () => {
  it("pending: no chapter node at all (never extracted)", () => {
    expect(derive({ facts: { hasNode: false } }).state).toBe("pending");
  });

  it("pending: node exists but no hash and no failures (structural node only)", () => {
    expect(derive({ facts: { hasNode: true, contentHash: null } }).state).toBe("pending");
  });

  it("extracting: this scan just fired an extraction", () => {
    expect(derive({ justTriggered: true }).state).toBe("extracting");
  });

  it("failed: a positive empty/failure count that a success has not cleared", () => {
    const v = derive({ facts: { emptyExtractionCount: 2 } });
    expect(v.state).toBe("failed");
    expect(v.capped).toBe(false); // under the cap
    expect(v.attempts).toBe(2);
  });

  it("checked: a content hash is stamped and no failures are outstanding", () => {
    const v = derive({ facts: { contentHash: "abc", emptyExtractionCount: 0 } });
    expect(v.state).toBe("checked");
  });
});

describe("deriveExtractionStatus — billing-cap honesty", () => {
  it("marks capped once attempts reach the cap (won't auto-retry / won't re-bill)", () => {
    const v = derive({ facts: { emptyExtractionCount: MAX_ATTEMPTS } });
    expect(v.state).toBe("failed");
    expect(v.capped).toBe(true);
  });

  it("a capped chapter exposes no retryEligibleAt — recovery needs a content edit, not a wait", () => {
    const v = derive({
      facts: { emptyExtractionCount: MAX_ATTEMPTS, updatedAt: NOW },
      throttled: true,
    });
    expect(v.capped).toBe(true);
    expect(v.retryEligibleAt).toBeNull();
  });
});

describe("deriveExtractionStatus — throttle indicator", () => {
  it("exposes when the next scan may re-trigger extraction while throttled", () => {
    const last = new Date(NOW.getTime() - 30_000); // 30s ago, inside the 90s window
    const v = derive({ facts: { contentHash: "abc", updatedAt: last }, throttled: true });
    expect(v.throttled).toBe(true);
    expect(v.retryEligibleAt).toBe(last.getTime() + MIN_INTERVAL);
  });

  it("no retryEligibleAt when not throttled (extraction is eligible now)", () => {
    const v = derive({ facts: { contentHash: "abc", updatedAt: NOW }, throttled: false });
    expect(v.retryEligibleAt).toBeNull();
  });

  it("justTriggered wins over throttled (we did extract this scan)", () => {
    const v = derive({ justTriggered: true, throttled: false });
    expect(v.state).toBe("extracting");
  });
});

describe("deriveExtractionStatus — low-yield advisory", () => {
  it("passes through a low-yield advisory on an otherwise checked chapter", () => {
    const v = derive({ facts: { contentHash: "abc", emptyExtractionCount: 0, lowYield: true } });
    expect(v.state).toBe("checked");
    expect(v.lowYield).toBe(true);
  });

  it("lowYield is false unless the persisted fact says otherwise", () => {
    expect(derive({ facts: { contentHash: "abc" } }).lowYield).toBe(false);
  });
});
