// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { PricingSection } from "@/components/landing/pricing-section";

/**
 * D-52 — the plans advertise a "14-day free trial" but never disclosed that
 * the trial genuinely starts WITHOUT a card (checkout uses Stripe
 * `payment_method_collection: "if_required"` + `missing_payment_method:
 * "cancel"`, so no card is collected up front and the sub auto-downgrades to
 * Free on day 14). The honest fix surfaces "No credit card required" exactly
 * where a card-free trial actually applies — i.e. wherever `trialDays > 0`.
 *
 * These are behavioral assertions on the disclosure LOGIC (present iff the
 * plan really has a card-free trial), not on styling.
 */

// Structural fixture — matches the component's PlanData prop shape without
// importing the (unexported) interface.
function makePlan(over: Record<string, unknown>) {
  return {
    name: "Plan",
    monthlyPrice: 49,
    annualPrice: 490,
    maxBooks: 2,
    maxSlots: null,
    trialDays: 14,
    features: ["A feature"],
    gatedFeatures: [],
    stripePriceIds: {},
    ...over,
  };
}

describe("PricingSection — D-52 card-free trial disclosure", () => {
  // Renders share one jsdom document; clean between cases so a prior render's
  // disclosure never leaks into a negative assertion.
  afterEach(() => cleanup());

  it("discloses 'No credit card required' on a plan that has a trial (trialDays > 0)", () => {
    render(
      <PricingSection
        plans={{ indie: makePlan({ name: "Indie", trialDays: 14 }) } as never}
      />
    );

    expect(screen.getByText("No credit card required")).toBeTruthy();
  });

  it("does NOT claim a card-free trial on plans without one (trialDays === 0)", () => {
    render(
      <PricingSection
        plans={{
          publisher: makePlan({
            name: "Publisher",
            trialDays: 0,
            monthlyPrice: 499,
            annualPrice: 4990,
          }),
        } as never}
      />
    );

    expect(screen.queryByText("No credit card required")).toBeNull();
  });

  it("scopes the disclosure to trial plans only when both kinds are shown", () => {
    render(
      <PricingSection
        plans={{
          indie: makePlan({ name: "Indie", trialDays: 14 }),
          publisher: makePlan({
            name: "Publisher",
            trialDays: 0,
            monthlyPrice: 499,
            annualPrice: 4990,
          }),
        } as never}
      />
    );

    // Exactly one disclosure — the trial plan, not the non-trial one.
    expect(screen.getAllByText("No credit card required")).toHaveLength(1);
  });
});
