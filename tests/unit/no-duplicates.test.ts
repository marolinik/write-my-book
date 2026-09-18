/**
 * Two kinds of duplicate cost the owner his manuscript on 2026-09-18, and both
 * are prevented here rather than apologised for later.
 *
 * 1. A DUPLICATE STORAGE KEY. A chapter-scoped key is derived from the chapter
 *    number, and chapter numbers are recycled: splitting chapter 24 creates a
 *    new chapter 25 while the old chapter 25 — now 26 — still points at
 *    `chapter-25.md`. The new document was written straight over the other
 *    chapter's prose. Keys are opaque pointers that never move after creation,
 *    so a newcomer must be handed one nobody holds.
 *
 * 2. A DUPLICATE PROPOSAL. Running `restructure` twice filed the same move
 *    again, and accepting both applied it twice: `merge [9, 10]` ran once on
 *    9+10 and again on the survivor plus whatever had shifted into 10 — which
 *    swallowed a chapter the editor had explicitly declined to touch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    document: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    documentVersion: { create: vi.fn() },
    structureMove: { create: vi.fn(), findFirst: vi.fn() },
    chapter: { findMany: vi.fn() },
  },
  storage: { write: vi.fn(), read: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/storage", () => ({
  getBookStorage: () => h.storage,
  getSeriesStorage: () => h.storage,
}));

import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";

describe("a new document never takes a key another document holds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.db.document.create.mockImplementation(async ({ data }: { data: { storageKey: string } }) => ({
      id: "doc-new",
      storageKey: data.storageKey,
    }));
    h.db.documentVersion.create.mockResolvedValue({});
    h.storage.write.mockResolvedValue(undefined);
  });

  it("uses the canonical key when it is free", async () => {
    h.db.document.count.mockResolvedValue(0);

    const docs = new DocumentService("u1", "b1");
    await docs.create(DocumentType.CHAPTER_CONTENT, "Tekst.", "Poglavlje", 25, 1);

    const written = h.storage.write.mock.calls[0][0];
    expect(written).toBe("manuscript/act-1/chapter-25.md");
  });

  it("picks a free key when the canonical one is taken", async () => {
    // chapter-25.md already belongs to the chapter that used to be number 25.
    h.db.document.count.mockImplementation(async ({ where }: { where: { storageKey: string } }) =>
      where.storageKey === "manuscript/act-1/chapter-25.md" ? 1 : 0
    );

    const docs = new DocumentService("u1", "b1");
    await docs.create(DocumentType.CHAPTER_CONTENT, "Novi tekst.", "Zapisnik", 25, 1);

    const written = h.storage.write.mock.calls[0][0];
    expect(written).not.toBe("manuscript/act-1/chapter-25.md");
    expect(written).toMatch(/^manuscript\/act-1\/chapter-25-\d+\.md$/);

    const row = h.db.document.create.mock.calls[0][0].data;
    expect(row.storageKey).toBe(written);
  });

  it("keeps looking while the alternatives are taken too", async () => {
    const held = new Set([
      "manuscript/act-1/chapter-25.md",
      "manuscript/act-1/chapter-25-2.md",
    ]);
    h.db.document.count.mockImplementation(async ({ where }: { where: { storageKey: string } }) =>
      held.has(where.storageKey) ? 1 : 0
    );

    const docs = new DocumentService("u1", "b1");
    await docs.create(DocumentType.CHAPTER_CONTENT, "Tekst.", "Poglavlje", 25, 1);

    expect(h.storage.write.mock.calls[0][0]).toBe("manuscript/act-1/chapter-25-3.md");
  });
});

describe("a structural proposal is never filed twice", () => {
  const chapters = [
    { id: "c9", chapterNumber: 9, title: "Od reči do reči", wordCount: 1104, actNumber: 1 },
    { id: "c10", chapterNumber: 10, title: "Utorkom", wordCount: 1491, actNumber: 1 },
    { id: "c11", chapterNumber: 11, title: "Košare", wordCount: 593, actNumber: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    h.db.chapter.findMany.mockResolvedValue(chapters);
    h.db.structureMove.create.mockResolvedValue({ id: "m-new" });
  });

  async function propose() {
    const { executeTool } = await import("@/lib/agents/tools");
    return executeTool(
      "ProposeStructureMove",
      { bookId: "b1", userId: "u1", sessionId: "s1", language: "sr" } as never,
      {
        kind: "merge",
        chapterNumbers: [9, 10],
        reason: "Oba su ispod pola medijane i pokrivaju jednu scenu.",
      }
    );
  }

  it("files a move the book has not seen", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(null);

    const out = await propose();
    expect(h.db.structureMove.create).toHaveBeenCalledTimes(1);
    expect(out).toContain("m-new");
  });

  it("refuses an identical move that is still waiting for a decision", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({ id: "m-old", status: "pending" });

    const out = await propose();
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/already/i);
    expect(out).toContain("m-old");
  });

  it("refuses an identical move the writer has already applied", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({ id: "m-old", status: "applied" });

    const out = await propose();
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/already/i);
  });
});
