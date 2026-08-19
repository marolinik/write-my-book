import { describe, it, expect } from "vitest";
import {
  isBlank,
  isDestructiveReplacement,
  isAutoApplicable,
} from "@/lib/editorial/finding-applicability";

/**
 * D-41a: a finding whose replacement (`newText`) is blank must never read as an
 * applicable suggestion — applying it deletes the passage it points to. These
 * pin the shared decision used by the list route (presentation) and the apply
 * route (safety).
 */
describe("finding-applicability", () => {
  describe("isBlank", () => {
    it("treats null / undefined / empty / whitespace as blank", () => {
      for (const v of [null, undefined, "", "   ", "\n\t ", " "]) {
        //   (nbsp) is whitespace under String.prototype.trim
        expect(isBlank(v as string | null | undefined)).toBe(true);
      }
    });
    it("treats any visible content as non-blank", () => {
      for (const v of ["x", "  a  ", "…", "0"]) {
        expect(isBlank(v)).toBe(false);
      }
    });
    it("treats zero-width-only strings as blank (they survive trim but render as nothing)", () => {
      // U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+2060 word joiner — an
      // "invisible replacement" made of these would still delete the passage.
      const [zwsp, zwnj, zwj, wj] = [0x200b, 0x200c, 0x200d, 0x2060].map((c) =>
        String.fromCharCode(c)
      );
      for (const v of [zwsp, zwnj + zwj, ` ${wj} `, zwsp.repeat(3)]) {
        expect(isBlank(v)).toBe(true);
      }
      // ...but zero-width chars inside real content do not blank it
      expect(isBlank(`re${zwsp}al`)).toBe(false);
    });
  });

  describe("isDestructiveReplacement", () => {
    it("is true when a passage is named but the replacement is blank", () => {
      expect(isDestructiveReplacement("the old line", "")).toBe(true);
      expect(isDestructiveReplacement("the old line", "   ")).toBe(true);
      expect(isDestructiveReplacement("the old line", null)).toBe(true);
      expect(isDestructiveReplacement("the old line", undefined)).toBe(true);
    });
    it("is false when there is a real replacement", () => {
      expect(isDestructiveReplacement("old", "new")).toBe(false);
    });
    it("is false for an insertion (blank originalText) — the D-13 empty-span rule", () => {
      expect(isDestructiveReplacement("", "inserted clause")).toBe(false);
      expect(isDestructiveReplacement(null, "inserted clause")).toBe(false);
    });
    it("is false for pure advice (both blank)", () => {
      expect(isDestructiveReplacement(null, null)).toBe(false);
      expect(isDestructiveReplacement("", "")).toBe(false);
    });
  });

  describe("isAutoApplicable", () => {
    it("is true only when both a passage and a real replacement exist", () => {
      expect(isAutoApplicable("old", "new")).toBe(true);
    });
    it("is false when the replacement is blank (would delete prose)", () => {
      expect(isAutoApplicable("old", "")).toBe(false);
      expect(isAutoApplicable("old", "   ")).toBe(false);
    });
    it("is false for advice-only findings (no passage)", () => {
      expect(isAutoApplicable(null, null)).toBe(false);
      expect(isAutoApplicable("", "new")).toBe(false);
    });
  });
});
