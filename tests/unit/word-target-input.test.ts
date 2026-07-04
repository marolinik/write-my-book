// tests/unit/word-target-input.test.ts
// S13: pure parser behind the word-target popover input.
// Contract: valid digits → number, empty → null (clear), anything else →
// undefined (invalid; the form must not submit).
import { describe, it, expect } from "vitest";
import { parseWordTargetInput } from "@/lib/word-target";

describe("parseWordTargetInput", () => {
  it("parses plain digit strings to integers", () => {
    expect(parseWordTargetInput("2000")).toBe(2000);
    expect(parseWordTargetInput("0")).toBe(0);
  });

  it("trims surrounding whitespace", () => {
    expect(parseWordTargetInput(" 2000 ")).toBe(2000);
  });

  it("maps empty / whitespace-only input to null (clear target)", () => {
    expect(parseWordTargetInput("")).toBeNull();
    expect(parseWordTargetInput("   ")).toBeNull();
  });

  it("rejects negative numbers as invalid", () => {
    expect(parseWordTargetInput("-5")).toBeUndefined();
  });

  it("rejects floats as invalid", () => {
    expect(parseWordTargetInput("3.5")).toBeUndefined();
  });

  it("rejects non-numeric noise as invalid", () => {
    expect(parseWordTargetInput("abc")).toBeUndefined();
    expect(parseWordTargetInput("1e3")).toBeUndefined();
    expect(parseWordTargetInput("2,000")).toBeUndefined();
  });

  it("caps at 7 digits — keeps values sane and far below int4 overflow", () => {
    expect(parseWordTargetInput("9999999")).toBe(9_999_999);
    expect(parseWordTargetInput("10000000")).toBeUndefined();
  });
});
