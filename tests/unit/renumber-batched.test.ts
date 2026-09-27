/**
 * P6-S10 — a renumber is a fixed handful of statements, not four per chapter.
 *
 * The two-phase renumber was built as four Prisma ops PER CHAPTER in one batch
 * transaction. On a 400-chapter book that is 1,600 round trips, and Prisma's
 * default 5,000 ms transaction timeout expired half way through a merge:
 * "A rollback cannot be executed on an expired transaction". The renumber
 * itself rolled back, but the merge around it had already deleted a chapter.
 *
 * The renumber is now four set-based statements whatever the book's length,
 * run on whatever transaction the caller holds, so a structural move can put
 * its deletes and its renumber in ONE transaction. These tests replay the
 * statements against an in-memory table that enforces both unique indexes row
 * by row, the way Postgres checks a non-deferrable unique index.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface ChapterRow {
  id: string;
  bookId: string;
  chapterNumber: number;
}
interface DocumentRow {
  id: string;
  bookId: string;
  type: string;
  chapterNumber: number | null;
}

const h = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { $transaction: h.$transaction } }));

import {
  renumberChapters,
  renumberChaptersWith,
  TEMP_OFFSET,
} from "@/lib/chapters/renumber";

let chapters: ChapterRow[];
let documents: DocumentRow[];
let statements: string[];
let collisions: string[];

function assign<T extends { chapterNumber: number | null }>(
  rows: T[],
  row: T,
  to: number,
  key: (r: T) => string
) {
  const clash = rows.find((r) => r !== row && key(r) === key({ ...row, chapterNumber: to }));
  if (clash) collisions.push(`${key(row)} -> ${to}`);
  row.chapterNumber = to;
}

/**
 * A client whose `$executeRaw` applies the statement to the tables above.
 * Arrays among the bound values are read in order: the "from" side first (ids
 * for chapters, numbers for documents), then the target numbers.
 */
function fakeClient() {
  return {
    chapter: {
      findMany: vi.fn(async ({ where }: { where: { bookId: string } }) =>
        chapters
          .filter((c) => c.bookId === where.bookId)
          .map((c) => ({ id: c.id, chapterNumber: c.chapterNumber }))
      ),
    },
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      statements.push(sql);
      const bookId = values.find((v) => typeof v === "string") as string;
      const [from, to] = values.filter(Array.isArray) as [unknown[], number[]];

      if (/UPDATE\s+chapters/i.test(sql)) {
        from.forEach((id, i) => {
          const row = chapters.find((c) => c.id === id && c.bookId === bookId);
          if (row) assign(chapters, row, to[i], (r) => `${r.bookId}:${r.chapterNumber}`);
        });
        return from.length;
      }
      if (/UPDATE\s+documents/i.test(sql)) {
        let n = 0;
        from.forEach((old, i) => {
          // Snapshot first: a row moved by this pair must not be matched again.
          const hits = documents.filter((d) => d.bookId === bookId && d.chapterNumber === old);
          hits.forEach((row) => {
            assign(documents, row, to[i], (r) => `${r.bookId}:${r.type}:${r.chapterNumber}`);
            n += 1;
          });
        });
        return n;
      }
      throw new Error(`unexpected statement: ${sql}`);
    }),
  };
}

function book(n: number) {
  chapters = Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    bookId: "b1",
    chapterNumber: i + 1,
  }));
  documents = chapters.flatMap((c) => [
    { id: `content-${c.id}`, bookId: "b1", type: "CHAPTER_CONTENT", chapterNumber: c.chapterNumber },
    { id: `brief-${c.id}`, bookId: "b1", type: "CHAPTER_BRIEF", chapterNumber: c.chapterNumber },
  ]);
}

beforeEach(() => {
  statements = [];
  collisions = [];
  h.$transaction.mockReset();
});

