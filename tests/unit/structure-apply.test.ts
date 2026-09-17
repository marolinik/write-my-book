import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O12 phase 2 — the apply engine. Accepting a proposal is the only thing in the
 * feature that touches the manuscript, so the rules under test are:
 *
 *  - a move is re-planned against the CURRENT book at accept time (the writer
 *    may have edited since the proposal was written),
 *  - prose is never destroyed: merge keeps both halves, split keeps both halves,
 *    and everything that changed is captured in previousState for undo,
 *  - a move that cannot be executed fails loudly and writes nothing.
 */

const h = vi.hoisted(() => ({
  db: {
    structureMove: { findFirst: vi.fn(), update: vi.fn() },
    chapter: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  renumberChapters: vi.fn(),
  reconcileBookCounters: vi.fn(),
  docs: {
    findByType: vi.fn(),
    list: vi.fn(),
    read: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/chapters/renumber", () => ({
  renumberChapters: (...args: unknown[]) => h.renumberChapters(...args),
}));
vi.mock("@/lib/books/book-counters", () => ({
  reconcileBookCounters: (...args: unknown[]) => h.reconcileBookCounters(...args),
}));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.docs.findByType;
    list = h.docs.list;
    read = h.docs.read;
    update = h.docs.update;
    create = h.docs.create;
    delete = h.docs.delete;
  },
}));

import { applyStructureMove, undoStructureMove } from "@/lib/structure/apply-move";

const chapters = [
  { id: "c1", chapterNumber: 1, title: "Zakletva", wordCount: 2100, actNumber: 1 },
  { id: "c2", chapterNumber: 2, title: "Pismo", wordCount: 1800, actNumber: 1 },
  { id: "c3", chapterNumber: 3, title: "Put", wordCount: 900, actNumber: 1 },
  { id: "c4", chapterNumber: 4, title: "Kuća", wordCount: 2400, actNumber: 2 },
];

const CH3 = "Treći tekst.\n\nDrugi pasus.\n\nKad je pao mrak, sve je utihnulo.\n\nKraj.";

function move(kind: string, payload: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: "m1",
    bookId: "b1",
    kind,
    payload: JSON.stringify(payload),
    status: "pending",
    previousState: null,
    reason: "razlog",
    ...extra,
  };
}

const opts = { bookId: "b1", userId: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findMany.mockResolvedValue(chapters);
  h.db.structureMove.update.mockImplementation(async (a: unknown) => a);
  h.db.chapter.create.mockResolvedValue({ id: "new1", chapterNumber: 4 });
  h.db.chapter.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === "new1"
      ? { id: "new1", chapterNumber: 4, actNumber: 1 }
      : chapters.find((c) => c.id === where.id) ?? null
  );
  h.renumberChapters.mockResolvedValue(undefined);
  h.reconcileBookCounters.mockResolvedValue({ chapterCount: 4, wordCount: 7200 });
  h.docs.findByType.mockImplementation(async (_t: string, n: number) => ({
    id: `doc-${n}`,
  }));
  h.docs.read.mockImplementation(async (id: string) => ({
    document: { id },
    content: id === "doc-3" ? CH3 : `Tekst ${id}.`,
  }));
  h.docs.create.mockResolvedValue({ id: "doc-new" });
  h.docs.list.mockImplementation(async (f: { chapterNumber?: number }) => [
    { id: `doc-${f?.chapterNumber}`, type: "CHAPTER_CONTENT" },
  ]);
});

