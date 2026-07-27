// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * D-181 (S4, P6 v3) — the billing page headlined "Your Key Savings" over a
 * figure ($12.48) that its own body admits is total SPENT. Spend labelled as
 * savings on a money surface is the D-152 labelling family; the number and the
 * body copy were already honest, only the headline lied.
 */

vi.mock("@/components/providers/language-provider", () => ({ useLocale: () => "en-US" }));
vi.mock("@/lib/billing/status-notice", () => ({ billingStatusNotice: () => null }));

vi.mock("@/hooks/use-billing", () => ({
  useSubscription: () => ({ data: { plan: "founder", status: "active", stripeConfigured: true, trialEnd: null } }),
  useUsage: () => ({
    data: {
      total: { costEstimate: 12.48, sessions: 9, tokensInput: 100, tokensOutput: 200 },
      byKeySource: { user: { costEstimate: 12.48, sessions: 9 } },
    },
    isLoading: false,
  }),
  useFounderCount: () => ({ data: { claimed: 3, total: 200, available: 197 } }),
  useCheckout: () => ({ mutate: vi.fn(), isPending: false }),
  useManageBilling: () => ({ mutate: vi.fn(), isPending: false }),
}));

import BillingPage from "@/app/(app)/settings/billing/page";

afterEach(() => cleanup());

describe("D-181 — spend is labelled as spend", () => {
  it("never headlines the spend figure as savings", () => {
    render(<BillingPage />);
    expect(screen.queryByText(/savings/i)).toBeNull();
  });

  it("names the figure honestly, next to the amount it reports", () => {
    render(<BillingPage />);
    // The figure is on screen (it also appears in the per-source breakdown).
    expect(screen.getAllByText("$12.48").length).toBeGreaterThan(0);
    // Headline names it as spend, and the amount carries its own label.
    expect(screen.getByText(/Your AI Spend/i)).toBeTruthy();
    expect(screen.getByText(/Total spent \(last 30 days\)/i)).toBeTruthy();
  });
});
