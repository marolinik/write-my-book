// @vitest-environment jsdom
// P1-6: back from Stripe with ?success=true, the billing page keeps asking
// for the subscription until the paid plan shows, and after 30 s without it
// says the payment arrived and the plan is still updating, instead of
// silently showing Free.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

const mockState = vi.hoisted(() => ({
  subscription: undefined as undefined | Record<string, unknown>,
  subscriptionOptions: [] as unknown[],
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
  useSubscription: (options?: unknown) => {
    mockState.subscriptionOptions.push(options);
    return { data: mockState.subscription };
  },
  useUsage: () => ({ data: undefined, isLoading: false }),
  useFounderCount: () => ({ data: { claimed: 0, total: 200, available: 200 } }),
  useCheckout: () => ({ mutate: vi.fn(), isPending: false }),
  useManageBilling: () => ({ mutate: vi.fn(), isPending: false }),
}));

import BillingPage from "@/app/(app)/settings/billing/page";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const FREE = { plan: "none", status: "none", stripeConfigured: true, trialEnd: null };
const NOTE = getUIStrings("en").billingUI.paymentStillProcessing;

beforeEach(() => {
  vi.useFakeTimers();
  mockState.subscription = FREE;
  mockState.subscriptionOptions = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("BillingPage — returning from a paid checkout", () => {
  it("polls the subscription every 3 s while the paid plan has not landed", () => {
    window.history.replaceState({}, "", "/settings/billing?success=true");
    render(<BillingPage />);
    expect(mockState.subscriptionOptions.at(-1)).toEqual({ pollUntilPaid: true });
  });

  it("after 30 s still on Free, says the payment arrived and the plan is updating", () => {
    window.history.replaceState({}, "", "/settings/billing?success=true");
    render(<BillingPage />);
    expect(screen.queryByText(NOTE)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(mockState.subscriptionOptions.at(-1)).toEqual({ pollUntilPaid: false });
  });

  it("does not poll on an ordinary visit", () => {
    render(<BillingPage />);
    expect(mockState.subscriptionOptions.at(-1)).toEqual({ pollUntilPaid: false });
  });
});

describe("paymentPollInterval", () => {
  it("keeps asking every 3 s while the writer still looks Free", async () => {
    const { paymentPollInterval } = await vi.importActual<typeof import("@/hooks/use-billing")>("@/hooks/use-billing");
    expect(paymentPollInterval(FREE as never)).toBe(3000);
    expect(paymentPollInterval(undefined)).toBe(3000);
  });

  it("stops once the paid plan has landed", async () => {
    const { paymentPollInterval } = await vi.importActual<typeof import("@/hooks/use-billing")>("@/hooks/use-billing");
    expect(paymentPollInterval({ ...FREE, plan: "indie", status: "active" } as never)).toBe(false);
  });
});
