import { describe, it, expect } from "vitest";
import { groupBooks } from "@/lib/shelf/group-books";
import type { ShelfBookInput } from "@/lib/shelf/types";

const now = new Date("2026-07-03T12:00:00Z");

function mk(over: Partial<ShelfBookInput>): ShelfBookInput {
  return {
    id: "x", name: "X", genre: null, status: "writing", wordCount: 0,
    archivedAt: null, updatedAt: new Date("2026-07-01T00:00:00Z"),
    chapterCount: 0, pendingFindings: 0, ...over,
  };
}

describe("groupBooks", () => {
  it("routes each book to exactly one shelf", () => {
    const groups = groupBooks({
      books: [
        mk({ id: "w", status: "writing" }),
        mk({ id: "f", status: "editing", pendingFindings: 1 }),
        mk({ id: "c", status: "complete" }),
        mk({ id: "a", archivedAt: new Date() }),
      ],
      rollups: new Map(),
      lastChapters: new Map(),
      now,
    });
    expect(groups.currentlyWriting.map((b) => b.id)).toEqual(["w"]);
    expect(groups.waiting.map((b) => b.id)).toEqual(["f"]);
    expect(groups.completed.map((b) => b.id)).toEqual(["c"]);
    expect(groups.archived.map((b) => b.id)).toEqual(["a"]);
  });

  it("sorts each shelf by updatedAt desc", () => {
    const groups = groupBooks({
      books: [
        mk({ id: "old", updatedAt: new Date("2026-06-01T00:00:00Z") }),
        mk({ id: "new", updatedAt: new Date("2026-07-02T00:00:00Z") }),
      ],
      rollups: new Map(),
      lastChapters: new Map(),
      now,
    });
    expect(groups.currentlyWriting.map((b) => b.id)).toEqual(["new", "old"]);
  });

  it("uses an empty rollup and null lastChapter when maps lack the book", () => {
    const groups = groupBooks({
      books: [mk({ id: "x" })],
      rollups: new Map(),
      lastChapters: new Map(),
      now,
    });
    const view = groups.currentlyWriting[0];
    expect(view.drafted).toBe(0);
    expect(view.lastChapterId).toBeNull();
  });
});
