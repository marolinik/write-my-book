import { describe, it, expect, afterEach } from "vitest";
import {
  isFreeTier,
  isFreeTierEnabled,
  utcMonthStart,
  utcDayKey,
  FREE_TIER,
} from "@/lib/billing/free-tier";

const future = () => new Date(Date.now() + 7 * 24 * 3600 * 1000);
const past = () => new Date(Date.now() - 7 * 24 * 3600 * 1000);

describe("isFreeTier — the single downgrade rule", () => {
  it("no subscription row → Free", () => {
    expect(isFreeTier(null)).toBe(true);
    expect(isFreeTier(undefined)).toBe(true);
  });

  it("status none / canceled → Free", () => {
    expect(isFreeTier({ status: "none", trialEnd: null })).toBe(true);
    expect(isFreeTier({ status: "canceled", trialEnd: null })).toBe(true);
  });

  it("expired trial → Free; live trial → NOT Free", () => {
    expect(isFreeTier({ status: "trialing", trialEnd: past() })).toBe(true);
    expect(isFreeTier({ status: "trialing", trialEnd: future() })).toBe(false);
    // Unknown trial end is treated as live (paid), not Free.
    expect(isFreeTier({ status: "trialing", trialEnd: null })).toBe(false);
  });

  it("active / past_due → NOT Free", () => {
    expect(isFreeTier({ status: "active", trialEnd: null })).toBe(false);
    expect(isFreeTier({ status: "past_due", trialEnd: null })).toBe(false);
  });
});

describe("isFreeTierEnabled — rollback lever", () => {
  afterEach(() => {
    delete process.env.FREE_TIER_DISABLED;
  });

  it("enabled by default; disabled only when env === '1'", () => {
    delete process.env.FREE_TIER_DISABLED;
    expect(isFreeTierEnabled()).toBe(true);
    process.env.FREE_TIER_DISABLED = "1";
    expect(isFreeTierEnabled()).toBe(false);
    process.env.FREE_TIER_DISABLED = "0";
    expect(isFreeTierEnabled()).toBe(true);
  });
});

describe("UTC date helpers", () => {
  it("utcMonthStart is the 1st at 00:00:00 UTC", () => {
    const s = utcMonthStart();
    expect(s.getUTCDate()).toBe(1);
    expect(s.getUTCHours()).toBe(0);
    expect(s.getUTCMinutes()).toBe(0);
    expect(s.getUTCSeconds()).toBe(0);
  });

  it("utcDayKey formats YYYY-MM-DD in UTC", () => {
    expect(utcDayKey(new Date(Date.UTC(2026, 6, 9, 23, 59)))).toBe("2026-07-09");
    expect(utcDayKey(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-12-31");
  });
});

describe("FREE_TIER constants (approved defaults)", () => {
  it("match the spec's cap defaults", () => {
    expect(FREE_TIER.maxBooks).toBe(1);
    expect(FREE_TIER.monthlyAgentSessions).toBe(20);
    expect(FREE_TIER.dailyGhostText).toBe(100);
    expect(FREE_TIER.dailyInlineEdit).toBe(50);
    expect(FREE_TIER.maxAiEligibleWords).toBe(40_000);
    expect(FREE_TIER.maxConcurrentSessions).toBe(1);
  });
});
