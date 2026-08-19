import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mutable state read (lazily) by the mocked modules, so each test can flip
// whether Stripe is configured and what the subscription / counters look like.
const h = vi.hoisted(() => ({
  stripeConfigured: false,
  subscription: null as null | {
    userId: string;
    status: string;
    plan: string;
    trialEnd: Date | null;
  },
  bookCount: 0,
  sessionCount: 0,
  wordSum: 0,
}));

vi.mock("@/lib/billing/stripe-client", () => ({
  // Getter → evaluated on each access, so flipping h.stripeConfigured works.
  get stripe() {
    return h.stripeConfigured ? ({} as unknown) : null;
  },
  PLANS: {
    founder: { name: "Founder", maxBooks: Infinity },
    indie: { name: "Indie Author", maxBooks: 2 },
    professional: { name: "Professional", maxBooks: Infinity },
    publisher: { name: "Publisher", maxBooks: Infinity },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    subscription: { findUnique: vi.fn(async () => h.subscription) },
    book: {
      count: vi.fn(async () => h.bookCount),
      aggregate: vi.fn(async () => ({ _sum: { wordCount: h.wordSum } })),
    },
    agentSession: { count: vi.fn(async () => h.sessionCount) },
  },
}));

import { checkPlanAccess } from "@/lib/billing/plan-gating";

beforeEach(() => {
  vi.clearAllMocks();
  h.stripeConfigured = false;
  h.subscription = null;
  h.bookCount = 0;
  h.sessionCount = 0;
  h.wordSum = 0;
  delete process.env.FREE_TIER_DISABLED;
});

describe("checkPlanAccess — self-hosted / billing-disabled (no Stripe)", () => {
  it("ALLOWS every gated action when Stripe is not configured", async () => {
    // Regression guard: the self-host lockout bug treated "no Stripe" as
    // "subscription canceled", making BYOK deployments permanently read-only.
    // Must sit ABOVE Free logic — self-hosted never inherits Free caps.
    h.stripeConfigured = false;
    for (const action of [
      "create_book",
      "create_series",
      "run_agent",
      "run_batch",
      "use_analytics",
    ] as const) {
      expect((await checkPlanAccess("u", action)).allowed, action).toBe(true);
    }
  });
});

describe("checkPlanAccess — export is never gated", () => {
  it("allows export even with a canceled subscription", async () => {
    h.stripeConfigured = true;
    h.subscription = {
      userId: "u",
      status: "canceled",
      plan: "indie",
      trialEnd: null,
    };
    expect((await checkPlanAccess("u", "export")).allowed).toBe(true);
  });
});

describe("checkPlanAccess — FREE tier (derived: no row / none / canceled / expired-trial)", () => {
  beforeEach(() => {
    h.stripeConfigured = true;
  });

  const freeSubs = [
    { label: "no subscription row", sub: null },
    {
      label: "status none",
      sub: { userId: "u", status: "none", plan: "none", trialEnd: null },
    },
    {
      label: "status canceled",
      sub: { userId: "u", status: "canceled", plan: "indie", trialEnd: null },
    },
    {
      label: "expired trial",
      sub: {
        userId: "u",
        status: "trialing",
        plan: "indie",
        trialEnd: new Date(0),
      },
    },
  ];

  for (const { label, sub } of freeSubs) {
    it(`(${label}) allows the first book, run_agent, and export`, async () => {
      h.subscription = sub;
      h.bookCount = 0;
      expect((await checkPlanAccess("u", "create_book")).allowed).toBe(true);
      expect((await checkPlanAccess("u", "run_agent")).allowed).toBe(true);
      expect((await checkPlanAccess("u", "export")).allowed).toBe(true);
    });
  }

  it("denies the SECOND book with Free copy → indie", async () => {
    h.subscription = null;
    h.bookCount = 1; // already at the Free cap of 1
    const res = await checkPlanAccess("u", "create_book");
    expect(res.allowed).toBe(false);
    expect(res.upgradeToTier).toBe("indie");
    expect(res.reason).toMatch(/free plan includes 1 book/i);
  });

  it("denies run_agent at the monthly session cap → indie", async () => {
    h.subscription = null;
    h.sessionCount = 20; // at cap
    const res = await checkPlanAccess("u", "run_agent");
    expect(res.allowed).toBe(false);
    expect(res.upgradeToTier).toBe("indie");
    expect(res.reason).toMatch(/20 of 20 free AI sessions/i);
  });

  it("denies run_agent past the AI-eligible word cap → indie", async () => {
    h.subscription = null;
    h.sessionCount = 0;
    h.wordSum = 40_001; // one word past the 40k cap
    const res = await checkPlanAccess("u", "run_agent");
    expect(res.allowed).toBe(false);
    expect(res.upgradeToTier).toBe("indie");
    expect(res.reason).toMatch(/40,000 words/i);
  });

  it("allows run_agent exactly AT the word cap (boundary)", async () => {
    h.subscription = null;
    h.wordSum = 40_000;
    expect((await checkPlanAccess("u", "run_agent")).allowed).toBe(true);
  });

  it("hard-denies batch on Free → indie", async () => {
    h.subscription = null;
    const res = await checkPlanAccess("u", "run_batch");
    expect(res.allowed).toBe(false);
    expect(res.upgradeToTier).toBe("indie");
    expect(res.reason).toMatch(/overnight batch/i);
  });

  it("gates series & analytics behind Professional on Free", async () => {
    h.subscription = null;
    const series = await checkPlanAccess("u", "create_series");
    const analytics = await checkPlanAccess("u", "use_analytics");
    expect(series.allowed).toBe(false);
    expect(series.upgradeToTier).toBe("professional");
    expect(analytics.allowed).toBe(false);
    expect(analytics.upgradeToTier).toBe("professional");
  });
});