describe("applyStructureMove — reorder", () => {
  it("renumbers through the shared engine and records the move as applied", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("reorder", { kind: "reorder", chapterNumber: 4, targetPosition: 2 })
    );

    const res = await applyStructureMove("m1", opts);
    expect(res.ok).toBe(true);

    const [bookId, ordering] = h.renumberChapters.mock.calls[0];
    expect(bookId).toBe("b1");
    expect(ordering).toEqual([
      { chapterId: "c1", chapterNumber: 1 },
      { chapterId: "c4", chapterNumber: 2 },
      { chapterId: "c2", chapterNumber: 3 },
      { chapterId: "c3", chapterNumber: 4 },
    ]);

    const data = h.db.structureMove.update.mock.calls.at(-1)?.[0].data;
    expect(data.status).toBe("applied");
    expect(data.appliedAt).toBeInstanceOf(Date);
    // Undo needs the ordering as it stood BEFORE the move.
    expect(JSON.parse(data.previousState).ordering).toEqual([
      { chapterId: "c1", chapterNumber: 1 },
      { chapterId: "c2", chapterNumber: 2 },
      { chapterId: "c3", chapterNumber: 3 },
      { chapterId: "c4", chapterNumber: 4 },
    ]);
  });

  it("refuses a move that is not pending and changes nothing", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("reorder", { kind: "reorder", chapterNumber: 4, targetPosition: 2 }, { status: "applied" })
    );
    const res = await applyStructureMove("m1", opts);
    expect(res).toMatchObject({ ok: false, error: { code: "not_pending" } });
    expect(h.renumberChapters).not.toHaveBeenCalled();
  });

  it("fails the move when the book changed under it", async () => {
    // The writer deleted chapter 4 after the proposal was written.
    h.db.chapter.findMany.mockResolvedValue(chapters.slice(0, 3));
    h.db.structureMove.findFirst.mockResolvedValue(
      move("reorder", { kind: "reorder", chapterNumber: 4, targetPosition: 2 })
    );

    const res = await applyStructureMove("m1", opts);
    expect(res).toMatchObject({ ok: false, error: { code: "chapter_not_found" } });
    expect(h.renumberChapters).not.toHaveBeenCalled();
    expect(h.db.structureMove.update.mock.calls.at(-1)?.[0].data.status).toBe("failed");
  });
});

describe("applyStructureMove — merge", () => {
  beforeEach(() => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("merge", { kind: "merge", chapterNumbers: [2, 3], title: "Pismo i put" })
    );
  });

  it("writes both bodies into the survivor and deletes the absorbed chapter", async () => {
    const res = await applyStructureMove("m1", opts);
    expect(res.ok).toBe(true);

    const [docId, content] = h.docs.update.mock.calls[0];
    expect(docId).toBe("doc-2");
    expect(content).toContain("Tekst doc-2.");
    expect(content).toContain("Kad je pao mrak");
    expect(content).toContain("* * *");

    expect(h.db.chapter.delete).toHaveBeenCalledWith({ where: { id: "c3" } });
    expect(h.reconcileBookCounters).toHaveBeenCalledWith("b1");
  });

  it("keeps the absorbed chapter's prose in previousState so undo can restore it", async () => {
    await applyStructureMove("m1", opts);
    const prev = JSON.parse(h.db.structureMove.update.mock.calls.at(-1)?.[0].data.previousState);
    const absorbed = prev.chapters.find((c: { chapterNumber: number }) => c.chapterNumber === 3);
    expect(absorbed).toMatchObject({ chapterNumber: 3, title: "Put", actNumber: 1 });
    expect(absorbed.content).toContain("Kad je pao mrak");
    expect(prev.survivorContent).toBe("Tekst doc-2.");
  });

  it("closes the numbering gap left by the absorbed chapter", async () => {
    await applyStructureMove("m1", opts);
    const [, ordering] = h.renumberChapters.mock.calls[0];
    expect(ordering).toEqual([
      { chapterId: "c1", chapterNumber: 1 },
      { chapterId: "c2", chapterNumber: 2 },
      { chapterId: "c4", chapterNumber: 3 },
    ]);
  });
});

describe("applyStructureMove — split", () => {
  beforeEach(() => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("split", {
        kind: "split",
        chapterNumber: 3,
        anchorQuote: "Kad je pao mrak",
        secondTitle: "Mrak",
      })
    );
  });

  it("shifts the tail up, keeps the first half, and creates the second", async () => {
    const res = await applyStructureMove("m1", opts);
    expect(res.ok).toBe(true);

    const [, ordering] = h.renumberChapters.mock.calls[0];
    expect(ordering).toContainEqual({ chapterId: "c4", chapterNumber: 5 });

    const [docId, firstHalf] = h.docs.update.mock.calls[0];
    expect(docId).toBe("doc-3");
    expect(firstHalf).toContain("Drugi pasus.");
    expect(firstHalf).not.toContain("Kad je pao mrak");

    const created = h.db.chapter.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ bookId: "b1", chapterNumber: 4, actNumber: 1, title: "Mrak" });

    const [type, secondHalf, , chapterNumber] = h.docs.create.mock.calls[0];
    expect(type).toBe("CHAPTER_CONTENT");
    expect(secondHalf.startsWith("Kad je pao mrak")).toBe(true);
    expect(secondHalf).toContain("Kraj.");
    expect(chapterNumber).toBe(4);
  });

  it("fails without writing when the anchor is not in the real prose", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("split", { kind: "split", chapterNumber: 3, anchorQuote: "nema ovoga" })
    );
    const res = await applyStructureMove("m1", opts);
    expect(res).toMatchObject({ ok: false, error: { code: "anchor_not_found" } });
    expect(h.docs.update).not.toHaveBeenCalled();
    expect(h.db.chapter.create).not.toHaveBeenCalled();
    expect(h.renumberChapters).not.toHaveBeenCalled();
    expect(h.db.structureMove.update.mock.calls.at(-1)?.[0].data.status).toBe("failed");
  });
});

