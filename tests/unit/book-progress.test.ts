import { describe, it, expect } from "vitest";
import { bookProgressPercent, BOOK_STATUS_PCT } from "@/lib/book/progress";

describe("bookProgressPercent (UDG round-4, Viktor/Milica)", () => {
  it("uses target word count when set and positive", () => {
    expect(
      bookProgressPercent({
        status: "writing",
        wordCount: 500,
        targetWordCount: 1000,
      })
    ).toBe(50);
  });

  it("caps at 100%", () => {
    expect(
      bookProgressPercent({
        status: "writing",
        wordCount: 1500,
        targetWordCount: 1000,
      })
    ).toBe(100);
  });

  it("falls back to the status ladder when no target is set", () => {
    expect(
      bookProgressPercent({ status: "concept", wordCount: 0, targetWordCount: null })
    ).toBe(BOOK_STATUS_PCT.concept);
    expect(
      bookProgressPercent({ status: "editing", wordCount: 0, targetWordCount: null })
    ).toBe(BOOK_STATUS_PCT.editing);
    expect(
      bookProgressPercent({ status: "complete", wordCount: 0, targetWordCount: null })
    ).toBe(BOOK_STATUS_PCT.complete);
  });

  it("maps unknown status to 0", () => {
    expect(
      bookProgressPercent({ status: "mystery", wordCount: 10, targetWordCount: null })
    ).toBe(0);
  });
});