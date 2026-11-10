import { describe, it, expect } from "vitest";
import { findLegalPlaceholders } from "@/lib/legal/placeholders";

describe("findLegalPlaceholders", () => {
  it("finds both placeholder forms the legal pages use", () => {
    const page = "<Term>[Hosting provider: to be completed]</Term> in [to be confirmed: Ireland / United States].";
    expect(findLegalPlaceholders(page)).toEqual([
      "[Hosting provider: to be completed]",
      "[to be confirmed: Ireland / United States]",
    ]);
  });

  it("returns nothing for finished text", () => {
    expect(findLegalPlaceholders("Hosted by Example Ltd in Ireland [1].")).toEqual([]);
  });
});
