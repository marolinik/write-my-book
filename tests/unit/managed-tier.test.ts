/**
 * D4 — the managed no-key tier.
 *
 * A cold Free writer has zero working AI until they paste a provider key. It
 * has been named the biggest grade-lifter twice, by two separate reviews, and
 * it is the only lever left on the free-tier ceiling.
 *
 * It is also the one item in this backlog that spends the owner's money, and
 * `client-factory.ts` opens with a deliberate invariant: "No key -> explicit
 * error (never silently falls back to platform keys)." This module does not
 * break that invariant, it names the exception: the fallback is explicit, it
 * is metered, it is disclosed to the writer, and it does not exist at all
 * until the owner turns it on.
 *
 * Three things the contract insists on:
 *  - **Off unless two separate switches are set.** A key alone does nothing;
 *    an enable flag alone does nothing. Nobody enables this by accident.
 *  - **The cap counts unbilled rows too.** A generation the product threw away
 *    (D3) still cost the owner real money when it ran on the owner's key. The
 *    writer is not charged for it; the cap absolutely still is.
 *  - **Only Free writers.** A paying writer with their own key never silently
 *    ends up on the platform's.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MANAGED_TIER,
  managedTierConfig,
  managedAllowance,
} from "@/lib/billing/managed-tier";

const KEY_ENV = { MANAGED_TIER_ENABLED: "1", WMB_MANAGED_KEY: "sk-test", WMB_MANAGED_KEY_PROVIDER: "anthropic" };

describe("the managed tier switch", () => {
  it("is off with no environment at all", () => {
    expect(managedTierConfig({})).toBeNull();
  });

  it("is off when only the key is present", () => {
    expect(managedTierConfig({ WMB_MANAGED_KEY: "sk-test", WMB_MANAGED_KEY_PROVIDER: "anthropic" })).toBeNull();
  });

  it("is off when only the flag is present", () => {
    expect(managedTierConfig({ MANAGED_TIER_ENABLED: "1" })).toBeNull();
  });

  it("is on only when the owner set both", () => {
    const config = managedTierConfig(KEY_ENV);
    expect(config).not.toBeNull();
    expect(config!.provider).toBe("anthropic");
    expect(config!.apiKey).toBe("sk-test");
  });

  it("refuses a provider this product cannot route", () => {
    expect(managedTierConfig({ ...KEY_ENV, WMB_MANAGED_KEY_PROVIDER: "nonsense" })).toBeNull();
  });
});

describe("the allowance", () => {
  const config = managedTierConfig(KEY_ENV)!;

  it("is refused to a writer who is not on Free", () => {
    const allowance = managedAllowance({ config, isFree: false, spentTodayUsd: 0, spentThisMonthUsd: 0 });
    expect(allowance.granted).toBe(false);
    expect(allowance.reason).toBe("not-free");
  });

  it("is granted to a cold Free writer who has spent nothing", () => {
    const allowance = managedAllowance({ config, isFree: true, spentTodayUsd: 0, spentThisMonthUsd: 0 });
    expect(allowance.granted).toBe(true);
    expect(allowance.remainingTodayUsd).toBe(MANAGED_TIER.dailyCostCapUsd);
  });

  it("stops at the daily cap", () => {
    const allowance = managedAllowance({
      config,
      isFree: true,
      spentTodayUsd: MANAGED_TIER.dailyCostCapUsd,
      spentThisMonthUsd: 0,
    });
    expect(allowance.granted).toBe(false);
    expect(allowance.reason).toBe("daily-cap");
  });

  it("stops at the monthly cap even on a fresh day", () => {
    const allowance = managedAllowance({
      config,
      isFree: true,
      spentTodayUsd: 0,
      spentThisMonthUsd: MANAGED_TIER.monthlyCostCapUsd,
    });
    expect(allowance.granted).toBe(false);
    expect(allowance.reason).toBe("monthly-cap");
  });

  it("never reports a negative remainder", () => {
    const allowance = managedAllowance({
      config,
      isFree: true,
      spentTodayUsd: MANAGED_TIER.dailyCostCapUsd * 3,
      spentThisMonthUsd: 0,
    });
    expect(allowance.remainingTodayUsd).toBe(0);
  });

  it("has caps that are real money, not placeholders", () => {
    expect(MANAGED_TIER.dailyCostCapUsd).toBeGreaterThan(0);
    expect(MANAGED_TIER.monthlyCostCapUsd).toBeGreaterThan(MANAGED_TIER.dailyCostCapUsd);
  });
});

describe("the agent route", () => {
  const route = readFileSync(
    join(__dirname, "..", "..", "src", "app", "api", "books", "[id]", "agent", "route.ts"),
    "utf-8"
  );

  it("only reaches for the managed key when the writer has none of their own", () => {
    expect(route).toContain("const hasOwnKey");
    expect(route).toMatch(/hasOwnKey[\s\S]{0,80}managedKeyFor/);
  });

  it("stamps a managed run as platform spend, or the cap is a no-op", () => {
    // A managed run recorded as the writer's own spend would make the
    // platform cap unenforceable and the disclosure untrue.
    expect(route).toContain('keySource: managedConfig ? "platform" : "user"');
  });

  it("never hands a platform key to the wrong provider slot", () => {
    expect(route).toContain("function keyIfProvider");
    expect(route).toContain("config.provider === provider");
  });
});