describe("renumberChaptersWith — set-based two-phase renumber", () => {
  it("renumbers a 400-chapter book in a constant four statements", async () => {
    book(400);
    // Move the last chapter to the front.
    const order = [chapters[399], ...chapters.slice(0, 399)].map((c, i) => ({
      chapterId: c.id,
      chapterNumber: i + 1,
    }));

    await renumberChaptersWith(fakeClient() as never, "b1", order);

    expect(statements).toHaveLength(4);
    expect(collisions).toEqual([]);
    expect(chapters.find((c) => c.id === "c400")?.chapterNumber).toBe(1);
    expect(chapters.find((c) => c.id === "c1")?.chapterNumber).toBe(2);
    expect(chapters.find((c) => c.id === "c399")?.chapterNumber).toBe(400);
  });

  it("moves every chapter-scoped document with its chapter", async () => {
    book(5);
    const order = [
      { chapterId: "c1", chapterNumber: 1 },
      { chapterId: "c3", chapterNumber: 2 },
      { chapterId: "c2", chapterNumber: 3 },
      { chapterId: "c4", chapterNumber: 4 },
      { chapterId: "c5", chapterNumber: 5 },
    ];

    await renumberChaptersWith(fakeClient() as never, "b1", order);

    expect(collisions).toEqual([]);
    const at = (id: string) => documents.find((d) => d.id === id)?.chapterNumber;
    expect(at("content-c3")).toBe(2);
    expect(at("brief-c3")).toBe(2);
    expect(at("content-c2")).toBe(3);
    expect(at("content-c5")).toBe(5);
  });

  it("parks and places chapters the caller did not name, after the named ones", async () => {
    // A merge's ordering omits the absorbed chapter once it is deleted; an
    // undo's stored ordering can omit a chapter added since. Nothing unparked.
    book(4);
    const order = [
      { chapterId: "c2", chapterNumber: 1 },
      { chapterId: "c1", chapterNumber: 2 },
    ];

    await renumberChaptersWith(fakeClient() as never, "b1", order);

    expect(collisions).toEqual([]);
    const at = (id: string) => chapters.find((c) => c.id === id)?.chapterNumber;
    expect([at("c2"), at("c1"), at("c3"), at("c4")]).toEqual([1, 2, 3, 4]);
  });

  it("leaves documents that belong to no chapter where they are", async () => {
    book(3);
    // A document parked far above the book (a split's second half before its
    // chapter exists) must not be swept into anyone's number.
    documents.push({ id: "parked", bookId: "b1", type: "CHAPTER_CONTENT", chapterNumber: TEMP_OFFSET * 3 });
    const order = [
      { chapterId: "c2", chapterNumber: 1 },
      { chapterId: "c1", chapterNumber: 2 },
      { chapterId: "c3", chapterNumber: 3 },
    ];

    await renumberChaptersWith(fakeClient() as never, "b1", order);

    expect(documents.find((d) => d.id === "parked")?.chapterNumber).toBe(TEMP_OFFSET * 3);
    expect(collisions).toEqual([]);
  });

  it("does nothing for an empty ordering", async () => {
    book(3);
    const client = fakeClient();
    await renumberChaptersWith(client as never, "b1", []);
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("renumberChapters — its own transaction", () => {
  it("runs inside an interactive transaction with more than the 5 s default", async () => {
    book(3);
    const client = fakeClient();
    h.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(client));

    await renumberChapters("b1", [
      { chapterId: "c3", chapterNumber: 1 },
      { chapterId: "c1", chapterNumber: 2 },
      { chapterId: "c2", chapterNumber: 3 },
    ]);

    expect(h.$transaction).toHaveBeenCalledTimes(1);
    const [fn, options] = h.$transaction.mock.calls[0];
    expect(typeof fn).toBe("function");
    expect(options.timeout).toBeGreaterThan(5000);
    expect(chapters.find((c) => c.id === "c3")?.chapterNumber).toBe(1);
  });
});
