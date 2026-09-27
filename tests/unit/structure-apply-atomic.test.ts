import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The apply engine against a small in-memory book whose transactions really
 * roll back — so what these tests assert is the state the WRITER is left with.
 *
 * P6-S10: a merge deleted the absorbed chapter and its documents, THEN ran the
 * renumber. On a long book the renumber's transaction timed out, and the book
 * was left a chapter short with a gap in its numbering, a stale chapter count,
 * the move marked failed with no undo snapshot, and the raw Prisma error shown
 * to the writer. A move is all or nothing.
 *
 * P2-S11: the executor looked chapters up by the numbers written into the
 * proposal. After another accepted move renumbered the book, a split went
 * looking for its quote in the wrong chapter and a merge fused two chapters
 * nobody proposed. planMove resolves the ids; the executor must use them.
 *
 * P2-S12 / X-S08: a move is applied only if it is STILL pending when the apply
 * commits. A reject that lands mid-apply wins, and the apply takes nothing.
 *
 * Review of a07a2f2: a merge read the absorbed chapter's NUMBER before its
 * transaction and dropped that number's documents inside it. A corkboard drag
 * committed in between handed the number to another chapter, and the merge
 * deleted that chapter's prose and then its files. Every renumbering
 * transaction now takes the book's chapter lock first and refuses to run on a
 * book that no longer looks the way the plan saw it. Undo follows the survivor
 * by id, claims the move before it works, and will not delete a split-off
 * chapter the writer has written in since.
 */

interface Ch {
  id: string;
  bookId: string;
  chapterNumber: number;
  title: string | null;
  wordCount: number;
  actNumber: number;
  status: string;
}
interface Doc {
  id: string;
  bookId: string;
  type: string;
  chapterNumber: number | null;
  storageKey: string;
  versions: string[];
  content: string;
  currentVersion: number;
}
interface Move {
  id: string;
  bookId: string;
  kind: string;
  payload: string;
  status: string;
  previousState: string | null;
  resultSummary: string | null;
}

const h = vi.hoisted(() => ({
  state: {
    chapters: [] as unknown[],
    documents: [] as unknown[],
    moves: [] as unknown[],
    book: { chapterCount: 0, wordCount: 0 },
    deletedBlobs: [] as string[],
  },
  /** Called inside the renumber: lets a test fail it or race it. */
  duringRenumber: null as null | (() => void),
  /** Makes the next chapter insert fail, after the renumber has run. */
  createFails: false,
  /**
   * Runs once, as the next interactive transaction opens: another tab's work
   * that committed after this apply read the book and before its transaction.
   */
  beforeTx: null as null | (() => void),
  /**
   * Runs once, right after the next chapter row is read by id: another tab's
   * renumber that commits between an undo reading the survivor's number and
   * writing prose by it.
   */
  afterChapterFindFirst: null as null | (() => void),
  statements: [] as Array<{ sql: string; values: unknown[] }>,
  txOptions: [] as unknown[],
  seq: 0,
}));

type State = {
  chapters: Ch[];
  documents: Doc[];
  moves: Move[];
  book: { chapterCount: number; wordCount: number };
  deletedBlobs: string[];
};
const S = () => h.state as unknown as State;

function uniqueViolation(): Error {
  const e = new Error("Unique constraint failed on the fields: (`book_id`,`chapter_number`)");
  (e as Error & { code?: string }).code = "P2002";
  return e;
}

function idIn(where: { id?: string | { in: string[] } }, id: string): boolean {
  if (where.id === undefined) return true;
  return typeof where.id === "string" ? where.id === id : where.id.in.includes(id);
}

function numberMatches(
  cond: number | { in?: number[]; gte?: number } | undefined,
  n: number | null
): boolean {
  if (cond === undefined) return true;
  if (typeof cond === "number") return n === cond;
  if (n === null) return false;
  if (cond.in) return cond.in.includes(n);
  if (cond.gte !== undefined) return n >= cond.gte;
  return true;
}

