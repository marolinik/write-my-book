/**
 * A renumber must account for EVERY chapter in the book, not only the ones the
 * caller named.
 *
 * S3-6, second half: undoing a structural move replays an ordering captured
 * when the move was applied. If the book has gained a chapter since — because
 * an earlier undo restored one, or the writer added one — that chapter is not
 * in the stored ordering, so phase A never parks it, and phase B walks a target
 * number straight into it:
 *
 *   Unique constraint failed on the fields: (`book_id`, `chapter_number`)
 *
 * It failed mid-transaction on the owner's real manuscript. The fix is for the
 * renumber to park the whole book and give the unnamed chapters numbers after
 * the named ones, keeping their relative order.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const recorded: Recorded[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    chapter: {
      update: ({ where, data }: { where: { id: string }; data: { chapterNumber: number } }) => {
        recorded.push({ table: "chapter", id: where.id, to: data.chapterNumber });
        return null;
      },
    },
    document: {
      updateMany: ({ where, data }: { where: { chapterNumber?: number }; data: { chapterNumber: number } }) => {
        recorded.push({ table: "document", from: where.chapterNumber, to: data.chapterNumber });
        return null;
      },
    },
  },
}));

import { buildRenumberOps, TEMP_OFFSET } from "@/lib/chapters/renumber";

interface Recorded {
  table: "chapter" | "document";
  id?: string;
  from?: number;
  to: number;
}

/**
 * Replays the ops against a fake table so the test asserts on the OUTCOME —
 * whether any two chapters ever hold the same number — rather than on the shape
 * of the op list.
 */
function replay(ops: Recorded[], start: Map<string, number>) {
  const numbers = new Map(start);
  const collisions: string[] = [];

  for (const op of ops) {
    if (op.table !== "chapter" || !op.id) continue;
    const taken = [...numbers.entries()].find(
      ([id, n]) => id !== op.id && n === op.to
    );
    if (taken) collisions.push(`${op.id} -> ${op.to} already held by ${taken[0]}`);
    numbers.set(op.id, op.to);
  }

  return { numbers, collisions };
}

/** Turns the Prisma op list into something replayable without a database. */
function record(
  order: Array<{ chapterId: string; chapterNumber: number }>,
  oldNumberById: Map<string, number>,
  allChapters?: Array<{ id: string; chapterNumber: number }>
): Recorded[] {
  buildRenumberOps("b1", order, oldNumberById, allChapters);
  return [...recorded];
}

describe("buildRenumberOps", () => {
  beforeEach(() => {
    recorded.length = 0;
  });

  it("parks a chapter the ordering never mentions, instead of colliding with it", () => {
    // The book holds four chapters; the stored ordering knows only three.
    const all = [
      { id: "c1", chapterNumber: 1 },
      { id: "c2", chapterNumber: 2 },
      { id: "stranger", chapterNumber: 3 },
      { id: "c3", chapterNumber: 4 },
    ];
    const order = [
      { chapterId: "c1", chapterNumber: 1 },
      { chapterId: "c2", chapterNumber: 2 },
      { chapterId: "c3", chapterNumber: 3 }, // walks straight into "stranger"
    ];
    const oldNumberById = new Map(all.map((c) => [c.id, c.chapterNumber]));

    const ops = record(order, oldNumberById, all);
    const { collisions, numbers } = replay(ops, new Map(oldNumberById));

    expect(collisions).toEqual([]);
    expect(numbers.get("c3")).toBe(3);
    // The unnamed chapter keeps its prose and lands after the named ones.
    expect(numbers.get("stranger")).toBe(4);
  });

  it("parks every chapter before assigning any final number", () => {
    const all = [
      { id: "c1", chapterNumber: 1 },
      { id: "c2", chapterNumber: 2 },
      { id: "stranger", chapterNumber: 3 },
    ];
    const order = [
      { chapterId: "c2", chapterNumber: 1 },
      { chapterId: "c1", chapterNumber: 2 },
    ];
    const oldNumberById = new Map(all.map((c) => [c.id, c.chapterNumber]));

    const ops = record(order, oldNumberById, all).filter((o) => o.table === "chapter");
    const firstFinal = ops.findIndex((o) => o.to < TEMP_OFFSET);
    const parked = ops.slice(0, firstFinal).map((o) => o.id);

    expect(parked).toContain("stranger");
    expect(parked).toHaveLength(all.length);
  });

  it("still works when the caller passes no full-book list", () => {
    const order = [
      { chapterId: "c2", chapterNumber: 1 },
      { chapterId: "c1", chapterNumber: 2 },
    ];
    const oldNumberById = new Map([
      ["c1", 1],
      ["c2", 2],
    ]);

    const ops = record(order, oldNumberById);
    const { collisions, numbers } = replay(ops, new Map(oldNumberById));

    expect(collisions).toEqual([]);
    expect(numbers.get("c2")).toBe(1);
    expect(numbers.get("c1")).toBe(2);
  });
});