describe("checkPlanAccess — FREE_TIER_DISABLED rollback lever", () => {
  afterEach(() => {
    delete process.env.FREE_TIER_DISABLED;
  });

  it("reverts to the legacy read-only deny for inactive subs", async () => {
    h.stripeConfigured = true;
    h.subscription = null;
    process.env.FREE_TIER_DISABLED = "1";
    const res = await checkPlanAccess("u", "run_agent");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/subscription is inactive/i);
  });
});

describe("checkPlanAccess — PAID path (unchanged)", () => {
  beforeEach(() => {
    h.stripeConfigured = true;
  });

  it("treats a LIVE trial as paid (run_agent allowed)", async () => {
    h.subscription = {
      userId: "u",
      status: "trialing",
      plan: "indie",
      trialEnd: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    };
    expect((await checkPlanAccess("u", "run_agent")).allowed).toBe(true);
  });

  it("allows run_agent on an active subscription", async () => {
    h.subscription = {
      userId: "u",
      status: "active",
      plan: "indie",
      trialEnd: null,
    };
    expect((await checkPlanAccess("u", "run_agent")).allowed).toBe(true);
  });

  it("allows run_agent while past_due (Stripe still retrying payment)", async () => {
    h.subscription = {
      userId: "u",
      status: "past_due",
      plan: "indie",
      trialEnd: null,
    };
    expect((await checkPlanAccess("u", "run_agent")).allowed).toBe(true);
  });

  it("allows run_batch on any paid plan", async () => {
    h.subscription = {
      userId: "u",
      status: "active",
      plan: "indie",
      trialEnd: null,
    };
    expect((await checkPlanAccess("u", "run_batch")).allowed).toBe(true);
  });

  it("gates series & analytics behind professional+ (denies indie)", async () => {
    h.subscription = {
      userId: "u",
      status: "active",
      plan: "indie",
      trialEnd: null,
    };
    expect((await checkPlanAccess("u", "create_series")).allowed).toBe(false);
    expect((await checkPlanAccess("u", "use_analytics")).allowed).toBe(false);
  });

  it("allows series & analytics on professional", async () => {
    h.subscription = {
      userId: "u",
      status: "active",
      plan: "professional",
      trialEnd: null,
    };
    expect((await checkPlanAccess("u", "create_series")).allowed).toBe(true);
    expect((await checkPlanAccess("u", "use_analytics")).allowed).toBe(true);
  });

  it("enforces the indie book limit (maxBooks = 2) and points to professional", async () => {
    h.subscription = {
      userId: "u",
      status: "active",
      plan: "indie",
      trialEnd: null,
    };
    h.bookCount = 2; // at the limit
    const res = await checkPlanAccess("u", "create_book");
    expect(res.allowed).toBe(false);
    expect(res.upgradeToTier).toBe("professional");
  });

  it("allows create_book under the indie limit", async () => {
    h.subscription = {
      userId: "u",
      status: "active",
      plan: "indie",
      trialEnd: null,
    };
    h.bookCount = 1;
    expect((await checkPlanAccess("u", "create_book")).allowed).toBe(true);
  });

  it("allows unlimited books on professional", async () => {
    h.subscription = {
      userId: "u",
      status: "active",
      plan: "professional",
      trialEnd: null,
    };
    h.bookCount = 9999;
    expect((await checkPlanAccess("u", "create_book")).allowed).toBe(true);
  });

  it("denies on an unknown plan key", async () => {
    h.subscription = {
      userId: "u",
      status: "active",
      plan: "mystery",
      trialEnd: null,
    };
    const res = await checkPlanAccess("u", "run_agent");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/unknown plan/i);
  });
});
