// @vitest-environment jsdom
// P1-7 / D4: the billing page told a lapsed Founder "Choose a plan below to
// pick up where you left off" while the Founder card had no button (R-044).
// A lapsed Founder now gets the Founder checkout, even when the card is sold
// out for everyone else.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

const mockState = vi.hoisted(() => ({
  subscription: undefined as undefined | Record<string, unknown>,
}));

vi.mock("@/components/providers/language-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/providers/language-provider")>();
  const { getUIStrings } = await import("@/lib/i18n/ui-strings");
  return {
    ...actual,
    useLocale: () => "en-US",
    useLanguage: () => ({ language: "en", t: getUIStrings("en"), isLoading: false }),
  };
});
vi.mock("@/lib/billing/status-notice", () => ({ billingStatusNotice: () => null }));
vi.mock("@/hooks/use-billing", () => ({
  useSubscription: () => ({ data: mockState.subscription }),
  useUsage: () => ({ data: undefined, isLoading: false }),
  useFounderCount: () => ({ data: { claimed: 200, total: 200, available: 0 } }),
  useCheckout: () => ({ mutate: vi.fn(), isPending: false }),
  useManageBilling: () => ({ mutate: vi.fn(), isPending: false }),
}));

import BillingPage from "@/app/(app)/settings/billing/page";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const t = getUIStrings("en");

function founderCard(): HTMLElement {
  const title = screen.getAllByText("Founder").find((el) => el.closest("[class*='relative']"));
  return title!.closest("[class*='relative']") as HTMLElement;
}

afterEach(() => cleanup());

describe("BillingPage — Founder card when every slot is claimed", () => {
  it("offers a lapsed Founder the Founder checkout", () => {
    mockState.subscription = { plan: "founder", status: "canceled", stripeConfigured: true, trialEnd: null };
    render(<BillingPage />);
    const card = founderCard();
    expect(within(card).getByRole("button", { name: t.common.upgrade })).toBeTruthy();
    expect(within(card).queryByRole("button", { name: t.billingUI.soldOut })).toBeNull();
  });

  it("shows sold out to a writer who never held a slot", () => {
    mockState.subscription = { plan: "none", status: "none", stripeConfigured: true, trialEnd: null };
    render(<BillingPage />);
    const card = founderCard();
    expect(within(card).queryByRole("button", { name: t.common.upgrade })).toBeNull();
    expect(within(card).getByRole("button", { name: t.billingUI.soldOut })).toBeTruthy();
  });
});
