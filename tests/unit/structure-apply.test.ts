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
    // The apply transaction runs on the same fake: rollback semantics are what
    // structure-apply-atomic.test.ts is for.
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    structureMove: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    chapter: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    document: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
  },
  renumberChapters: vi.fn(),
  renumberChaptersWith: vi.fn(),
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
// The renumber is a spy; the lock, the book-changed check and the constants
// (undo derives its parking range from TEMP_OFFSET) are the real module's.
vi.mock("@/lib/chapters/renumber", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chapters/renumber")>()),
  renumberChapters: (...args: unknown[]) => h.renumberChapters(...args),
  renumberChaptersWith: (...args: unknown[]) => h.renumberChaptersWith(...args),
}));
vi.mock("@/lib/books/book-counters", () => ({
  reconcileBookCounters: (...args: unknown[]) => h.reconcileBookCounters(...args),
}));
vi.mock("@/lib/storage", () => ({ getBookStorage: () => ({ delete: vi.fn() }) }));
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

/** Every conditional status write made to the move, in order. */
const moveWrites = () =>
  h.db.structureMove.updateMany.mock.calls.map(
    (call) => call[0] as { where: Record<string, unknown>; data: Record<string, unknown> }
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findMany.mockResolvedValue(chapters);
  h.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(h.db));
  h.db.$executeRaw.mockResolvedValue(1);
  h.db.structureMove.update.mockImplementation(async (a: unknown) => a);
  h.db.structureMove.updateMany.mockResolvedValue({ count: 1 });
  h.db.chapter.deleteMany.mockResolvedValue({ count: 1 });
  h.db.document.findMany.mockImplementation(
    async ({ where }: { where: { chapterNumber: { in: number[] } } }) =>
      where.chapterNumber.in.map((n) => ({ id: `doc-${n}`, storageKey: `k-${n}`, versions: [] }))
  );
  h.db.document.findFirst.mockResolvedValue(null);
  h.db.document.deleteMany.mockResolvedValue({ count: 1 });
  h.db.document.update.mockResolvedValue({});
  h.renumberChaptersWith.mockResolvedValue(undefined);
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

    const [, bookId, ordering] = h.renumberChaptersWith.mock.calls[0];
    expect(bookId).toBe("b1");
    expect(ordering).toEqual([
      { chapterId: "c1", chapterNumber: 1 },
      { chapterId: "c4", chapterNumber: 2 },
      { chapterId: "c2", chapterNumber: 3 },
      { chapterId: "c3", chapterNumber: 4 },
    ]);

    // Applied only if still pending, in the same transaction as the renumber.
    const commit = h.db.structureMove.updateMany.mock.calls.at(-1)?.[0];
    expect(commit.where).toMatchObject({ id: "m1", status: "pending" });
    const data = commit.data;
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
    expect(h.renumberChaptersWith).not.toHaveBeenCalled();
  });

  it("fails the move when the book changed under it", async () => {
    // The writer deleted chapter 4 after the proposal was written.
    h.db.chapter.findMany.mockResolvedValue(chapters.slice(0, 3));
    h.db.structureMove.findFirst.mockResolvedValue(
      move("reorder", { kind: "reorder", chapterNumber: 4, targetPosition: 2 })
    );

    const res = await applyStructureMove("m1", opts);
    expect(res).toMatchObject({ ok: false, error: { code: "chapter_not_found" } });
    expect(h.renumberChaptersWith).not.toHaveBeenCalled();
    expect(h.db.structureMove.updateMany.mock.calls.at(-1)?.[0].data.status).toBe("failed");
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

    expect(h.db.chapter.deleteMany).toHaveBeenCalledWith({
      where: { bookId: "b1", id: { in: ["c3"] } },
    });
    // Recounted on the apply's own transaction, so it commits with the rows.
    expect(h.reconcileBookCounters).toHaveBeenCalledWith("b1", h.db);
  });

  it("keeps the absorbed chapter's prose in previousState so undo can restore it", async () => {
    await applyStructureMove("m1", opts);
    const prev = JSON.parse(h.db.structureMove.updateMany.mock.calls.at(-1)?.[0].data.previousState);
    const absorbed = prev.chapters.find((c: { chapterNumber: number }) => c.chapterNumber === 3);
    expect(absorbed).toMatchObject({ chapterNumber: 3, title: "Put", actNumber: 1 });
    expect(absorbed.content).toContain("Kad je pao mrak");
    expect(prev.survivorContent).toBe("Tekst doc-2.");
  });

  it("closes the numbering gap left by the absorbed chapter", async () => {
    await applyStructureMove("m1", opts);
    const [, , ordering] = h.renumberChaptersWith.mock.calls[0];
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

    const [, , ordering] = h.renumberChaptersWith.mock.calls[0];
    expect(ordering).toContainEqual({ chapterId: "c4", chapterNumber: 5 });

    const [docId, firstHalf] = h.docs.update.mock.calls[0];
    expect(docId).toBe("doc-3");
    expect(firstHalf).toContain("Drugi pasus.");
    expect(firstHalf).not.toContain("Kad je pao mrak");

    const created = h.db.chapter.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ bookId: "b1", chapterNumber: 4, actNumber: 1, title: "Mrak" });

    // Filed parked first (chapter 4's number is still taken), then moved to 4
    // inside the transaction, after the renumber has freed it.
    const [type, secondHalf, , parkedAt] = h.docs.create.mock.calls[0];
    expect(type).toBe("CHAPTER_CONTENT");
    expect(secondHalf.startsWith("Kad je pao mrak")).toBe(true);
    expect(secondHalf).toContain("Kraj.");
    expect(parkedAt).toBeGreaterThanOrEqual(30000);
    expect(h.db.document.update).toHaveBeenCalledWith({
      where: { id: "doc-new" },
      data: { chapterNumber: 4 },
    });
  });

  it("fails without writing when the anchor is not in the real prose", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("split", { kind: "split", chapterNumber: 3, anchorQuote: "nema ovoga" })
    );
    const res = await applyStructureMove("m1", opts);
    expect(res).toMatchObject({ ok: false, error: { code: "anchor_not_found" } });
    expect(h.docs.update).not.toHaveBeenCalled();
    expect(h.db.chapter.create).not.toHaveBeenCalled();
    expect(h.renumberChaptersWith).not.toHaveBeenCalled();
    expect(h.db.structureMove.updateMany.mock.calls.at(-1)?.[0].data.status).toBe("failed");
  });
});

