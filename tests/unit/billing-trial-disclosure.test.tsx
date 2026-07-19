// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * D-52 (billing-settings) — card-freeness is per-(plan, USER), not per-plan.
 *
 * checkout/route.ts:164 grants the card-free trial only when
 * `planDef.trialDays > 0 && !hasHadTrial`, where
 * `hasHadTrial = !!sub?.trialEnd` (route.ts:69). A user who already consumed
 * a trial (trialEnd set) is charged from day 1 on the next checkout.
 *
 * The billing page must therefore gate BOTH the "14-day free trial" badge and
 * the "No credit card required" disclosure on `!subscription?.trialEnd`, so we
 * never advertise a card-free trial to someone we will charge immediately.
 * (Landing-page pricing-section is correctly scoped already — a logged-out
 * visitor has no trial history — and stays untouched.)
 */

// Hoisted so each case can swap the subscription shape before render.
const mockState = vi.hoisted(() => ({
  subscription: undefined as undefined | Record<string, unknown>,
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLocale: () => "en-US",
}));

// The trial disclosure is independent of the past_due/cancel status notice;
// stub it to null to isolate the render on the disclosure logic.
vi.mock("@/lib/billing/status-notice", () => ({
  billingStatusNotice: () => null,
}));

vi.mock("@/hooks/use-billing", () => ({
  useSubscription: () => ({ data: mockState.subscription }),
  useUsage: () => ({ data: undefined, isLoading: false }),
  useFounderCount: () => ({
    data: { claimed: 0, total: 200, available: 200 },
  }),
  useCheckout: () => ({ mutate: vi.fn(), isPending: false }),
  useManageBilling: () => ({ mutate: vi.fn(), isPending: false }),
}));

import BillingPage from "@/app/(app)/settings/billing/page";

describe("BillingPage — D-52 card-free disclosure gated per-user", () => {
  // Renders share one jsdom document; clean between cases so a prior render's
  // disclosure never leaks into a negative assertion.
  afterEach(() => cleanup());

  it("shows the trial badge + 'No credit card required' when the user has NOT consumed a trial (trialEnd null)", () => {
    mockState.subscription = {
      plan: "none",
      status: "none",
      stripeConfigured: true,
      trialEnd: null,
    };

    render(<BillingPage />);

    expect(screen.getByText("14-day free trial")).toBeTruthy();
    expect(screen.getByText("No credit card required")).toBeTruthy();
  });

  it("hides BOTH once the user has consumed a trial (trialEnd set) — the next checkout charges from day 1", () => {
    mockState.subscription = {
      plan: "none",
      status: "none",
      stripeConfigured: true,
      trialEnd: "2026-01-01T00:00:00.000Z",
    };

    render(<BillingPage />);

    expect(screen.queryByText("14-day free trial")).toBeNull();
    expect(screen.queryByText("No credit card required")).toBeNull();
  });
});
