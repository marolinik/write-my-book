import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dev editor v2, phase B — trim and expand are moves too.
 *
 * Unlike reorder/merge/split they are not mechanical: accepting one makes a
 * draft the writer reads before anything is applied. What is checked here is
 * the proposal itself: a target the rewrite can honestly hit, and instructions
 * the ghostwriter can act on.
 */

const h = vi.hoisted(() => ({
  db: {
    chapter: { findMany: vi.fn() },
    structureMove: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

import { executeTool, getToolDefinitions } from "@/lib/agents/tools";
import { moveIdentityKey, planMove, type ChapterRef } from "@/lib/structure/moves";

const chapters: ChapterRef[] = [
  { id: "c1", chapterNumber: 1, title: "Zakletva", wordCount: 2000, actNumber: 1 },
  { id: "c2", chapterNumber: 2, title: "Pustinja", wordCount: 2800, actNumber: 1 },
  { id: "c3", chapterNumber: 3, title: "Put", wordCount: 900, actNumber: 1 },
];

const instructions =
  "Skrati opis puta do manastira (tri pasusa posle „Prvih nekoliko kilometara\") i drugo čitanje pisma.";

describe("planMove — trim", () => {
  it("plans a trim of an existing chapter to a smaller target", () => {
    const r = planMove(chapters, { kind: "trim", chapterId: "c2", chapterNumber: 2, targetWords: 2000, instructions });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.sourceChapterId).toBe("c2");
      expect(r.plan.ordering).toEqual([]);
    }
  });

  it("refuses a target that is not shorter", () => {
    const r = planMove(chapters, { kind: "trim", chapterNumber: 2, targetWords: 2800, instructions });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("target_out_of_range");
  });

  it("refuses cutting more than 60%: that is a summary, not a trim", () => {
    const r = planMove(chapters, { kind: "trim", chapterNumber: 2, targetWords: 1000, instructions });
    expect(r.ok).toBe(false);
  });

  it("refuses a trim without instructions the ghostwriter can act on", () => {
    const r = planMove(chapters, { kind: "trim", chapterNumber: 2, targetWords: 2000, instructions: "kraće" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("instructions_required");
  });

  it("follows its chapter by id when numbers shifted", () => {
    const shifted = chapters.map((c) => (c.id === "c2" ? { ...c, chapterNumber: 5 } : c));
    const r = planMove(shifted, { kind: "trim", chapterId: "c2", chapterNumber: 2, targetWords: 2000, instructions });
    expect(r.ok).toBe(true);
  });
});

describe("planMove — expand", () => {
  it("plans an expansion to a larger target", () => {
    const r = planMove(chapters, { kind: "expand", chapterNumber: 3, targetWords: 1400, instructions });
    expect(r.ok).toBe(true);
  });

  it("refuses a target that is not larger", () => {
    const r = planMove(chapters, { kind: "expand", chapterNumber: 3, targetWords: 900, instructions });
    expect(r.ok).toBe(false);
  });

  it("refuses more than doubling a chapter in one rewrite", () => {
    const r = planMove(chapters, { kind: "expand", chapterNumber: 3, targetWords: 2000, instructions });
    expect(r.ok).toBe(false);
  });
});

describe("moveIdentityKey — one rewrite per chapter at a time", () => {
  it("treats two trims of the same chapter as the same move whatever the target", () => {
    expect(
      moveIdentityKey({ kind: "trim", chapterId: "c2", chapterNumber: 2, targetWords: 2000, instructions })
    ).toBe(
      moveIdentityKey({ kind: "trim", chapterId: "c2", chapterNumber: 2, targetWords: 1800, instructions: "x" })
    );
  });

  it("tells a trim from an expansion", () => {
    expect(
      moveIdentityKey({ kind: "trim", chapterId: "c2", chapterNumber: 2, targetWords: 2000, instructions })
    ).not.toBe(
      moveIdentityKey({ kind: "expand", chapterId: "c2", chapterNumber: 2, targetWords: 3000, instructions })
    );
  });
});

describe("ProposeStructureMove — trim and expand", () => {
  const ctx = {
    bookId: "b1",
    userId: "u1",
    sessionId: "root",
    agentType: "story-architect",
    documentService: {} as never,
    language: "sr",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.db.chapter.findMany.mockResolvedValue(chapters);
    h.db.structureMove.findMany.mockResolvedValue([]);
    h.db.structureMove.updateMany.mockResolvedValue({ count: 0 });
    h.db.structureMove.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "m1",
      ...data,
    }));
  });

  it("files a trim with its target and instructions", async () => {
    await executeTool("ProposeStructureMove", ctx as never, {
      kind: "trim",
      chapterNumbers: [2],
      targetWords: 2000,
      instructions,
      reason: "Pustinja je najduže poglavlje i usporava srednji deo.",
      confidence: 0.6,
    });
    const payload = JSON.parse(h.db.structureMove.create.mock.calls[0][0].data.payload);
    expect(payload).toMatchObject({ kind: "trim", chapterId: "c2", targetWords: 2000 });
    expect(payload.instructions).toContain("Prvih nekoliko kilometara");
  });

  it("refuses a trim with no target", async () => {
    const out = await executeTool("ProposeStructureMove", ctx as never, {
      kind: "trim",
      chapterNumbers: [2],
      instructions,
      reason: "Predugo.",
      confidence: 0.6,
    });
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/rejected/i);
  });

  it("offers trim and expand to the model, with a target and instructions", () => {
    const def = getToolDefinitions(["ProposeStructureMove"])[0];
    const props = def.input_schema.properties as Record<string, { enum?: string[] }>;
    expect(props.kind.enum).toEqual(expect.arrayContaining(["trim", "expand"]));
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["targetWords", "instructions"]));
  });
});
