// tests/unit/update-chapter-schema.test.ts
// S13: chapter word targets — the PATCH route is generic (schema.parse → db
// update), so the schema IS the contract. These tests pin targetWordCount.
import { describe, it, expect } from "vitest";
import { updateChapterSchema } from "@/lib/validation";

describe("updateChapterSchema.targetWordCount", () => {
  it("accepts a non-negative integer", () => {
    expect(
      updateChapterSchema.parse({ targetWordCount: 2000 }).targetWordCount
    ).toBe(2000);
    expect(
      updateChapterSchema.parse({ targetWordCount: 0 }).targetWordCount
    ).toBe(0);
  });

  it("accepts null so a user can clear the target", () => {
    expect(
      updateChapterSchema.parse({ targetWordCount: null }).targetWordCount
    ).toBeNull();
  });

  it("is optional — absent key stays absent (no accidental overwrite)", () => {
    expect(
      updateChapterSchema.parse({ title: "Ch" }).targetWordCount
    ).toBeUndefined();
  });

  it("rejects negative values", () => {
    expect(() =>
      updateChapterSchema.parse({ targetWordCount: -1 })
    ).toThrow();
  });

  it("rejects non-integer floats", () => {
    expect(() =>
      updateChapterSchema.parse({ targetWordCount: 1500.5 })
    ).toThrow();
  });

  it("rejects string values (no coercion on a JSON body)", () => {
    expect(() =>
      updateChapterSchema.parse({ targetWordCount: "2000" })
    ).toThrow();
  });

  it("does not disturb existing keys when combined", () => {
    const parsed = updateChapterSchema.parse({
      title: "The Storm",
      targetWordCount: 3500,
    });
    expect(parsed.title).toBe("The Storm");
    expect(parsed.targetWordCount).toBe(3500);
  });
});
