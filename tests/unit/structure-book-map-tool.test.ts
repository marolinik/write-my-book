import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dev editor v2, phase C — BookMap gives the architect the whole book's shape
 * in one call; RateHooks records how each chapter opens and ends, so the next
 * pass and the writer's book map can see it.
 */

const h = vi.hoisted(() => ({
  db: {
    chapter: { findMany: vi.fn() },
    chapterHookRating: { findMany: vi.fn(), upsert: vi.fn() },
  },
  getAnalysisReport: vi.fn(),
  docs: { findByType: vi.fn(), read: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/reports/analysis-report", () => ({ getAnalysisReport: h.getAnalysisReport }));

import { executeTool, getToolDefinitions } from "@/lib/agents/tools";

const w = (n: number, word: string) => Array.from({ length: n }, (_, i) => `${word}${i}`).join(" ");
const ctx = {
  bookId: "b1",
  userId: "u1",
  sessionId: "root-delegate-x",
  agentType: "story-architect",
  documentService: h.docs,
  language: "sr",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findMany.mockResolvedValue([
    { id: "c1", chapterNumber: 1, title: "Zakletva" },
    { id: "c2", chapterNumber: 2, title: "Pustinja" },
  ]);
  h.docs.findByType.mockImplementation(async (_t: string, n: number) => ({ id: `d${n}` }));
  h.docs.read.mockImplementation(async (id: string) => ({
    document: { currentVersion: 1 },
    content: id === "d1" ? w(800, "a") : w(2400, "b"),
  }));
  h.getAnalysisReport.mockResolvedValue({ hasReport: true, pacing: [{ chapter: 2, tension: 4, genreAvg: 6 }] });
  h.db.chapterHookRating.findMany.mockResolvedValue([{ chapterId: "c1", opening: 1, ending: 3 }]);
  h.db.chapterHookRating.upsert.mockResolvedValue({});
});

describe("BookMap", () => {
  it("returns the table and every chapter's edges without the full prose", async () => {
    const out = await executeTool("BookMap", ctx as never, {});
    expect(out).toContain("| 1 |");
    expect(out).toContain("| 2 |");
    expect(out).toContain("a0 a1");
    expect(out).toContain("b2399");
    expect(out).not.toContain("b1200 ");
  });

  it("brings in tension from the analysis and earlier hook ratings", async () => {
    const out = await executeTool("BookMap", ctx as never, {});
    expect(out).toMatch(/\| 2 \|[^\n]*\| 4 \|/);
    expect(out).toMatch(/\| 1 \|[^\n]*1\/3/);
  });

  it("is fenced to the session's book", async () => {
    await executeTool("BookMap", ctx as never, {});
    expect(h.db.chapter.findMany.mock.calls[0][0].where).toMatchObject({ bookId: "b1" });
    expect(h.db.chapterHookRating.findMany.mock.calls[0][0].where).toMatchObject({ bookId: "b1" });
  });
});

describe("RateHooks", () => {
  it("records each chapter's rating under the chapter's identity and the root pass", async () => {
    const out = await executeTool("RateHooks", ctx as never, {
      ratings: [
        { chapterNumber: 1, opening: 2, ending: 0, note: "Kraj se gasi." },
        { chapterNumber: 2, opening: 3, ending: 3 },
      ],
    });
    expect(h.db.chapterHookRating.upsert).toHaveBeenCalledTimes(2);
    const first = h.db.chapterHookRating.upsert.mock.calls[0][0];
    expect(first.where).toEqual({ chapterId: "c1" });
    expect(first.create).toMatchObject({ bookId: "b1", chapterId: "c1", sessionId: "root", opening: 2, ending: 0 });
    expect(out).toMatch(/2/);
  });

  it("skips a chapter that does not exist and clamps scores to 0-3", async () => {
    const out = await executeTool("RateHooks", ctx as never, {
      ratings: [
        { chapterNumber: 9, opening: 2, ending: 2 },
        { chapterNumber: 1, opening: 7, ending: -2 },
      ],
    });
    expect(h.db.chapterHookRating.upsert).toHaveBeenCalledTimes(1);
    expect(h.db.chapterHookRating.upsert.mock.calls[0][0].create).toMatchObject({ opening: 3, ending: 0 });
    expect(out).toContain("9");
  });
});

describe("review of run 3 (live)", () => {
  it("accepts ratings the model sent as a JSON string", async () => {
    const out = await executeTool("RateHooks", ctx as never, {
      ratings: JSON.stringify([{ chapterNumber: 1, opening: 2, ending: 1 }]),
    });
    expect(h.db.chapterHookRating.upsert).toHaveBeenCalledTimes(1);
    expect(out).toMatch(/1 chapter/);
  });

  it("caps full chapter reads in a restructure pass at six distinct chapters", async () => {
    const pass = { ...ctx, workflowId: "restructure", fullReads: new Set<number>() };
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const out = await executeTool("ReadChapter", pass as never, { chapterNumber: n });
      expect(out).not.toMatch(/limit/i);
    }
    const again = await executeTool("ReadChapter", pass as never, { chapterNumber: 3 });
    expect(again).not.toMatch(/limit/i);
    const seventh = await executeTool("ReadChapter", pass as never, { chapterNumber: 7 });
    expect(seventh).toMatch(/limit/i);
    expect(seventh).toContain("BookMap");
  });

  it("does not cap reads outside a restructure pass", async () => {
    const other = { ...ctx, workflowId: "dev-edit", fullReads: new Set<number>() };
    for (const n of [1, 2, 3, 4, 5, 6, 7]) await executeTool("ReadChapter", other as never, { chapterNumber: n });
    const out = await executeTool("ReadChapter", other as never, { chapterNumber: 8 });
    expect(out).not.toMatch(/limit/i);
  });
});

describe("review fixes", () => {
  it("skips a rating with a missing score instead of recording it as none", async () => {
    const out = await executeTool("RateHooks", ctx as never, { ratings: [{ chapterNumber: 1, opening: 2 }, null] });
    expect(h.db.chapterHookRating.upsert).not.toHaveBeenCalled();
    expect(out).toMatch(/skipped/i);
  });

  it("refuses ratings that are not a list", async () => {
    const out = await executeTool("RateHooks", ctx as never, { ratings: { chapterNumber: 1 } });
    expect(out).toMatch(/nothing recorded/i);
  });

  it("counts a chapter read by its number however the model typed it, and not a missing chapter", async () => {
    const pass = { ...ctx, workflowId: "restructure", fullReads: new Set<number>() };
    h.docs.findByType.mockImplementation(async (_t: string, n: number) => (n === 99 ? null : { id: `d${n}` }));
    await executeTool("ReadChapter", pass as never, { chapterNumber: 99 });
    for (const n of [1, "1", 2, 3, 4, 5, 6]) await executeTool("ReadChapter", pass as never, { chapterNumber: n });
    expect(pass.fullReads.size).toBe(6);
  });
});

describe("the architect has both tools", () => {
  it("offers BookMap and RateHooks", () => {
    const names = getToolDefinitions(["BookMap", "RateHooks"]).map((d) => d.name);
    expect(names).toEqual(expect.arrayContaining(["BookMap", "RateHooks"]));
  });
});