vi.mock("@/lib/db", () => {
  const fake = {
    $transaction: async (fn: unknown, opts?: unknown) => {
      h.txOptions.push(opts);
      if (Array.isArray(fn)) return Promise.all(fn);
      const racer = h.beforeTx;
      h.beforeTx = null;
      racer?.();
      // Moves are left out of the rollback on purpose: a test that races a
      // reject writes it as another transaction that has already committed.
      const snap = structuredClone({
        chapters: S().chapters,
        documents: S().documents,
        book: S().book,
      });
      try {
        return await (fn as (tx: unknown) => Promise<unknown>)(fake);
      } catch (e) {
        Object.assign(h.state, snap);
        throw e;
      }
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.statements.push({ sql: strings.join("?"), values });
      return 1;
    },
    chapter: {
      findMany: async ({ where }: { where: { bookId: string; id?: { in: string[] } } }) =>
        S()
          .chapters.filter((c) => c.bookId === where.bookId && idIn(where, c.id))
          .sort((a, b) => a.chapterNumber - b.chapterNumber)
          .map((c) => ({ ...c })),
      findFirst: async ({ where }: { where: { id?: string; bookId?: string } }) => {
        const c = S().chapters.find(
          (x) => idIn(where, x.id) && (!where.bookId || x.bookId === where.bookId)
        );
        const row = c ? { ...c } : null;
        const racer = h.afterChapterFindFirst;
        h.afterChapterFindFirst = null;
        racer?.();
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        S().chapters = S().chapters.filter((c) => c.id !== where.id);
      },
      deleteMany: async ({ where }: { where: { bookId?: string; id?: { in: string[] } } }) => {
        const before = S().chapters.length;
        S().chapters = S().chapters.filter(
          (c) => !((!where.bookId || c.bookId === where.bookId) && idIn(where, c.id))
        );
        return { count: before - S().chapters.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Ch> }) => {
        const c = S().chapters.find((x) => x.id === where.id);
        if (!c) throw new Error("Record to update not found (P2025)");
        Object.assign(c, data);
        return { ...c };
      },
      create: async ({ data }: { data: Omit<Ch, "id"> }) => {
        if (h.createFails) throw new Error("insert into chapters failed");
        if (S().chapters.some((c) => c.bookId === data.bookId && c.chapterNumber === data.chapterNumber)) {
          throw uniqueViolation();
        }
        const row = { id: `new-${++h.seq}`, ...data } as Ch;
        S().chapters.push(row);
        return { ...row };
      },
    },
    document: {
      findMany: async ({
        where,
      }: {
        where: { bookId: string; chapterNumber?: number | { in: number[] } };
      }) =>
        S()
          .documents.filter(
            (d) => d.bookId === where.bookId && numberMatches(where.chapterNumber, d.chapterNumber)
          )
          .map((d) => ({
            id: d.id,
            storageKey: d.storageKey,
            chapterNumber: d.chapterNumber,
            versions: d.versions.map((storageKey) => ({ storageKey })),
          })),
      findFirst: async ({
        where,
      }: {
        where: { bookId: string; type?: string; chapterNumber?: number | { gte: number } };
      }) => {
        const hits = S()
          .documents.filter(
            (d) =>
              d.bookId === where.bookId &&
              (!where.type || d.type === where.type) &&
              numberMatches(where.chapterNumber, d.chapterNumber)
          )
          .sort((a, b) => (b.chapterNumber ?? 0) - (a.chapterNumber ?? 0));
        return hits[0] ? { ...hits[0] } : null;
      },
      deleteMany: async ({ where }: { where: { bookId: string; id: { in: string[] } } }) => {
        const before = S().documents.length;
        S().documents = S().documents.filter(
          (d) => !(d.bookId === where.bookId && where.id.in.includes(d.id))
        );
        return { count: before - S().documents.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Doc> }) => {
        const d = S().documents.find((x) => x.id === where.id);
        if (!d) throw new Error("Record to update not found (P2025)");
        if (
          data.chapterNumber !== undefined &&
          S().documents.some(
            (x) => x !== d && x.bookId === d.bookId && x.type === d.type && x.chapterNumber === data.chapterNumber
          )
        ) {
          throw uniqueViolation();
        }
        Object.assign(d, data);
        return { ...d };
      },
    },
    structureMove: {
      findFirst: async ({ where }: { where: { id: string; bookId?: string } }) => {
        const m = S().moves.find((x) => x.id === where.id && (!where.bookId || x.bookId === where.bookId));
        return m ? { ...m } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Move> }) => {
        const m = S().moves.find((x) => x.id === where.id)!;
        Object.assign(m, data);
        return { ...m };
      },
      updateMany: async ({ where, data }: { where: Partial<Move>; data: Partial<Move> }) => {
        const hits = S().moves.filter((m) =>
          Object.entries(where).every(([k, v]) => (m as unknown as Record<string, unknown>)[k] === v)
        );
        hits.forEach((m) => Object.assign(m, data));
        return { count: hits.length };
      },
    },
  };
  return { db: fake };
});

