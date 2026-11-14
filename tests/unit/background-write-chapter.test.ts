// Wave 7 Task 1 (P2-18 rest, D23): a background or batch run never overwrites
// chapter prose the writer already has. Its WriteChapter files the new text as
// a drafted "rewrite" proposal the writer reads on the Structure tab and
// applies (or rejects) through the same path as a trim or an expansion.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    chapter: { findFirst: vi.fn(), update: vi.fn() },
    structureMove: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { executeTool } from "@/lib/agents/tools";
import { REWRITE_KINDS, planMove } from "@/lib/structure/moves";
import { discardRewriteDraft } from "@/lib/structure/rewrite-move";

function ctx(interactive: boolean) {
  return {
    bookId: "b1",
    userId: "u1",
    sessionId: "s1",
    agentType: "ghostwriter",
    language: "en",
    interactive,
    chapterVersionsSeen: new Map<number, number>(),
    documentService: {
      findByType: vi.fn(async () => ({ id: "doc3", currentVersion: 6 })),
      update: vi.fn(async () => ({ version: { version: 7 } })),
      create: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findFirst.mockResolvedValue({ id: "c3", chapterNumber: 3, actNumber: 1, wordCount: 1200 });
  h.db.structureMove.create.mockResolvedValue({ id: "m1" });
  h.db.structureMove.findFirst.mockResolvedValue(null);
});

describe("WriteChapter in an unattended run", () => {
  it("files the text as a drafted rewrite proposal and leaves the chapter untouched", async () => {
    const c = ctx(false);
    const out = await executeTool("WriteChapter", c as never, { chapterNumber: 3, markdown: "A new version of chapter three." });
    expect(c.documentService.update).not.toHaveBeenCalled();
    expect(h.db.chapter.update).not.toHaveBeenCalled();
    const data = h.db.structureMove.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ bookId: "b1", sessionId: "s1", kind: "rewrite", status: "drafted", draft: "A new version of chapter three." });
    expect(JSON.parse(data.payload)).toMatchObject({ kind: "rewrite", chapterId: "c3", chapterNumber: 3 });
    expect(JSON.parse(data.draftMeta)).toMatchObject({ baseDocId: "doc3", baseVersion: 6, baseWords: 1200 });
    expect(out).toMatch(/draft/i);
    expect(out).toMatch(/nothing was overwritten/i);
  });

  it("a retried run (same session) replaces its own draft of the chapter instead of filing another (Wave 7 review)", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({ id: "m-earlier" });
    h.db.structureMove.updateMany.mockResolvedValue({ count: 1 });
    const c = ctx(false);
    await executeTool("WriteChapter", c as never, { chapterNumber: 3, markdown: "The retry's version." });
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    const lookup = h.db.structureMove.findFirst.mock.calls[0][0].where;
    expect(lookup).toMatchObject({ bookId: "b1", sessionId: "s1", kind: "rewrite", status: "drafted" });
    const update = h.db.structureMove.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({ id: "m-earlier", status: "drafted" });
    expect(update.data).toMatchObject({ draft: "The retry's version." });
  });

  it("an empty chapter is still written directly", async () => {
    h.db.chapter.findFirst.mockResolvedValue({ id: "c3", chapterNumber: 3, actNumber: 1, wordCount: 0 });
    const c = ctx(false);
    await executeTool("WriteChapter", c as never, { chapterNumber: 3, markdown: "First words." });
    expect(c.documentService.update).toHaveBeenCalled();
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
  });
});

describe("the rewrite kind", () => {
  it("is applied and undone like a trim (a rewrite kind)", () => {
    expect(REWRITE_KINDS).toContain("rewrite");
  });

  it("an agent cannot propose it: it only comes from an unattended WriteChapter", () => {
    const planned = planMove([{ id: "c3", chapterNumber: 3, wordCount: 1200 } as never], { kind: "rewrite", chapterNumber: 3 } as never);
    expect(planned.ok).toBe(false);
  });

  it("discarding its draft rejects it (there is nothing to re-draft)", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({ id: "m1", kind: "rewrite" });
    h.db.structureMove.updateMany.mockResolvedValue({ count: 1 });
    await discardRewriteDraft("m1", "b1");
    expect(h.db.structureMove.updateMany.mock.calls[0][0].data).toMatchObject({ status: "rejected" });
  });
});