describe("undoStructureMove — restoring into occupied numbers", () => {
  /**
   * The live failure (S3-6). Merging 9+10 moved every chapter below up by one,
   * so chapter 10 was taken by the time the writer pressed Undo. The engine
   * re-created the absorbed chapter at its ORIGINAL number and Postgres threw
   * `Unique constraint failed on the fields: (book_id, chapter_number)` — with
   * the survivor's prose already restored, which left the book a chapter short
   * and the move still marked applied.
   *
   * Absorbed chapters must come back above the last live chapter, where nothing
   * can collide, and reach their real numbers through the same renumber pass
   * the rest of the engine uses.
   */
  const afterMerge = [
    { id: "c1", chapterNumber: 1, title: "Zakletva", wordCount: 2100, actNumber: 1 },
    { id: "c2", chapterNumber: 2, title: "Pismo+Put", wordCount: 2700, actNumber: 1 },
    { id: "c4", chapterNumber: 3, title: "Kuća", wordCount: 2400, actNumber: 2 },
  ];

  function mergedMove() {
    return move("merge", { kind: "merge", chapterNumbers: [2, 3] }, {
      status: "applied",
      previousState: JSON.stringify({
        ordering: [
          { chapterId: "c1", chapterNumber: 1 },
          { chapterId: "c2", chapterNumber: 2 },
          { chapterId: "c3", chapterNumber: 3 },
          { chapterId: "c4", chapterNumber: 4 },
        ],
        survivorChapterId: "c2",
        survivorContent: "Tekst doc-2.",
        chapters: [
          { chapterId: "c2", chapterNumber: 2, title: "Pismo", actNumber: 1, status: "drafted", wordCount: 1800, content: "Tekst doc-2." },
          { chapterId: "c3", chapterNumber: 3, title: "Put", actNumber: 1, status: "drafted", wordCount: 900, content: CH3 },
        ],
      }),
    });
  }

  beforeEach(() => {
    h.db.structureMove.findFirst.mockResolvedValue(mergedMove());

    // The restored row has to become visible to the queries that run after it,
    // or existingOnly() drops it from the ordering and the assertion passes for
    // the wrong reason.
    const created: Array<{ id: string; chapterNumber: number }> = [];
    h.db.chapter.findMany.mockImplementation(async () => [...afterMerge, ...created]);
    h.db.chapter.create.mockImplementation(
      async ({ data }: { data: { chapterNumber: number } }) => {
        const row = { id: "restored-c3", chapterNumber: data.chapterNumber };
        created.push(row);
        return row;
      }
    );
  });

  it("parks the restored chapter past the last live number instead of colliding", async () => {
    const res = await undoStructureMove("m1", opts);
    expect(res.ok).toBe(true);
    // Claimed from `applied` before any work, so a second undo cannot run too.
    expect(moveWrites()[0]).toMatchObject({
      where: { id: "m1", bookId: "b1", status: "applied" },
      data: { status: "undone" },
    });
    // Step 0: "accept all, then undo 5 of 8" was invisible without a time.
    const done = moveWrites().at(-1)!;
    expect(done.where).toMatchObject({ id: "m1", status: "undone" });
    expect(done.data.undoneAt).toBeInstanceOf(Date);

    const taken = afterMerge.map((c) => c.chapterNumber);
    const created = h.db.chapter.create.mock.calls[0][0].data;
    expect(taken).not.toContain(created.chapterNumber);
    expect(created.chapterNumber).toBeGreaterThan(Math.max(...taken));
  });

  it("files the restored chapter's document at the same parked number", async () => {
    await undoStructureMove("m1", opts);

    const created = h.db.chapter.create.mock.calls[0][0].data;
    const [, , , docChapterNumber] = h.docs.create.mock.calls[0];
    expect(docChapterNumber).toBe(created.chapterNumber);
  });

  it("renumbers the restored chapter back into its original slot", async () => {
    await undoStructureMove("m1", opts);

    // The re-created row has a new id, so the stored ordering — which still
    // names the dead one — has to be rewritten before it is any use.
    const [, ordering] = h.renumberChapters.mock.calls[0];
    expect(ordering).toContainEqual({ chapterId: "restored-c3", chapterNumber: 3 });
    expect(ordering.map((o: { chapterId: string }) => o.chapterId)).not.toContain("c3");
  });

  it("leaves the move applied when the restore cannot finish", async () => {
    h.db.chapter.create.mockRejectedValue(new Error("Unique constraint failed"));

    const res = await undoStructureMove("m1", opts);
    expect(res.ok).toBe(false);
    // The claim is handed back, so the writer can press Undo again.
    expect(moveWrites().at(-1)).toMatchObject({
      where: { id: "m1", status: "undone" },
      data: { status: "applied" },
    });
    expect(moveWrites().some((w) => w.data.undoneAt instanceof Date)).toBe(false);
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
    expect(moveWrites()[0].data.status).toBe("undone");
    expect(moveWrites().at(-1)?.data.undoneAt).toBeInstanceOf(Date);
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
    expect(recreated).toMatchObject({ bookId: "b1", title: "Put", actNumber: 1 });
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

  it("does nothing when another undo claimed the move first", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("reorder", { kind: "reorder", chapterNumber: 4, targetPosition: 2 }, {
        status: "applied",
        previousState: JSON.stringify({ ordering: [{ chapterId: "c1", chapterNumber: 1 }] }),
      })
    );
    h.db.structureMove.updateMany.mockResolvedValue({ count: 0 });

    const res = await undoStructureMove("m1", opts);
    expect(res).toMatchObject({ ok: false, error: { code: "not_pending" } });
    expect(h.renumberChapters).not.toHaveBeenCalled();
    expect(h.db.chapter.create).not.toHaveBeenCalled();
  });
});

