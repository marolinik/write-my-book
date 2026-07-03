import { describe, it, expect } from "vitest";
import { buildRollups } from "@/lib/shelf/chapter-rollup";

describe("buildRollups", () => {
  it("sums drafted (draft-or-beyond) and analyzed (dev_edited+) per book", () => {
    const rows = [
      { bookId: "a", status: "planned", count: 2 },
      { bookId: "a", status: "drafted", count: 3 },
      { bookId: "a", status: "dev_edited", count: 4 },
      { bookId: "b", status: "beta_passed", count: 1 },
    ];
    const map = buildRollups(rows);
    expect(map.get("a")).toEqual({ drafted: 7, analyzed: 4 });
    expect(map.get("b")).toEqual({ drafted: 1, analyzed: 1 });
  });

  it("returns an empty map for no rows and undefined for unknown books", () => {
    const map = buildRollups([]);
    expect(map.size).toBe(0);
    expect(map.get("nope")).toBeUndefined();
  });

  it("counts undiscussed/discussed/planned as neither drafted nor analyzed", () => {
    const map = buildRollups([
      { bookId: "a", status: "undiscussed", count: 1 },
      { bookId: "a", status: "discussed", count: 1 },
      { bookId: "a", status: "planned", count: 1 },
    ]);
    expect(map.get("a")).toEqual({ drafted: 0, analyzed: 0 });
  });
});
