import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P7-S20 (UAT 2026-09-25): deleting a book left two things behind.
 *  - Its stored files: only the front cover was removed, so the manuscript,
 *    every document version and the back cover stayed in S3/MinIO although
 *    the dialog promises "all related data".
 *  - Its writer rules: WriterMemory.book was onDelete SetNull, and a null
 *    bookId MEANS "global preference", so the deleted book's rules started
 *    steering every other book's agents.
 * Both must go with the book. Storage cleanup is best-effort: a storage fault
 * is logged and never turns a completed delete into an error.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), delete: vi.fn() },
    writerMemory: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getBookStorage: vi.fn(),
  deleteBookChunks: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/vector", () => ({
  deleteBookChunks: (...a: unknown[]) => h.deleteBookChunks(...(a as [])),
}));
vi.mock("@/lib/storage", () => ({
  getBookStorage: (...a: unknown[]) => h.getBookStorage(...a),
}));

import { DELETE as bookDELETE } from "@/app/api/books/[id]/route";

const BOOK = "af343d91-89d4-4017-ae38-2dd5857b0361";
const STORED = [
  "cover/9bcad004.png",
  "back-cover/8a84be6b.png",
  "manuscript/act-1/chapter-01.md",
  ".versions/9bcad004/v1.md",
  ".versions/9bcad004/v2.md",
];

function fakeStorage(keys: string[], failOn: string[] = []) {
  const deleted: string[] = [];
  return {
    deleted,
    list: vi.fn(async () => [...keys]),
    delete: vi.fn(async (k: string) => {
      if (failOn.includes(k)) throw new Error("minio down");
      deleted.push(k);
    }),
  };
}

const call = () =>
  bookDELETE(new NextRequest(`http://t/api/books/${BOOK}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: BOOK }),
  });

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: BOOK, userId: "u1", coverUrl: STORED[0] });
  h.db.writerMemory.deleteMany.mockImplementation((args: unknown) => ({ op: "memories", args }));
  h.db.book.delete.mockImplementation((args: unknown) => ({ op: "book", args }));
  h.db.$transaction.mockResolvedValue([{ count: 2 }, { id: BOOK }]);
});

describe("DELETE /api/books/:id — the book's rules go with it", () => {
  it("deletes the book-scoped writer memories in the same transaction as the book", async () => {
    h.getBookStorage.mockReturnValue(fakeStorage([]));
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.db.writerMemory.deleteMany).toHaveBeenCalledWith({ where: { bookId: BOOK } });
    const ops = h.db.$transaction.mock.calls[0][0] as { op: string }[];
    expect(ops.map((o) => o.op)).toEqual(["memories", "book"]);
  });

  it("the schema no longer turns a deleted book's rules into global ones", () => {
    const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf-8");
    const model = schema.match(/model WriterMemory \{([\s\S]*?)\n\}/);
    expect(model).not.toBeNull();
    const bookRelation = model![1].split("\n").find((l) => /^\s*book\s/.test(l));
    expect(bookRelation).toMatch(/onDelete:\s*Cascade/);
  });
});

describe("DELETE /api/books/:id — the book's stored files go with it", () => {
  it("removes every object under the book's prefix, not just the front cover", async () => {
    const storage = fakeStorage(STORED);
    h.getBookStorage.mockReturnValue(storage);
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.getBookStorage).toHaveBeenCalledWith("u1", BOOK);
    expect(storage.deleted.sort()).toEqual([...STORED].sort());
  });

  it("purges storage only after the rows are gone", async () => {
    const order: string[] = [];
    h.db.$transaction.mockImplementation(async () => {
      order.push("db");
      return [];
    });
    const storage = fakeStorage(["manuscript/a.md"]);
    storage.list.mockImplementation(async () => {
      order.push("storage");
      return ["manuscript/a.md"];
    });
    h.getBookStorage.mockReturnValue(storage);
    await call();
    expect(order).toEqual(["db", "storage"]);
  });

  it("a storage fault is logged, and the delete still succeeds", async () => {
    const storage = fakeStorage(STORED, [STORED[2]]);
    h.getBookStorage.mockReturnValue(storage);
    const res = await call();
    expect(res.status).toBe(200);
    // The others were still removed.
    expect(storage.deleted).toHaveLength(STORED.length - 1);
    expect(errors).toHaveBeenCalled();
  });

  it("an unconfigured store (getBookStorage throws) does not fail the delete", async () => {
    h.getBookStorage.mockImplementation(() => {
      throw new Error("S3 credentials not configured");
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(errors).toHaveBeenCalled();
  });

  it("a book the caller does not own: 404, nothing deleted anywhere", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.getBookStorage).not.toHaveBeenCalled();
  });
});
