import { describe, it, expect } from "vitest";
import {
  computeSeriesNextBook,
  isBookFinished,
} from "@/lib/series/next-book";

describe("series next-book (UDG round-3, Filip/Olivera)", () => {
  it("isBookFinished treats complete/export as finished", () => {
    expect(isBookFinished("complete")).toBe(true);
    expect(isBookFinished("export")).toBe(true);
    for (const s of ["concept", "planning", "writing", "editing", "beta"]) {
      expect(isBookFinished(s)).toBe(false);
    }
  });

  it("returns the lowest-numbered unfinished book as next", () => {
    const next = computeSeriesNextBook([
      { id: "1", bookNumber: 1, status: "complete" },
      { id: "2", bookNumber: 2, status: "export" },
      { id: "3", bookNumber: 3, status: "writing" },
      { id: "4", bookNumber: 4, status: "concept" },
    ]);
    expect(next.nextBookNumber).toBe(3);
    expect(next.finishedCount).toBe(2);
    expect(next.inProgressCount).toBe(2);
  });

  it("counts volumes correctly when none finished", () => {
    const next = computeSeriesNextBook([
      { id: "1", bookNumber: 1, status: "concept" },
    ]);
    expect(next.finishedCount).toBe(0);
    expect(next.inProgressCount).toBe(1);
    expect(next.nextBookNumber).toBe(1);
  });

  it("gaps are ignored in favor of the lowest unfinished number", () => {
    // Book 1 finished; book 3 (not 2) exists and is unfinished → next is 3.
    const next = computeSeriesNextBook([
      { id: "1", bookNumber: 1, status: "complete" },
      { id: "3", bookNumber: 3, status: "writing" },
    ]);
    expect(next.nextBookNumber).toBe(3);
  });

  it("when all existing finished, next is maxNumber + 1", () => {
    const next = computeSeriesNextBook([
      { id: "1", bookNumber: 1, status: "complete" },
      { id: "2", bookNumber: 2, status: "export" },
    ]);
    expect(next.finishedCount).toBe(2);
    expect(next.nextBookNumber).toBe(3);
  });

  it("empty series yields next book number 1", () => {
    const next = computeSeriesNextBook([]);
    expect(next.finishedCount).toBe(0);
    expect(next.nextBookNumber).toBe(1);
  });

  it("sorts out-of-order input by bookNumber", () => {
    const next = computeSeriesNextBook([
      { id: "b", bookNumber: 2, status: "concept" },
      { id: "a", bookNumber: 1, status: "complete" },
    ]);
    expect(next.nextBookNumber).toBe(2);
  });
});