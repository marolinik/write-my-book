import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P1-S06 — Free prose indexing paused above 40,000 words with no word to the
 * writer.
 *
 * indexing-gate.ts says a paused gate MUST be surfaced "wherever memory status
 * renders — never a silent degradation", but its only caller did
 * `if (!ok) return;` and nothing could ask whether memory was paused. This is
 * the question the memory status surfaces now ask.
 */

const h = vi.hoisted(() => ({
  stripeConfigured: true,
  subscription: null as null | { status: string; trialEnd: Date | null },
  wordSum: 0,
}));

vi.mock("@/lib/billing/stripe-client", () => ({
  get stripe() {
    return h.stripeConfigured ? ({} as unknown) : null;
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    subscription: { findUnique: vi.fn(async () => h.subscription) },
    book: { aggregate: vi.fn(async () => ({ _sum: { wordCount: h.wordSum } })) },
  },
}));
vi.mock("@/lib/vector/embeddings", () => ({ isEmbeddingAvailable: () => true }));

import { db } from "@/lib/db";
import { isProseIndexingPausedForUser } from "@/lib/vector/indexing-gate";
import { FREE_TIER } from "@/lib/billing/free-tier";

beforeEach(() => {
  vi.clearAllMocks();
  h.stripeConfigured = true;
  h.subscription = null; // no row → Free
  h.wordSum = 0;
  delete process.env.FREE_TIER_DISABLED;
});

describe("isProseIndexingPausedForUser", () => {
  it("is true for a Free writer past the AI-eligible word cap", async () => {
    h.wordSum = 45_000;
    expect(await isProseIndexingPausedForUser("u1")).toBe(true);
  });

  it("is false at or under the cap (the boundary still indexes)", async () => {
    h.wordSum = FREE_TIER.maxAiEligibleWords;
    expect(await isProseIndexingPausedForUser("u1")).toBe(false);
  });

  it("is false for a paid writer, however much they have written", async () => {
    h.subscription = { status: "active", trialEnd: null };
    h.wordSum = 500_000;
    expect(await isProseIndexingPausedForUser("u1")).toBe(false);
  });

  it("is false on a self-hosted deploy (no Stripe) without touching the database", async () => {
    h.stripeConfigured = false;
    h.wordSum = 500_000;
    expect(await isProseIndexingPausedForUser("u1")).toBe(false);
    expect(vi.mocked(db.subscription.findUnique)).not.toHaveBeenCalled();
  });

  it("is false when the Free tier is rolled back (FREE_TIER_DISABLED=1)", async () => {
    process.env.FREE_TIER_DISABLED = "1";
    h.wordSum = 500_000;
    expect(await isProseIndexingPausedForUser("u1")).toBe(false);
  });
});
