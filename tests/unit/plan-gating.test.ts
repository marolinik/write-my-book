import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable state read (lazily) by the mocked modules, so each test can flip
// whether Stripe is configured and what the subscription looks like.
const h = vi.hoisted(() => ({
  stripeConfigured: false,
  subscription: null as null | {
    userId: string;
    status: string;
    plan: string;
    trialEnd: Date | null;
  },
  bookCount: 0,
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
    book: { count: vi.fn(async () => h.bookCount) },
  },
}));

import { checkPlanAccess } from "@/lib/billing/plan-gating";

beforeEach(() => {
  vi.clearAllMocks();
  h.stripeConfigured = false;
  h.subscription = null;
  h.bookCount = 0;
});

describe("checkPlanAccess — self-hosted / billing-disabled (no Stripe)", () => {
  it("ALLOWS every gated action when Stripe is not configured", async () => {
    // Regression guard: the self-host lockout bug treated "no Stripe" as
    // "subscription canceled", making BYOK deployments permanently read-only.
    h.stripeConfigured = false;
    for (const action of [
      "create_book",
      "create_series",
      "run_agent",
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

describe("checkPlanAccess — subscription gating (Stripe configured)", () => {
  beforeEach(() => {
    h.stripeConfigured = true;
  });

  it("denies when there is no subscription", async () => {
    h.subscription = null;
    const res = await checkPlanAccess("u", "run_agent");
    expect(res.allowed).toBe(false);
    expect(res.upgradeToTier).toBe("indie");
  });

  it("denies when status is canceled or none", async () => {
    for (const status of ["canceled", "none"]) {
      h.subscription = { userId: "u", status, plan: "indie", trialEnd: null };
      expect((await checkPlanAccess("u", "run_agent")).allowed, status).toBe(
        false
      );
    }
  });

  it("denies when a trial has expired", async () => {
    h.subscription = {
      userId: "u",
      status: "trialing",
      plan: "indie",
      trialEnd: new Date(0), // 1970 — well in the past
    };
    expect((await checkPlanAccess("u", "run_agent")).allowed).toBe(false);
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
