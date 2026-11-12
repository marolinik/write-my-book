// P2-40: book-level documents (chapterNumber null) had no uniqueness guard,
// so two concurrent creates left two SYNOPSIS rows: agents read the oldest,
// the report tab the newest. db-guards.sql now holds a partial unique index
// for the single-instance types; create() inserts the row and its first
// version together and, when the index refuses a racing second create, saves
// onto the existing row instead of failing.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => {
  const tx = { document: { create: vi.fn() }, documentVersion: { create: vi.fn() } };
  return {
    tx,
    db: {
      document: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn(async () => 0) },
      documentVersion: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    storage: { write: vi.fn(), exists: vi.fn(), list: vi.fn() },
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/storage", () => ({
  getBookStorage: () => h.storage,
  getSeriesStorage: () => h.storage,
}));

import { DocumentService } from "@/lib/documents/document-service";

beforeEach(() => {
  vi.clearAllMocks();
  h.storage.write.mockResolvedValue(undefined);
  h.storage.exists.mockResolvedValue(false);
  h.storage.list.mockResolvedValue([]);
  h.db.document.findFirst.mockResolvedValue(null);
  h.tx.document.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "d1", ...data }));
  h.tx.documentVersion.create.mockResolvedValue({});
});

describe("DocumentService.create", () => {
  it("inserts the document and its first version in one transaction", async () => {
    const svc = new DocumentService("u1", "b1");
    await svc.create("SYNOPSIS" as never, "A short synopsis.");
    expect(h.db.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.document.create).toHaveBeenCalled();
    expect(h.tx.documentVersion.create).toHaveBeenCalled();
    expect(h.db.document.create).not.toHaveBeenCalled();
  });

  it("a racing second create of a single-instance type saves onto the existing row", async () => {
    const svc = new DocumentService("u1", "b1");
    h.tx.document.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    // findByType after the conflict sees the row the other create wrote.
    h.db.document.findFirst.mockResolvedValue({ id: "winner", type: "SYNOPSIS", currentVersion: 1 });
    const update = vi.spyOn(svc, "update").mockResolvedValue({ document: { id: "winner" }, version: { version: 2 } } as never);
    const doc = await svc.create("SYNOPSIS" as never, "A second synopsis.", "Synopsis", undefined, undefined, "agent");
    expect(update).toHaveBeenCalledWith("winner", "A second synopsis.", "Synopsis", expect.any(String), "agent");
    expect(doc.id).toBe("winner");
  });
});

describe("db-guards.sql", () => {
  it("holds the partial unique index for the single-instance book-level types (D17)", () => {
    const sql = readFileSync("scripts/db-guards.sql", "utf8");
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS documents_book_level_single/);
    for (const t of ["SYNOPSIS", "STORY_BIBLE", "BOOK_PLAN", "FINGERPRINT"]) expect(sql).toContain(`'${t}'`);
    expect(sql).toMatch(/chapter_number IS NULL/);
  });

  it("the repair script collapses book-level duplicates of those types before the index is built", () => {
    const script = readFileSync("scripts/repair-duplicate-documents.ts", "utf8");
    expect(script).toMatch(/SINGLE_BOOK_LEVEL_TYPES/);
  });
});