/** In-memory renumber with the real module's contract: named first, rest after. */
async function fakeRenumber(bookId: string, order: Array<{ chapterId: string; chapterNumber: number }>) {
  if (order.length === 0) return;
  h.duringRenumber?.();
  const book = S().chapters.filter((c) => c.bookId === bookId);
  const missing = order.find((o) => !book.some((c) => c.id === o.chapterId));
  if (missing) throw new Error(`Chapter ${missing.chapterId} is not in this book any more.`);
  const named = new Set(order.map((o) => o.chapterId));
  const last = Math.max(...order.map((o) => o.chapterNumber));
  const full = [
    ...order,
    ...book
      .filter((c) => !named.has(c.id))
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .map((c, i) => ({ chapterId: c.id, chapterNumber: last + 1 + i })),
  ];
  const old = new Map(book.map((c) => [c.id, c.chapterNumber]));
  const docsByOld = new Map<number, Doc[]>();
  for (const d of S().documents) {
    if (d.bookId === bookId && d.chapterNumber !== null) {
      docsByOld.set(d.chapterNumber, [...(docsByOld.get(d.chapterNumber) ?? []), d]);
    }
  }
  for (const o of full) {
    const from = old.get(o.chapterId)!;
    S().chapters.find((c) => c.id === o.chapterId)!.chapterNumber = o.chapterNumber;
    for (const d of docsByOld.get(from) ?? []) d.chapterNumber = o.chapterNumber;
  }
}

// Only the renumber itself is replaced; the lock and the book-changed check are
// the real ones, running against the fake client above.
vi.mock("@/lib/chapters/renumber", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chapters/renumber")>()),
  renumberChaptersWith: (_client: unknown, bookId: string, order: never) => fakeRenumber(bookId, order),
  renumberChapters: (bookId: string, order: never) => fakeRenumber(bookId, order),
}));

vi.mock("@/lib/books/book-counters", () => ({
  reconcileBookCounters: async (bookId: string) => {
    const rows = S().chapters.filter((c) => c.bookId === bookId);
    S().book = {
      chapterCount: rows.length,
      wordCount: rows.reduce((sum, c) => sum + c.wordCount, 0),
    };
    return S().book;
  },
}));

vi.mock("@/lib/storage", () => ({
  getBookStorage: () => ({
    delete: async (key: string) => {
      S().deletedBlobs.push(key);
    },
  }),
}));

vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    async findByType(type: string, chapterNumber?: number) {
      const d = S().documents.find((x) => x.type === type && x.chapterNumber === chapterNumber);
      return d ? { ...d } : null;
    }
    async read(id: string) {
      const d = S().documents.find((x) => x.id === id);
      return d ? { document: { ...d }, content: d.content } : null;
    }
    async update(id: string, content: string) {
      const d = S().documents.find((x) => x.id === id);
      if (!d) throw new Error("Document not found");
      d.content = content;
      d.versions.push(`versions/${id}/v${d.versions.length + 1}.md`);
      d.currentVersion = d.versions.length;
      return { document: { ...d }, version: { version: d.versions.length } };
    }
    async create(type: string, content: string, _title?: string, chapterNumber?: number) {
      if (S().documents.some((x) => x.type === type && x.chapterNumber === (chapterNumber ?? null))) {
        throw uniqueViolation();
      }
      const id = `doc-new-${++h.seq}`;
      const row: Doc = {
        id,
        bookId: "b1",
        type,
        chapterNumber: chapterNumber ?? null,
        storageKey: `chapters/${id}.md`,
        versions: [`versions/${id}/v1.md`],
        content,
        currentVersion: 1,
      };
      S().documents.push(row);
      return { ...row };
    }
    async delete(id: string) {
      const d = S().documents.find((x) => x.id === id);
      if (!d) throw new Error("Document not found");
      S().deletedBlobs.push(d.storageKey, ...d.versions);
      S().documents = S().documents.filter((x) => x.id !== id);
    }
    async list(filter?: { chapterNumber?: number }) {
      return S()
        .documents.filter((d) => filter?.chapterNumber === undefined || d.chapterNumber === filter.chapterNumber)
        .map((d) => ({ ...d }));
    }
  },
}));

import { applyStructureMove, undoStructureMove } from "@/lib/structure/apply-move";

const ctx = { bookId: "b1", userId: "u1" };

/** The prose chapter N was seeded with. */
const ORIG = (i: number) =>
  `Text of orig-${i}.\n\nSecond paragraph of orig-${i}.\n\nAnchor line of orig-${i}.`;

/** Chapter N holds "Text of orig-N." and a brief, and is `oN` for good. */
function seedBook(n: number) {
  h.seq = 0;
  h.duringRenumber = null;
  h.createFails = false;
  h.beforeTx = null;
  h.afterChapterFindFirst = null;
  h.statements = [];
  h.txOptions = [];
  const chapters: Ch[] = [];
  const documents: Doc[] = [];
  for (let i = 1; i <= n; i++) {
    chapters.push({
      id: `o${i}`,
      bookId: "b1",
      chapterNumber: i,
      title: `Orig ${i}`,
      wordCount: 10,
      actNumber: 1,
      status: "drafted",
    });
    documents.push({
      id: `content-o${i}`,
      bookId: "b1",
      type: "CHAPTER_CONTENT",
      chapterNumber: i,
      storageKey: `chapters/chapter-${i}.md`,
      versions: [`versions/content-o${i}/v1.md`],
      content: ORIG(i),
      currentVersion: 1,
    });
    documents.push({
      id: `brief-o${i}`,
      bookId: "b1",
      type: "CHAPTER_BRIEF",
      chapterNumber: i,
      storageKey: `briefs/chapter-${i}.md`,
      versions: [`versions/brief-o${i}/v1.md`],
      content: `Brief ${i}`,
      currentVersion: 1,
    });
  }
  Object.assign(h.state, {
    chapters,
    documents,
    moves: [],
    book: { chapterCount: n, wordCount: n * 10 },
    deletedBlobs: [],
  });
}

function propose(kind: string, payload: Record<string, unknown>, id = "m1") {
  S().moves.push({
    id,
    bookId: "b1",
    kind,
    payload: JSON.stringify({ kind, ...payload }),
    status: "pending",
    previousState: null,
    resultSummary: null,
  });
}

const move = (id = "m1") => S().moves.find((m) => m.id === id)!;
const chapter = (id: string) => S().chapters.find((c) => c.id === id);
const numbers = () => S().chapters.map((c) => c.chapterNumber).sort((a, b) => a - b);
const contentOf = (chapterId: string) => {
  const n = chapter(chapterId)?.chapterNumber;
  return S().documents.find((d) => d.type === "CHAPTER_CONTENT" && d.chapterNumber === n)?.content;
};

