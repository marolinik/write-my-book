import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  planResult: { allowed: true } as {
    allowed: boolean;
    reason?: string;
    upgradeToTier?: string;
  },
  subscription: null as null | { status: string; trialEnd: Date | null },
  meterResult: { allowed: true, used: 0, limit: 100, remaining: 100 } as {
    allowed: boolean;
    used: number;
    limit: number;
    remaining: number;
  },
}));

vi.mock("@/lib/billing/plan-gating", () => ({
  checkPlanAccess: vi.fn(async () => h.planResult),
}));

vi.mock("@/lib/billing/free-tier-meters", () => ({
  checkDailyMeter: vi.fn(async () => h.meterResult),
  // Free ENFORCEMENT derivation now flows through isFreeTierUser (stripe- and
  // lever-aware). These tests exercise the meter layer, so mirror the derivation
  // for the two sub shapes they use: no-sub → Free, active → paid.
  isFreeTierUser: vi.fn(
    (sub: { status: string } | null | undefined) =>
      !sub || sub.status === "none" || sub.status === "canceled"
  ),
}));

vi.mock("@/lib/db", () => ({
  db: { subscription: { findUnique: vi.fn(async () => h.subscription) } },
}));

import { checkQuota } from "@/lib/billing/quota-checker";
import { checkPlanAccess } from "@/lib/billing/plan-gating";
import { checkDailyMeter } from "@/lib/billing/free-tier-meters";

beforeEach(() => {
  vi.clearAllMocks();
  h.planResult = { allowed: true };
  h.subscription = null; // Free by default
  h.meterResult = { allowed: true, used: 0, limit: 100, remaining: 100 };
});

describe("checkQuota — action mapping", () => {
  it("maps ghost_text / inline_edit / use_agent_session to run_agent for the plan check", async () => {
    await checkQuota("u", "ghost_text");
    await checkQuota("u", "inline_edit");
    await checkQuota("u", "use_agent_session");
    for (const call of vi.mocked(checkPlanAccess).mock.calls) {
      expect(call[1]).toBe("run_agent");
    }
  });

  it("maps run_batch to run_batch", async () => {
    await checkQuota("u", "run_batch");
    expect(vi.mocked(checkPlanAccess)).toHaveBeenCalledWith("u", "run_batch");
  });
});

describe("checkQuota — upgradeToTier passthrough", () => {
  it("surfaces the plan-gating reason + upgradeToTier on denial", async () => {
    h.planResult = {
      allowed: false,
      reason: "Free plan includes AI on your first 40,000 words.",
      upgradeToTier: "indie",
    };
    const r = await checkQuota("u", "run_agent");
    expect(r.allowed).toBe(false);
    expect(r.upgradeToTier).toBe("indie");
    expect(r.reason).toMatch(/40,000 words/);
    expect(r.isFree).toBe(true);
  });
});

describe("checkQuota — Free daily meters (ghost/inline)", () => {
  it("consults the meter for a Free user and returns remainingToday when allowed", async () => {
    h.meterResult = { allowed: true, used: 40, limit: 100, remaining: 60 };
    const r = await checkQuota("u", "ghost_text");
    expect(vi.mocked(checkDailyMeter)).toHaveBeenCalledWith("u", "ghost");
    expect(r.allowed).toBe(true);
    expect(r.isFree).toBe(true);
    expect(r.remainingToday).toBe(60);
  });

  it("denies ghost_text when the daily meter is exhausted → indie", async () => {
    h.meterResult = { allowed: false, used: 100, limit: 100, remaining: 0 };
    const r = await checkQuota("u", "ghost_text");
    expect(r.allowed).toBe(false);
    expect(r.upgradeToTier).toBe("indie");
    expect(r.remainingToday).toBe(0);
    expect(r.reason).toMatch(/100 ghost-text completions per day/i);
  });

  it("denies inline_edit with the inline copy", async () => {
    h.meterResult = { allowed: false, used: 50, limit: 50, remaining: 0 };
    const r = await checkQuota("u", "inline_edit");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/50 inline edits per day/i);
  });

  it("does NOT consult the meter for a paid user", async () => {
    h.subscription = { status: "active", trialEnd: null };
    const r = await checkQuota("u", "ghost_text");
    expect(vi.mocked(checkDailyMeter)).not.toHaveBeenCalled();
    expect(r.isFree).toBe(false);
    expect(r.allowed).toBe(true);
  });
});
