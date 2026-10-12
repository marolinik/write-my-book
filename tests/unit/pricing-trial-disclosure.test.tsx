// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { PricingSection, freePlanFeatures } from "@/components/landing/pricing-section";
import { FREE_TIER } from "@/lib/billing/free-tier";

/**
 * Launch 2026-10: there is no free trial at launch. Every account starts on
 * the Free plan and upgrades from Billing inside the app. The grid used to
 * advertise "Start 14-Day Free Trial" (D-52 disclosed it as card-free) and
 * linked to `/signup?plan=...`, a parameter nothing reads, so the visitor
 * landed on Free anyway. The pricing grid now shows Free itself, with the
 * limits the gates enforce, and promises no trial anywhere.
 */

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

const PLANS = {
  indie: makePlan({ name: "Indie", trialDays: 14 }),
  publisher: makePlan({ name: "Publisher", trialDays: 0, monthlyPrice: 499, annualPrice: 4990 }),
};

describe("PricingSection: Free plan, no trial", () => {
  afterEach(() => cleanup());

  it("never advertises a trial, even for a plan whose config still has trialDays", () => {
    const { container } = render(<PricingSection plans={PLANS as never} />);
    expect(container.textContent ?? "").not.toMatch(/trial/i);
  });

  it("shows the Free plan with the limits the gates enforce", () => {
    render(<PricingSection plans={PLANS as never} />);
    expect(screen.getByText("Free")).toBeTruthy();
    expect(screen.getByText("$0")).toBeTruthy();
    expect(screen.getByText(`${FREE_TIER.monthlyAgentSessions} agent sessions a month`)).toBeTruthy();
    expect(screen.getByText(`${FREE_TIER.dailyPolishScene} scene polishes a day`)).toBeTruthy();
  });

  it("sends every signup CTA to plain /signup, with no ignored ?plan= parameter", () => {
    const { container } = render(<PricingSection plans={PLANS as never} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.filter((h) => h.startsWith("/signup")).every((h) => h === "/signup")).toBe(true);
    expect(hrefs.some((h) => h.includes("?plan="))).toBe(false);
  });

  it("uses the .app domain for the Publisher contact", () => {
    const { container } = render(<PricingSection plans={PLANS as never} />);
    const mailto = [...container.querySelectorAll("a")]
      .map((a) => a.getAttribute("href") ?? "")
      .find((h) => h.startsWith("mailto:"));
    expect(mailto).toContain("@writemybook.app");
  });

  it("promises key-free AI only when the hosted allowance is on", () => {
    expect(freePlanFeatures(false).join(" ")).not.toMatch(/without a key/i);
    expect(freePlanFeatures(true).join(" ")).toMatch(/without a key/i);
  });
});