/** Another tab's corkboard drag, committed: two chapters trade places, documents and all. */
function dragSwap(a: string, b: string) {
  const [ca, cb] = [chapter(a)!, chapter(b)!];
  const [na, nb] = [ca.chapterNumber, cb.chapterNumber];
  for (const d of S().documents) {
    if (d.chapterNumber === na) d.chapterNumber = nb;
    else if (d.chapterNumber === nb) d.chapterNumber = na;
  }
  ca.chapterNumber = nb;
  cb.chapterNumber = na;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("merge is all or nothing (P6-S10)", () => {
  it("a renumber that times out leaves the book exactly as it was", async () => {
    seedBook(5);
    propose("merge", { chapterIds: ["o1", "o2"], chapterNumbers: [1, 2] });
    h.duringRenumber = () => {
      throw new Error(
        "Transaction API error: A rollback cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms"
      );
    };

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: false, error: { code: "apply_failed" } });
    // The absorbed chapter, its row and its documents are all still there.
    expect(chapter("o2")).toBeDefined();
    expect(numbers()).toEqual([1, 2, 3, 4, 5]);
    expect(S().documents.filter((d) => d.chapterNumber === 2)).toHaveLength(2);
    expect(S().deletedBlobs).toEqual([]);
    // The survivor has its own prose back, not the merged text.
    expect(contentOf("o1")).toBe(
      "Text of orig-1.\n\nSecond paragraph of orig-1.\n\nAnchor line of orig-1."
    );
    expect(S().book.chapterCount).toBe(5);
    expect(move().status).toBe("failed");
  });

  it("does not show the writer a raw database error", async () => {
    seedBook(3);
    propose("merge", { chapterIds: ["o1", "o2"], chapterNumbers: [1, 2] });
    h.duringRenumber = () => {
      throw new Error("Invalid `ops.push(__TURBOPACK__imported__module__...db.chapter.update()` invocation");
    };

    const res = await applyStructureMove("m1", ctx);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).not.toMatch(/TURBOPACK|invocation|Transaction API/);
    }
    expect(move().resultSummary ?? "").not.toMatch(/TURBOPACK|invocation/);
  });

  it("a merge that succeeds closes the gap, recounts, keeps an undo snapshot and only then drops the files", async () => {
    seedBook(5);
    propose("merge", { chapterIds: ["o1", "o2"], chapterNumbers: [1, 2] });

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: true });
    expect(chapter("o2")).toBeUndefined();
    expect(numbers()).toEqual([1, 2, 3, 4]);
    expect(chapter("o3")?.chapterNumber).toBe(2);
    expect(contentOf("o1")).toContain("Text of orig-1.");
    expect(contentOf("o1")).toContain("Text of orig-2.");
    expect(contentOf("o3")).toContain("Text of orig-3.");
    expect(S().book.chapterCount).toBe(4);
    expect(move().status).toBe("applied");
    expect(JSON.parse(move().previousState!).chapters[1]).toMatchObject({
      chapterId: "o2",
      content: expect.stringContaining("Text of orig-2."),
    });
    expect(S().deletedBlobs).toEqual(
      expect.arrayContaining(["chapters/chapter-2.md", "briefs/chapter-2.md"])
    );
  });

  it("runs with a transaction timeout well above Prisma's 5 s default", async () => {
    seedBook(3);
    propose("merge", { chapterIds: ["o1", "o2"], chapterNumbers: [1, 2] });

    await applyStructureMove("m1", ctx);

    const timeouts = h.txOptions
      .map((o) => (o as { timeout?: number } | undefined)?.timeout ?? 5000);
    expect(timeouts.length).toBeGreaterThan(0);
    expect(Math.min(...timeouts)).toBeGreaterThan(5000);
  });
});

