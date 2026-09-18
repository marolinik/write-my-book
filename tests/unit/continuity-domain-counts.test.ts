/**
 * The numbers on the continuity tab have to agree with each other.
 *
 * S3-11: the header read "4 nalaza u 1 oblasti" while the only filled domain
 * card showed 2. The card splits a domain's total into critical / major /
 * minor+suggestion badges, but `total` counts every finding and the severity
 * buckets only count four known words. EditFinding's vocabulary is
 * critical | important | suggestion — so every "important" finding raised the
 * total and appeared in no badge at all.
 */

import { describe, it, expect } from "vitest";
import { domainBadgeCounts } from "@/components/reports/continuity-counts";

describe("domain badge counts", () => {
  it("adds up to the domain total when every severity is known", () => {
    const badges = domainBadgeCounts({
      total: 4,
      critical: 1,
      major: 1,
      minor: 1,
      suggestion: 1,
    });
    expect(badges.critical + badges.major + badges.rest).toBe(4);
  });

  it("still adds up when findings carry a severity the cards do not name", () => {
    // 2 "important" + 2 "suggestion": only the suggestions were ever counted.
    const badges = domainBadgeCounts({
      total: 4,
      critical: 0,
      major: 0,
      minor: 0,
      suggestion: 2,
    });
    expect(badges.critical + badges.major + badges.rest).toBe(4);
    expect(badges.rest).toBe(4);
  });

  it("never reports more than the total", () => {
    const badges = domainBadgeCounts({
      total: 1,
      critical: 3,
      major: 0,
      minor: 0,
      suggestion: 0,
    });
    expect(badges.critical + badges.major + badges.rest).toBe(1);
  });

  it("shows nothing for an empty domain", () => {
    const badges = domainBadgeCounts({
      total: 0,
      critical: 0,
      major: 0,
      minor: 0,
      suggestion: 0,
    });
    expect(badges).toEqual({ critical: 0, major: 0, rest: 0 });
  });
});