describe("every apply transaction takes the book's chapter lock first (review of a07a2f2)", () => {
  const lockCalls = () =>
    h.db.$executeRaw.mock.calls.filter(([strings]) =>
      (strings as string[]).join("?").includes("pg_advisory_xact_lock")
    );

  it.each([
    ["reorder", { kind: "reorder", chapterNumber: 4, targetPosition: 2 }],
    ["merge", { kind: "merge", chapterNumbers: [2, 3] }],
    ["split", { kind: "split", chapterNumber: 3, anchorQuote: "Kad je pao mrak" }],
  ])("%s", async (kind, payload) => {
    h.db.structureMove.findFirst.mockResolvedValue(move(kind, payload));

    const res = await applyStructureMove("m1", opts);
    expect(res.ok).toBe(true);

    expect(lockCalls()).toHaveLength(1);
    const [strings, key] = lockCalls()[0];
    expect(key).toBe("wmb-chapters:b1");
    expect((strings as string[]).join("")).not.toContain("b1");

    // Before the renumber, and before the chapter list is read again inside
    // the transaction to confirm the plan still describes the book.
    const lockedAt = h.db.$executeRaw.mock.invocationCallOrder[0];
    expect(lockedAt).toBeLessThan(h.renumberChaptersWith.mock.invocationCallOrder[0]);
    expect(h.db.chapter.findMany.mock.invocationCallOrder.at(-1)!).toBeGreaterThan(lockedAt);
    if (kind === "merge") {
      expect(lockedAt).toBeLessThan(h.db.document.findMany.mock.invocationCallOrder[0]);
    }
  });
});