describe("the executor follows the chapter, not the number (P2-S11)", () => {
  /** After merging orig2+orig3, orig5 is chapter 4 and chapter 5 is orig6. */
  async function afterEarlierMerge() {
    seedBook(8);
    propose("merge", { chapterIds: ["o2", "o3"], chapterNumbers: [2, 3] }, "earlier");
    const first = await applyStructureMove("earlier", ctx);
    expect(first.ok).toBe(true);
    expect(chapter("o5")?.chapterNumber).toBe(4);
  }

  it("splits the chapter it was proposed for, at its new number", async () => {
    await afterEarlierMerge();
    propose("split", { chapterId: "o5", chapterNumber: 5, anchorQuote: "Anchor line of orig-5." });

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: true, summary: "Split chapter 4 into 4 and 5." });
    expect(contentOf("o5")).toContain("Text of orig-5.");
    expect(contentOf("o5")).not.toContain("Anchor line of orig-5.");
    // orig6 was not touched: it moved to 6 and kept all its prose.
    expect(chapter("o6")?.chapterNumber).toBe(6);
    expect(contentOf("o6")).toContain("Anchor line of orig-6.");
    const created = S().chapters.find((c) => c.chapterNumber === 5)!;
    expect(contentOf(created.id)).toBe("Anchor line of orig-5.");
    expect(numbers()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("merges the chapters it was proposed for, not the ones now holding their numbers", async () => {
    await afterEarlierMerge();
    propose("merge", { chapterIds: ["o6", "o7"], chapterNumbers: [6, 7] });

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: true, summary: "Merged chapters 5 + 6 into chapter 5." });
    expect(chapter("o7")).toBeUndefined();
    expect(chapter("o8")).toBeDefined();
    expect(contentOf("o6")).toContain("Text of orig-6.");
    expect(contentOf("o6")).toContain("Text of orig-7.");
    expect(contentOf("o8")).toContain("Text of orig-8.");
    expect(contentOf("o6")).not.toContain("orig-8");
    expect(numbers()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("names the moved chapter by its current number", async () => {
    await afterEarlierMerge();
    propose("reorder", { chapterId: "o5", chapterNumber: 5, targetPosition: 1 });

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: true, summary: "Moved chapter 4 to position 1." });
    expect(chapter("o5")?.chapterNumber).toBe(1);
  });
});

describe("split is all or nothing", () => {
  it("a failure after the renumber leaves the source whole and no half chapter behind", async () => {
    seedBook(4);
    propose("split", { chapterId: "o2", chapterNumber: 2, anchorQuote: "Anchor line of orig-2." });
    // The renumber has shifted the tail and the first half is written when
    // the new chapter's insert fails.
    h.createFails = true;

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: false, error: { code: "apply_failed" } });
    expect(numbers()).toEqual([1, 2, 3, 4]);
    expect(S().chapters).toHaveLength(4);
    expect(contentOf("o2")).toContain("Anchor line of orig-2.");
    expect(contentOf("o2")).toContain("Text of orig-2.");
    // The second half was filed before the transaction; it is gone again.
    expect(S().documents.filter((d) => d.type === "CHAPTER_CONTENT")).toHaveLength(4);
    expect(move().status).toBe("failed");
  });
});

describe("an apply only commits while the move is still pending (P2-S12)", () => {
  it("a reject that lands mid-apply wins: nothing changes and the move stays rejected", async () => {
    seedBook(4);
    propose("reorder", { chapterId: "o4", chapterNumber: 4, targetPosition: 1 });
    h.duringRenumber = () => {
      // The stale tab's reject commits while this apply is in flight.
      move().status = "rejected";
    };

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: false, error: { code: "not_pending" } });
    expect(move().status).toBe("rejected");
    expect(chapter("o4")?.chapterNumber).toBe(4);
    expect(numbers()).toEqual([1, 2, 3, 4]);
  });

  it("a merge raced by a second accept is not marked failed over the applied one", async () => {
    seedBook(4);
    propose("merge", { chapterIds: ["o1", "o2"], chapterNumbers: [1, 2] });
    h.duringRenumber = () => {
      move().status = "applied";
    };

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: false, error: { code: "not_pending" } });
    expect(move().status).toBe("applied");
  });
});