describe("undoStructureMove", () => {
  it("puts a reorder back the way it was", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("reorder", { kind: "reorder", chapterNumber: 4, targetPosition: 2 }, {
        status: "applied",
        previousState: JSON.stringify({
          ordering: [
            { chapterId: "c1", chapterNumber: 1 },
            { chapterId: "c2", chapterNumber: 2 },
            { chapterId: "c3", chapterNumber: 3 },
            { chapterId: "c4", chapterNumber: 4 },
          ],
        }),
      })
    );

    const res = await undoStructureMove("m1", opts);
    expect(res.ok).toBe(true);
    const [, ordering] = h.renumberChapters.mock.calls[0];
    expect(ordering).toEqual([
      { chapterId: "c1", chapterNumber: 1 },
      { chapterId: "c2", chapterNumber: 2 },
      { chapterId: "c3", chapterNumber: 3 },
      { chapterId: "c4", chapterNumber: 4 },
    ]);
    expect(h.db.structureMove.update.mock.calls.at(-1)?.[0].data.status).toBe("undone");
  });

  it("restores a merged-away chapter with its prose", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("merge", { kind: "merge", chapterNumbers: [2, 3] }, {
        status: "applied",
        previousState: JSON.stringify({
          ordering: [
            { chapterId: "c1", chapterNumber: 1 },
            { chapterId: "c2", chapterNumber: 2 },
          ],
          survivorChapterId: "c2",
          survivorContent: "Tekst doc-2.",
          chapters: [
            { chapterId: "c2", chapterNumber: 2, title: "Pismo", actNumber: 1, status: "drafted", wordCount: 1800, content: "Tekst doc-2." },
            { chapterId: "c3", chapterNumber: 3, title: "Put", actNumber: 1, status: "drafted", wordCount: 900, content: CH3 },
          ],
        }),
      })
    );

    const res = await undoStructureMove("m1", opts);
    expect(res.ok).toBe(true);

    const recreated = h.db.chapter.create.mock.calls[0][0].data;
    expect(recreated).toMatchObject({ bookId: "b1", chapterNumber: 3, title: "Put", actNumber: 1 });
    const [, restoredContent] = h.docs.create.mock.calls[0];
    expect(restoredContent).toBe(CH3);
    // The survivor goes back to its pre-merge text.
    expect(h.docs.update).toHaveBeenCalledWith(
      "doc-2",
      "Tekst doc-2.",
      undefined,
      expect.anything(),
      expect.anything()
    );
  });

  it("removes the chapter a split created and restores the whole chapter", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("split", { kind: "split", chapterNumber: 3, anchorQuote: "Kad je pao mrak" }, {
        status: "applied",
        previousState: JSON.stringify({
          ordering: [
            { chapterId: "c1", chapterNumber: 1 },
            { chapterId: "c2", chapterNumber: 2 },
            { chapterId: "c3", chapterNumber: 3 },
            { chapterId: "c4", chapterNumber: 4 },
          ],
          sourceChapterId: "c3",
          sourceContent: CH3,
          createdChapterId: "new1",
        }),
      })
    );

    const res = await undoStructureMove("m1", opts);
    expect(res.ok).toBe(true);
    expect(h.db.chapter.delete).toHaveBeenCalledWith({ where: { id: "new1" } });
    expect(h.docs.update.mock.calls[0][1]).toBe(CH3);
  });

  it("refuses to undo a move that was never applied", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("reorder", { kind: "reorder", chapterNumber: 4, targetPosition: 2 })
    );
    const res = await undoStructureMove("m1", opts);
    expect(res).toMatchObject({ ok: false, error: { code: "not_applied" } });
    expect(h.renumberChapters).not.toHaveBeenCalled();
  });
});
