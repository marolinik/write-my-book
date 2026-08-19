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
 * D-73 E4 adds a fifth honesty axis: WHY it is failing. An "empty" failure
 * (unparseable content) recovers by an EDIT; a "failed" failure (provider down /
 * infra flake) recovers by a timed backoff — the two must not be conflated, or
 * the UI tells a writer to edit good prose because a provider had a bad minute.
 *
 * deriveExtractionStatus turns the raw Chapter-node facts into one honest,
 * unambiguous state. Pure — no Neo4j, no clock beyond the injected `now`.
 */

const NOW = new Date("2026-07-19T10:00:00.000Z");
const MIN_INTERVAL = 90_000;
const MAX_ATTEMPTS = 5;
const MAX_FAILED = 5;
const FAILED_BACKOFF = 30 * 60 * 1000; // 30 min

function facts(over: Partial<ChapterExtractionFacts> = {}): ChapterExtractionFacts {
  return {
    hasNode: true,
    contentHash: null,
    emptyExtractionCount: 0,
    lastEmptyExtractionAt: null,
    failedExtractionCount: 0,
    lastFailedExtractionAt: null,
    lastFailureReason: null,
    lowYield: false,
    updatedAt: null,
    ...over,
  };
}

function derive(over: {
  facts?: Partial<ChapterExtractionFacts>;
  justTriggered?: boolean;
  throttled?: boolean;
  now?: Date;
}) {
  return deriveExtractionStatus({
    facts: facts(over.facts),
    justTriggered: over.justTriggered ?? false,
    throttled: over.throttled ?? false,
    now: over.now ?? NOW,
    minIntervalMs: MIN_INTERVAL,
    maxAttempts: MAX_ATTEMPTS,
    maxFailedAttempts: MAX_FAILED,
    failedBackoffMs: FAILED_BACKOFF,
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

  it("failed (empty kind): a positive empty count that a success has not cleared", () => {
    const v = derive({ facts: { emptyExtractionCount: 2 } });
    expect(v.state).toBe("failed");
    expect(v.kind).toBe("empty");
    expect(v.capped).toBe(false); // under the cap
    expect(v.attempts).toBe(2);
  });

  it("checked: a content hash is stamped and no failures are outstanding", () => {
    const v = derive({ facts: { contentHash: "abc", emptyExtractionCount: 0 } });
    expect(v.state).toBe("checked");
    expect(v.kind).toBeNull();
  });
});

describe("deriveExtractionStatus — empty-kind (content) cap: edit-gated", () => {
  it("marks capped once empty attempts reach the cap (won't auto-retry / won't re-bill)", () => {
    const v = derive({ facts: { emptyExtractionCount: MAX_ATTEMPTS } });
    expect(v.state).toBe("failed");
    expect(v.kind).toBe("empty");
    expect(v.capped).toBe(true);
  });

  it("a capped empty chapter exposes no retryEligibleAt — recovery needs an edit, not a wait", () => {
    const v = derive({
      facts: { emptyExtractionCount: MAX_ATTEMPTS, updatedAt: NOW },
      throttled: true,
    });
    expect(v.capped).toBe(true);
    expect(v.retryEligibleAt).toBeNull();
  });
});

describe("deriveExtractionStatus — failed-kind (transient) cap: backoff-gated (D-73 E4)", () => {
  it("surfaces kind='failed' + the reason for a hard-failure marker", () => {
    const v = derive({
      facts: {
        failedExtractionCount: 1,
        lastFailedExtractionAt: NOW,
        lastFailureReason: "provider 503",
      },
    });
    expect(v.state).toBe("failed");
    expect(v.kind).toBe("failed");
    expect(v.reason).toBe("provider 503");
    expect(v.attempts).toBe(1);
    expect(v.capped).toBe(false); // under the failed cap
  });

  it("capped WITHIN the backoff window exposes a future retryEligibleAt (self-heals, no edit)", () => {
    const lastFailedAt = new Date(NOW.getTime() - 5 * 60 * 1000); // 5 min ago, inside 30-min backoff
    const v = derive({
      facts: {
        failedExtractionCount: MAX_FAILED,
        lastFailedExtractionAt: lastFailedAt,
        lastFailureReason: "ECONNRESET",
      },
    });
    expect(v.kind).toBe("failed");
    expect(v.capped).toBe(true);
    expect(v.retryEligibleAt).toBe(lastFailedAt.getTime() + FAILED_BACKOFF);
  });

  it("PAST the backoff window it is no longer capped — a probe is eligible now (self-heal)", () => {
    const lastFailedAt = new Date(NOW.getTime() - 40 * 60 * 1000); // 40 min ago, past 30-min backoff
    const v = derive({
      facts: { failedExtractionCount: MAX_FAILED, lastFailedExtractionAt: lastFailedAt },
    });
    expect(v.kind).toBe("failed");
    expect(v.capped).toBe(false);
    expect(v.retryEligibleAt).toBeNull(); // eligible now
  });

  it("when BOTH markers are set, the more RECENT failure kind is what the writer acts on", () => {
    const emptyAt = new Date(NOW.getTime() - 20 * 60 * 1000);
    const failedAt = new Date(NOW.getTime() - 1 * 60 * 1000); // more recent
    const v = derive({
      facts: {
        emptyExtractionCount: 3,
        lastEmptyExtractionAt: emptyAt,
        failedExtractionCount: 2,
        lastFailedExtractionAt: failedAt,
        lastFailureReason: "429 rate limited",
      },
    });
    expect(v.kind).toBe("failed");
    expect(v.attempts).toBe(2);
    expect(v.reason).toBe("429 rate limited");
  });

  it("empty wins when it is the more recent of the two markers", () => {
    const failedAt = new Date(NOW.getTime() - 20 * 60 * 1000);
    const emptyAt = new Date(NOW.getTime() - 1 * 60 * 1000); // more recent
    const v = derive({
      facts: {
        emptyExtractionCount: 3,
        lastEmptyExtractionAt: emptyAt,
        failedExtractionCount: 2,
        lastFailedExtractionAt: failedAt,
      },
    });
    expect(v.kind).toBe("empty");
    expect(v.attempts).toBe(3);
    expect(v.reason).toBeNull(); // reason only surfaces for the failed kind
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

  it("justTriggered overrides stale failure markers (this scan is extracting, not failed)", () => {
    const v = derive({
      justTriggered: true,
      facts: { failedExtractionCount: 3, lastFailedExtractionAt: NOW },
    });
    expect(v.state).toBe("extracting");
    expect(v.kind).toBeNull();
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
