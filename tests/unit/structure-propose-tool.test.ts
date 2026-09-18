import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O12 — the developmental editor's two new tools.
 *
 * ListChapters is the cheap table the restructure pass reasons over (numbers,
 * titles, word counts, status) — it must never pull prose.
 *
 * ProposeStructureMove validates the move against the real chapter list BEFORE
 * persisting it. A proposal the apply engine could not execute must never reach
 * the writer's accept button: the model invents chapter numbers, and an
 * un-runnable proposal is worse than no proposal.
 */

const h = vi.hoisted(() => ({
  db: {
    chapter: { findMany: vi.fn() },
    structureMove: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

import { executeTool, getToolDefinitions } from "@/lib/agents/tools";

const ctx = {
  bookId: "b1",
  userId: "u1",
  sessionId: "s1",
  agentType: "story-architect",
  documentService: {} as never,
  language: "sr",
};

const chapters = [
  { id: "c1", chapterNumber: 1, title: "Zakletva", wordCount: 2100, actNumber: 1, status: "drafted" },
  { id: "c2", chapterNumber: 2, title: "Pismo", wordCount: 1800, actNumber: 1, status: "drafted" },
  { id: "c3", chapterNumber: 3, title: "Put", wordCount: 900, actNumber: 1, status: "drafted" },
  { id: "c4", chapterNumber: 4, title: "Kuća", wordCount: 2400, actNumber: 2, status: "drafted" },
];

beforeEach(() => {
  vi.clearAllMocks();
  // The book has not seen this move before (see no-duplicates.test.ts).
  h.db.structureMove.findFirst.mockResolvedValue(null);
  h.db.chapter.findMany.mockResolvedValue(chapters);
  h.db.structureMove.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "m1",
    ...data,
  }));
  h.db.structureMove.findMany.mockResolvedValue([]);
});

describe("ListChapters", () => {
  it("returns the chapter table without any prose", async () => {
    const out = await executeTool("ListChapters", ctx as never, {});
    expect(out).toContain("Zakletva");
    expect(out).toContain("900");
    expect(out).toContain("4");
    const select = h.db.chapter.findMany.mock.calls[0][0].select;
    expect(select).toBeDefined();
    expect(Object.keys(select)).not.toContain("content");
  });

  it("is fenced to the session's book", async () => {
    await executeTool("ListChapters", ctx as never, {});
    expect(h.db.chapter.findMany.mock.calls[0][0].where).toMatchObject({ bookId: "b1" });
  });
});

describe("ProposeStructureMove", () => {
  it("persists a valid reorder as a pending move with its reason", async () => {
    const out = await executeTool("ProposeStructureMove", ctx as never, {
      kind: "reorder",
      chapterNumbers: [4],
      targetPosition: 2,
      reason: "Nit iz 1903. staje na četiri poglavlja.",
      confidence: 0.8,
    });

    expect(h.db.structureMove.create).toHaveBeenCalledTimes(1);
    const data = h.db.structureMove.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      bookId: "b1",
      sessionId: "s1",
      kind: "reorder",
      status: "pending",
      confidence: 0.8,
    });
    expect(data.reason).toContain("1903");
    expect(JSON.parse(data.payload)).toMatchObject({ chapterNumber: 4, targetPosition: 2 });
    expect(out.toLowerCase()).toContain("proposed");
  });

  it("refuses a move the apply engine could not run, and persists nothing", async () => {
    const out = await executeTool("ProposeStructureMove", ctx as never, {
      kind: "merge",
      chapterNumbers: [1, 4],
      reason: "Ova dva poglavlja rade isti posao.",
    });

    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/not adjacent|rejected|cannot/i);
  });

  it("refuses a chapter number that does not exist", async () => {
    const out = await executeTool("ProposeStructureMove", ctx as never, {
      kind: "reorder",
      chapterNumbers: [99],
      targetPosition: 1,
      reason: "x",
    });
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/99/);
  });

  it("requires a reason — an unexplained move is not a proposal", async () => {
    const out = await executeTool("ProposeStructureMove", ctx as never, {
      kind: "reorder",
      chapterNumbers: [4],
      targetPosition: 2,
      reason: "   ",
    });
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/reason/i);
  });

  it("checks a split's anchor against the real chapter text, not just the number", async () => {
    const out = await executeTool("ProposeStructureMove", ctx as never, {
      kind: "split",
      chapterNumbers: [3],
      reason: "Dve scene u jednom poglavlju.",
      // no anchorQuote
    });
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/anchor/i);
  });

  it("stores a split's anchor verbatim in the payload", async () => {
    const out = await executeTool("ProposeStructureMove", ctx as never, {
      kind: "split",
      chapterNumbers: [3],
      anchorQuote: "Kad je pao mrak",
      reason: "Dve scene u jednom poglavlju.",
    });
    expect(out.toLowerCase()).toContain("proposed");
    const data = h.db.structureMove.create.mock.calls[0][0].data;
    expect(JSON.parse(data.payload)).toMatchObject({
      chapterNumber: 3,
      anchorQuote: "Kad je pao mrak",
    });
  });

  it("is offered to the agent with an enum of the four kinds", () => {
    const [def] = getToolDefinitions(["ProposeStructureMove"]);
    expect(def).toBeDefined();
    const props = def.input_schema.properties as Record<string, { enum?: string[] }>;
    expect(props.kind.enum).toEqual(["reorder", "renumber", "merge", "split"]);
    expect(def.input_schema.required).toContain("reason");
  });
});

describe("ProposeStructureMove — the same move is never filed twice", () => {
  /**
   * S3-5: running `restructure` twice filed every move again, and accepting
   * both applied it twice — the second time against whatever had shifted into
   * the numbers the first one vacated. That swallowed a chapter the editor had
   * explicitly declined to touch, on the owner's real manuscript.
   */
  beforeEach(() => {
    h.db.chapter.findMany.mockResolvedValue(chapters);
    h.db.structureMove.create.mockResolvedValue({ id: "m-new" });
  });

  const merge = {
    kind: "merge",
    chapterNumbers: [2, 3],
    reason: "Oba su ispod pola medijane i pokrivaju jednu scenu.",
  };

  it("files a move the book has not seen", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(null);

    const out = await executeTool("ProposeStructureMove", ctx as never, merge);
    expect(h.db.structureMove.create).toHaveBeenCalledTimes(1);
    expect(out).toContain("m-new");
  });

  it("refuses an identical move that is still waiting for a decision", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({ id: "m-old", status: "pending" });

    const out = await executeTool("ProposeStructureMove", ctx as never, merge);
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/already/i);
    expect(out).toContain("m-old");
  });

  it("refuses an identical move the writer has already applied", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({ id: "m-old", status: "applied" });

    const out = await executeTool("ProposeStructureMove", ctx as never, merge);
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/already/i);
  });
});
