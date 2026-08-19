import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * FIX 1 regression pin (adversarial finding: self-hosted lockout).
 *
 * On a self-hosted / billing-disabled deploy there is NO Stripe key and NO
 * Subscription rows, so the pure `isFreeTier(null)` derivation is `true` for
 * EVERY user. The three Free ENFORCEMENT sites that live OUTSIDE plan-gating —
 * the ghost/inline daily meters (quota-checker), the concurrency fence, and the
 * prose-index 40k cap (indexing-gate) — must NOT enforce there.
 *
 * The existing quota-checker suite cannot catch this: it fully mocks
 * plan-gating. This file deliberately uses the REAL plan-gating + quota-checker
 * + indexing-gate and only stubs Stripe (unconfigured) + db + embeddings, so a
 * regression that drops the `!stripe` guard fails here.
 */

const h = vi.hoisted(() => ({
  subscription: null as null | { status: string; trialEnd: Date | null; plan?: string },
  wordSum: 0,
  sessionCount: 0,
  usageRow: null as null | { ghostTextCalls: number; inlineEditCalls: number },
}));

// Self-hosted: no STRIPE_SECRET_KEY → stripe is null.
vi.mock("@/lib/billing/stripe-client", () => ({
  stripe: null,
  PLANS: {},
}));

vi.mock("@/lib/db", () => ({
  db: {
    subscription: { findUnique: vi.fn(async () => h.subscription) },
    book: {
      count: vi.fn(async () => 5),
      aggregate: vi.fn(async () => ({ _sum: { wordCount: h.wordSum } })),
    },
    agentSession: { count: vi.fn(async () => h.sessionCount) },
    freeTierUsage: {
      findUnique: vi.fn(async () => h.usageRow),
      upsert: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("@/lib/vector/embeddings", () => ({
  isEmbeddingAvailable: () => true,
}));

import { checkQuota } from "@/lib/billing/quota-checker";
import { canIndexProseForUser } from "@/lib/vector/indexing-gate";
import {
  checkConcurrencyFence,
  isFreeTierUser,
} from "@/lib/billing/free-tier-meters";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FREE_TIER_DISABLED;
  h.subscription = null;
  h.wordSum = 0;
  h.sessionCount = 0;
  h.usageRow = null;
});

describe("self-hosted deploy (no Stripe) inherits NO Free caps", () => {
  it("isFreeTierUser is false for a no-sub user", () => {
    expect(isFreeTierUser(null)).toBe(false);
  });

  it("ghost-text is allowed even far past the daily meter", async () => {
    h.usageRow = { ghostTextCalls: 99_999, inlineEditCalls: 99_999 };
    const r = await checkQuota("u", "ghost_text");
    expect(r.allowed).toBe(true);
    expect(r.isFree).toBe(false);
  });

  it("inline-edit is allowed even far past the daily meter", async () => {
    h.usageRow = { ghostTextCalls: 99_999, inlineEditCalls: 99_999 };
    const r = await checkQuota("u", "inline_edit");
    expect(r.allowed).toBe(true);
    expect(r.isFree).toBe(false);
  });

  it("run_agent is allowed even past the monthly session + word caps", async () => {
    h.sessionCount = 9_999;
    h.wordSum = 5_000_000;
    const r = await checkQuota("u", "run_agent");
    expect(r.allowed).toBe(true);
  });

  it("concurrency fence never fences", async () => {
    h.sessionCount = 5;
    expect((await checkConcurrencyFence("u")).allowed).toBe(true);
  });

  it("prose indexing is never capped", async () => {
    h.wordSum = 5_000_000; // far past FREE_TIER.maxAiEligibleWords
    expect(await canIndexProseForUser("u")).toBe(true);
  });
});
