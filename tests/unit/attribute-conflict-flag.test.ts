/**
 * H5: attribute-drift continuity check. graph-builder preserve-first keeps the
 * first description and appends each displaced conflicting value to
 * n.descriptionHistory — runConsistencyChecks must flag non-empty history as
 * an attribute_conflict issue, and toContinuityFlags must carry the type
 * (it's registered in BOOK_LEVEL_TYPES so the flag is not silently dropped).
 */
import { describe, it, expect } from "vitest";
import { toContinuityFlags } from "@/lib/continuity/continuity-flags";
import type { ConsistencyIssue } from "@/lib/graph/types";

describe("H5: attribute_conflict flags", () => {
  const issue: ConsistencyIssue = {
    type: "attribute_conflict",
    severity: "major",
    description: 'Character "Their Mother" has conflicting descriptions — stored: "grey eyes" vs also seen: "brown eyes".',
    entities: ["Their Mother"],
    chapters: [1, 2],
  };

  it("carries attribute_conflict through to flags (not dropped)", () => {
    const flags = toContinuityFlags({ issues: [issue], intentionalSignatures: new Set() });
    expect(flags.length).toBe(1);
  });

  it("dedups via stable signature (same issue → same signature)", () => {
    const a = toContinuityFlags({ issues: [issue], intentionalSignatures: new Set() });
    const b = toContinuityFlags({ issues: [{ ...issue, description: "different wording same identity" }], intentionalSignatures: new Set() });
    expect(a[0]?.signature).toBe(b[0]?.signature);
  });

  it("respects intentional-suppression signatures", () => {
    const first = toContinuityFlags({ issues: [issue], intentionalSignatures: new Set() });
    const suppressed = toContinuityFlags({ issues: [issue], intentionalSignatures: new Set([first[0]!.signature]) });
    expect(suppressed.length).toBe(0);
  });
});
