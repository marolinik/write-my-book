import { describe, it, expect } from "vitest";
import { PLANS } from "@/lib/billing/stripe-client";

describe("launch plans (owner, 2026-10-12: no free trial at launch)", () => {
  it("no plan starts a Stripe trial at checkout", () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(plan.trialDays, key).toBe(0);
    }
  });
});