describe("undo restores the recorded word count, not a fresh tally", () => {
  /**
   * D-205: accepting a split and undoing it left the prose byte-identical but
   * moved book.wordCount — 56,874 to 56,890 on the owner's manuscript. The
   * merge path restores the number from its snapshot; the split path recounted
   * with countWords(), which strips markdown the import path had counted. Every
   * rehearsal of a move nudged the book's word count a little further wrong.
   */
  const CONTENT = "# Povratak\n\nPrva scena.\n\n- lista\n\nKad je pao mrak, sve je utihnulo.";

  beforeEach(() => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("split", { kind: "split", chapterNumber: 2, anchorQuote: "Kad je pao mrak" }, {
        status: "applied",
        previousState: JSON.stringify({
          ordering: [
            { chapterId: "c1", chapterNumber: 1 },
            { chapterId: "c2", chapterNumber: 2 },
          ],
          sourceChapterId: "c2",
          sourceContent: CONTENT,
          sourceWordCount: 1234,
          createdChapterId: "new1",
          createdChapterNumber: 3,
        }),
      })
    );
  });

  it("writes back the number the chapter had before the split", async () => {
    const res = await undoStructureMove("m1", opts);
    expect(res.ok).toBe(true);

    const restore = h.db.chapter.update.mock.calls
      .map((call) => call[0] as { data: { wordCount?: number } })
      .find((call) => call.data.wordCount !== undefined);

    expect(restore?.data.wordCount).toBe(1234);
  });

  it("falls back to a count for a snapshot taken before this was recorded", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      move("split", { kind: "split", chapterNumber: 2, anchorQuote: "Kad je pao mrak" }, {
        status: "applied",
        previousState: JSON.stringify({
          ordering: [{ chapterId: "c2", chapterNumber: 2 }],
          sourceChapterId: "c2",
          sourceContent: CONTENT,
          createdChapterId: "new1",
          createdChapterNumber: 3,
        }),
      })
    );

    const res = await undoStructureMove("m1", opts);
    expect(res.ok).toBe(true);

    const restore = h.db.chapter.update.mock.calls
      .map((call) => call[0] as { data: { wordCount?: number } })
      .find((call) => call.data.wordCount !== undefined);

    expect(restore?.data.wordCount).toBeGreaterThan(0);
  });
});
