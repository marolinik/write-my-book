// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

/**
 * P1-S11, P1-S21, X-S16, X-S11, P3-S03 — the billing page marked the STORED
 * plan "Current" (`currentPlan = subscription.plan`). A canceled or lapsed
 * subscription keeps its plan value on purpose (R-019/R-060: "for reference")
 * while the writer is on Free, so a lapsed Indie trial showed Indie as
 * "Current" with only "Manage Subscription" (the Stripe portal cannot restart
 * a canceled subscription) and no Upgrade: no way to buy back the very plan
 * every Free wall recommends. The page never said "Free" at all.
 *
 * "Current" must come from the plan the writer HAS, by the same rule every gate
 * uses (isFreeTier). Also: an expired trial's banner read "free trial of Free".
 */

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
  useFounderCount: () => ({ data: { claimed: 12, total: 200, available: 188 } }),
  useCheckout: () => ({ mutate: vi.fn(), isPending: false }),
  useManageBilling: () => ({ mutate: vi.fn(), isPending: false }),
}));

import BillingPage from "@/app/(app)/settings/billing/page";
import { effectivePlanKey } from "@/lib/billing/effective-plan";

const PAST = "2026-09-20T10:00:00.000Z";
const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

function card(planName: string): HTMLElement {
  const title = screen.getByText(planName, { selector: "span" });
  const root = title.closest('[data-slot="card"]');
  if (!root) throw new Error(`no card for ${planName}`);
  return root as HTMLElement;
}

function sub(fields: Record<string, unknown>) {
  mockState.subscription = {
    plan: "none",
    status: "none",
    stripeConfigured: true,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    ...fields,
  };
}

afterEach(() => cleanup());

describe("effectivePlanKey — the plan the writer has right now", () => {
  it("is the stored plan while it is live", () => {
    expect(effectivePlanKey({ plan: "indie", status: "active", trialEnd: null })).toBe("indie");
    expect(effectivePlanKey({ plan: "indie", status: "past_due", trialEnd: null })).toBe("indie");
    expect(effectivePlanKey({ plan: "indie", status: "trialing", trialEnd: FUTURE })).toBe("indie");
  });

  it("is Free ('none') once the plan has lapsed, whatever plan is stored", () => {
    expect(effectivePlanKey({ plan: "indie", status: "canceled", trialEnd: PAST })).toBe("none");
    expect(effectivePlanKey({ plan: "founder", status: "canceled", trialEnd: null })).toBe("none");
    expect(effectivePlanKey({ plan: "indie", status: "trialing", trialEnd: PAST })).toBe("none");
    expect(effectivePlanKey({ plan: "none", status: "none", trialEnd: null })).toBe("none");
    expect(effectivePlanKey(null)).toBe("none");
  });
});

describe("BillingPage — Current follows the effective plan", () => {
  it("a lapsed (canceled) Indie trial: Indie is NOT Current and offers Upgrade; the page says Free", () => {
    sub({ plan: "indie", status: "canceled", trialEnd: PAST, planName: "Free" });
    render(<BillingPage />);

    const indie = card("Indie Author");
    expect(within(indie).queryByText("Current")).toBeNull();
    expect(within(indie).getByRole("button", { name: "Upgrade" })).toBeTruthy();
    expect(within(indie).queryByRole("button", { name: /Manage Subscription/ })).toBeNull();
    expect(screen.queryAllByText("Current")).toHaveLength(0);

    expect(screen.getByText(/on the Free plan/)).toBeTruthy();
    expect(screen.getByText(/Your Indie Author plan has ended/)).toBeTruthy();
  });

  it("an expired trial still marked trialing: no Current, Upgrade offered, and the banner never says 'of Free'", () => {
    sub({ plan: "indie", status: "trialing", trialEnd: PAST, planName: "Free" });
    render(<BillingPage />);

    const indie = card("Indie Author");
    expect(within(indie).queryByText("Current")).toBeNull();
    expect(within(indie).getByRole("button", { name: "Upgrade" })).toBeTruthy();

    expect(screen.queryByText(/of Free/)).toBeNull();
    // R-063: the trial banner still shows, with its end date, once expired.
    expect(screen.getByText(/free trial of Indie Author has ended/)).toBeTruthy();
    expect(screen.getByText(new RegExp(new Date(PAST).toLocaleDateString("en-US").replace(/\//g, "\\/")))).toBeTruthy();
  });

  it("a live trial is still Current, with Manage Subscription and the trial banner", () => {
    sub({ plan: "indie", status: "trialing", trialEnd: FUTURE, planName: "Indie Author" });
    render(<BillingPage />);

    const indie = card("Indie Author");
    expect(within(indie).getByText("Current")).toBeTruthy();
    expect(within(indie).getByRole("button", { name: /Manage Subscription/ })).toBeTruthy();
    expect(within(indie).queryByRole("button", { name: "Upgrade" })).toBeNull();
    expect(screen.getByText(/You’re on a 14-day free trial of Indie Author/)).toBeTruthy();
    expect(screen.queryByText(/on the Free plan/)).toBeNull();
  });

  it("an active paid plan is Current and there is no Free notice", () => {
    sub({ plan: "professional", status: "active", planName: "Professional" });
    render(<BillingPage />);

    expect(within(card("Professional")).getByText("Current")).toBeTruthy();
    expect(screen.queryByText(/on the Free plan/)).toBeNull();
  });

  it("past_due keeps the plan Current (Stripe is still retrying; the gates still grant it)", () => {
    sub({ plan: "indie", status: "past_due", planName: "Indie Author" });
    render(<BillingPage />);

    expect(within(card("Indie Author")).getByText("Current")).toBeTruthy();
  });

  it("a lapsed Founder is not shown as Founder, and is not offered a slot checkout would refuse", () => {
    sub({ plan: "founder", status: "canceled", cancelAtPeriodEnd: true, planName: "Free" });
    render(<BillingPage />);

    const founder = card("Founder");
    expect(within(founder).queryByText("Current")).toBeNull();
    expect(within(founder).queryByRole("button", { name: /Manage Subscription/ })).toBeNull();
    // R-044: a former Founder keeps their slot and cannot reclaim it (400).
    expect(within(founder).queryByRole("button", { name: "Upgrade" })).toBeNull();
    // Every other plan can be bought.
    expect(within(card("Indie Author")).getByRole("button", { name: "Upgrade" })).toBeTruthy();
    expect(screen.getByText(/Your Founder plan has ended/)).toBeTruthy();
  });

  it("a writer who never subscribed is told they are on Free", () => {
    sub({ plan: "none", status: "none", planName: "Free" });
    render(<BillingPage />);

    expect(screen.getByText(/on the Free plan/)).toBeTruthy();
    expect(screen.queryByText(/plan has ended/)).toBeNull();
  });

  it("says nothing about Free before the subscription has loaded", () => {
    mockState.subscription = undefined;
    render(<BillingPage />);

    expect(screen.queryByText(/on the Free plan/)).toBeNull();
  });
});