describe("a renumber that commits between the plan and the apply (review of a07a2f2)", () => {
  it("a merge deletes nothing that now belongs to another chapter", async () => {
    seedBook(5);
    propose("merge", { chapterIds: ["o2", "o3"], chapterNumbers: [2, 3] });
    // Planned with orig3 at 3. A drag in another tab then hands 3 to orig4.
    h.beforeTx = () => dragSwap("o3", "o4");

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: false, error: { code: "apply_failed" } });
    // orig4 keeps its prose, its brief and its files.
    expect(contentOf("o4")).toBe(ORIG(4));
    expect(S().documents.filter((d) => d.id.endsWith("-o4"))).toHaveLength(2);
    expect(S().deletedBlobs).toEqual([]);
    // Nothing of the merge landed: the absorbed chapter is still there and the
    // survivor has its own prose back.
    expect(chapter("o3")).toBeDefined();
    expect(contentOf("o2")).toBe(ORIG(2));
    // The book is as the other tab left it.
    expect(chapter("o3")?.chapterNumber).toBe(4);
    expect(chapter("o4")?.chapterNumber).toBe(3);
    // Still pending: accepting again re-plans against the book as it is now.
    expect(move().status).toBe("pending");
  });

  it("a reorder planned on a stale book does not overwrite the newer order", async () => {
    seedBook(4);
    propose("reorder", { chapterId: "o4", chapterNumber: 4, targetPosition: 1 });
    h.beforeTx = () => dragSwap("o1", "o2");

    const res = await applyStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: false, error: { code: "apply_failed" } });
    expect(chapter("o2")?.chapterNumber).toBe(1);
    expect(chapter("o1")?.chapterNumber).toBe(2);
    expect(chapter("o4")?.chapterNumber).toBe(4);
    expect(move().status).toBe("pending");
  });

  it("every apply transaction takes the book's chapter lock, keyed by a bound parameter", async () => {
    seedBook(3);
    propose("merge", { chapterIds: ["o1", "o2"], chapterNumbers: [1, 2] });

    await applyStructureMove("m1", ctx);

    const lock = h.statements.find((s) => /pg_advisory_xact_lock/.test(s.sql));
    expect(lock).toBeDefined();
    expect(lock!.values).toEqual(["wmb-chapters:b1"]);
    expect(lock!.sql).not.toContain("b1");
  });
});

describe("undo (review of a07a2f2)", () => {
  it("restores a merge survivor by id, not by the number it had then", async () => {
    seedBook(5);
    propose("merge", { chapterIds: ["o2", "o3"], chapterNumbers: [2, 3] }, "merge");
    expect((await applyStructureMove("merge", ctx)).ok).toBe(true);
    // A later move takes orig2 to the end: chapter 2 is now orig4.
    propose("reorder", { chapterId: "o2", chapterNumber: 2, targetPosition: 4 }, "later");
    expect((await applyStructureMove("later", ctx)).ok).toBe(true);
    expect(chapter("o4")?.chapterNumber).toBe(2);

    const res = await undoStructureMove("merge", ctx);

    expect(res.ok).toBe(true);
    expect(contentOf("o4")).toBe(ORIG(4));
    expect(contentOf("o2")).toBe(ORIG(2));
  });

  it("two undos pressed at once put the absorbed chapter back once", async () => {
    seedBook(4);
    propose("merge", { chapterIds: ["o2", "o3"], chapterNumbers: [2, 3] });
    expect((await applyStructureMove("m1", ctx)).ok).toBe(true);

    const results = await Promise.all([undoStructureMove("m1", ctx), undoStructureMove("m1", ctx)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "not_pending" } });
    expect(S().chapters).toHaveLength(4);
    expect(numbers()).toEqual([1, 2, 3, 4]);
    expect(S().documents.filter((d) => d.type === "CHAPTER_CONTENT")).toHaveLength(4);
    expect(move().status).toBe("undone");
  });

  it("an undo that cannot finish hands the move back as applied", async () => {
    seedBook(4);
    propose("merge", { chapterIds: ["o2", "o3"], chapterNumbers: [2, 3] });
    expect((await applyStructureMove("m1", ctx)).ok).toBe(true);
    h.createFails = true;

    const res = await undoStructureMove("m1", ctx);

    expect(res.ok).toBe(false);
    expect(move().status).toBe("applied");
  });

  // Merge undo wrote the survivor's prose, created the absorbed rows and only
  // then took the book's chapter lock, inside the renumber. Everything before
  // it ran on numbers read without the lock.
  it("a merge undo that cannot finish leaves the merged text in the book", async () => {
    seedBook(4);
    propose("merge", { chapterIds: ["o2", "o3"], chapterNumbers: [2, 3] });
    expect((await applyStructureMove("m1", ctx)).ok).toBe(true);
    const mergedText = contentOf("o2")!;
    expect(mergedText).toContain("Text of orig-3.");
    h.createFails = true;

    const res = await undoStructureMove("m1", ctx);

    expect(res.ok).toBe(false);
    // The survivor still holds both chapters' words: nothing the writer had is
    // gone while the absorbed chapter could not be put back.
    expect(contentOf("o2")).toBe(mergedText);
    expect(S().chapters).toHaveLength(3);
    expect(numbers()).toEqual([1, 2, 3]);
    expect(move().status).toBe("applied");
  });

  it("a merge undo takes the book's chapter lock before it writes", async () => {
    seedBook(4);
    propose("merge", { chapterIds: ["o2", "o3"], chapterNumbers: [2, 3] });
    expect((await applyStructureMove("m1", ctx)).ok).toBe(true);
    h.statements = [];

    expect((await undoStructureMove("m1", ctx)).ok).toBe(true);

    const lock = h.statements.find((s) => /pg_advisory_xact_lock/.test(s.sql));
    expect(lock).toBeDefined();
    expect(lock!.values).toEqual(["wmb-chapters:b1"]);
  });

  it("a merge undo raced by a corkboard drag overwrites no other chapter's prose", async () => {
    seedBook(5);
    propose("merge", { chapterIds: ["o2", "o3"], chapterNumbers: [2, 3] });
    expect((await applyStructureMove("m1", ctx)).ok).toBe(true);
    // Book is now o1=1, o2=2 (merged), o4=3, o5=4. The drag commits right after
    // the undo has read the survivor's number: chapter 2 is o4 from then on.
    h.afterChapterFindFirst = () => dragSwap("o2", "o4");

    const res = await undoStructureMove("m1", ctx);

    expect(contentOf("o4")).toBe(ORIG(4));
    if (res.ok) {
      // Undone under the lock: every chapter has its own words back.
      expect(contentOf("o2")).toBe(ORIG(2));
      expect(contentOf("o3") ?? S().documents.find((d) => d.content === ORIG(3))?.content).toBe(ORIG(3));
    } else {
      // Refused because the book moved under it: nothing changed, writer retries.
      expect(move().status).toBe("applied");
      expect(S().chapters).toHaveLength(4);
    }
  });

  it("refuses to undo a split whose new chapter the writer has written in since", async () => {
    seedBook(3);
    propose("split", { chapterId: "o2", chapterNumber: 2, anchorQuote: "Anchor line of orig-2." });
    expect((await applyStructureMove("m1", ctx)).ok).toBe(true);
    const carved = S().chapters.find((c) => c.chapterNumber === 3)!;
    // The writer saves new prose into the chapter the split created.
    const prose = S().documents.find((d) => d.type === "CHAPTER_CONTENT" && d.chapterNumber === 3)!;
    prose.content = "Anchor line of orig-2.\n\nA scene the writer added after the split.";
    prose.versions.push(`versions/${prose.id}/v2.md`);
    prose.currentVersion = 2;

    const res = await undoStructureMove("m1", ctx);

    expect(res).toMatchObject({ ok: false, error: { code: "split_edited" } });
    expect(chapter(carved.id)).toBeDefined();
    expect(contentOf(carved.id)).toContain("A scene the writer added after the split.");
    expect(S().deletedBlobs).toEqual([]);
    expect(move().status).toBe("applied");
  });

  it("still undoes a split whose new chapter nobody touched", async () => {
    seedBook(3);
    propose("split", { chapterId: "o2", chapterNumber: 2, anchorQuote: "Anchor line of orig-2." });
    expect((await applyStructureMove("m1", ctx)).ok).toBe(true);

    const res = await undoStructureMove("m1", ctx);

    expect(res.ok).toBe(true);
    expect(S().chapters).toHaveLength(3);
    expect(numbers()).toEqual([1, 2, 3]);
    expect(contentOf("o2")).toBe(ORIG(2));
    expect(contentOf("o3")).toBe(ORIG(3));
    expect(S().documents.filter((d) => d.type === "CHAPTER_CONTENT")).toHaveLength(3);
    expect(move().status).toBe("undone");
  });
});
