import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Dev editor v2, phase D — the commercial lens. A run toggle chooses
 * "restructure-commercial": the same pass, read as a genre reader would.
 * The checks that can be computed are computed (where the story's turns fall
 * as a share of the book, how many chapters end on a hook, a sagging middle);
 * the model maps the beats and proposes moves, tagged, inside the same cap.
 */

const h = vi.hoisted(() => ({
  db: {
    chapter: { findMany: vi.fn() },
    chapterHookRating: { findMany: vi.fn() },
    structureMove: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  },
  getAnalysisReport: vi.fn(),
  docs: { findByType: vi.fn(), read: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/reports/analysis-report", () => ({ getAnalysisReport: h.getAnalysisReport }));

import { getWorkflow, isRestructureWorkflow } from "@/lib/agents/workflows";
import { CONDUCTOR_WORKFLOW_INSTRUCTIONS, WORKFLOW_INSTRUCTION_OVERRIDES } from "@/lib/agents/prompt-assembler";
import { executeTool } from "@/lib/agents/tools";
import { computeBookShape, commercialSignals, formatCommercialSignals } from "@/lib/structure/book-shape";
import { moveIdentityKey } from "@/lib/structure/moves";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

const w = (n: number, word: string) => Array.from({ length: n }, (_, i) => `${word}${i}`).join(" ");
const tenChapters = Array.from({ length: 10 }, (_, i) => ({
  id: `c${i + 1}`,
  chapterNumber: i + 1,
  title: `G${i + 1}`,
  content: w(1000, `x${i}`),
}));

describe("the commercial workflow", () => {
  it("is the restructure pass run by the architect, producing the same proposal", () => {
    const wf = getWorkflow("restructure-commercial");
    expect(wf).toBeDefined();
    expect(wf!.primaryAgent).toBe("story-architect");
    expect(wf!.conversational).toBe(true);
    expect(wf!.producesDocument).toBe("STRUCTURE_PROPOSAL");
  });

  it("counts as a restructure pass everywhere a pass has rules", () => {
    expect(isRestructureWorkflow("restructure")).toBe(true);
    expect(isRestructureWorkflow("restructure-commercial")).toBe(true);
    expect(isRestructureWorkflow("dev-edit")).toBe(false);
    expect(isRestructureWorkflow(undefined)).toBe(false);
    const tools = readFileSync(join(__dirname, "..", "..", "src", "lib", "agents", "tools.ts"), "utf-8");
    expect(tools).toMatch(/isRestructureWorkflow\(ctx\.workflowId\)/);
    expect(tools).toMatch(/isRestructureWorkflow\(input\.workflowId\)/);
  });

  it("tells the conductor to delegate it as the commercial pass", () => {
    expect(CONDUCTOR_WORKFLOW_INSTRUCTIONS["restructure-commercial"]).toMatch(/workflowId='restructure-commercial'/);
  });

  it("gives the architect the genre reader's checks", () => {
    const lens = WORKFLOW_INSTRUCTION_OVERRIDES["restructure-commercial"];
    expect(lens).toMatch(/MARKET_REPORT/);
    expect(lens).toMatch(/midpoint/i);
    expect(lens).toMatch(/genre/i);
  });

  it("has a name in every language", () => {
    for (const lang of ["en", "sr", "de", "es", "fr", "ru", "zh"]) {
      expect(JSON.stringify(getAgentStrings(lang))).toContain("restructure-commercial");
    }
  });
});

describe("commercialSignals", () => {
  const shape = computeBookShape(tenChapters);

  it("names the chapters where the story's turns are expected", () => {
    const s = commercialSignals(shape, {});
    expect(s.beats.inciting).toEqual([2]);
    expect(s.beats.midpoint).toEqual([5, 6]);
    expect(s.beats.darkMoment).toEqual([8]);
  });

  it("measures how many rated chapters end on a hook", () => {
    const hooks = new Map([
      [1, { opening: 1, ending: 3 }],
      [2, { opening: 1, ending: 0 }],
      [3, { opening: 2, ending: 2 }],
      [4, { opening: 0, ending: 1 }],
    ]);
    const s = commercialSignals(shape, { hooks });
    expect(s.hookedEndings).toEqual({ rated: 4, hooked: 2 });
  });

  it("finds the longest low-tension run in the middle of the book", () => {
    const tension = new Map([[1, 6], [2, 7], [3, 3], [4, 2], [5, 3], [6, 2], [7, 7], [8, 8], [9, 9], [10, 9]]);
    const s = commercialSignals(shape, { tension });
    expect(s.sag).toEqual({ from: 3, to: 6 });
  });

  it("reports no sag when no analysis gave tension", () => {
    expect(commercialSignals(shape, {}).sag).toBeNull();
  });

  it("formats as a section the architect can cite", () => {
    const text = formatCommercialSignals(commercialSignals(shape, {}));
    expect(text).toMatch(/COMMERCIAL/);
    expect(text).toContain("5, 6");
  });
});

describe("BookMap under the commercial lens", () => {
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
    h.db.chapter.findMany.mockResolvedValue(tenChapters.map(({ content: _c, ...c }) => c));
    h.docs.findByType.mockImplementation(async (_t: string, n: number) => ({ id: `d${n}` }));
    h.docs.read.mockImplementation(async (id: string) => ({ content: w(1000, id) }));
    h.getAnalysisReport.mockResolvedValue(null);
    h.db.chapterHookRating.findMany.mockResolvedValue([]);
  });

  it("adds the commercial checks only in the commercial pass", async () => {
    const plain = await executeTool("BookMap", { ...ctx, workflowId: "restructure" } as never, {});
    const lens = await executeTool("BookMap", { ...ctx, workflowId: "restructure-commercial" } as never, {});
    expect(plain).not.toMatch(/COMMERCIAL/);
    expect(lens).toMatch(/COMMERCIAL/);
  });
});

describe("moves the lens motivates are tagged", () => {
  const ctx = { bookId: "b1", userId: "u1", sessionId: "root", agentType: "story-architect", documentService: {} as never, language: "sr" };

  beforeEach(() => {
    vi.clearAllMocks();
    h.db.chapter.findMany.mockResolvedValue(
      tenChapters.map(({ content: _c, ...c }) => ({ ...c, wordCount: 1000, actNumber: 1 }))
    );
    h.db.structureMove.findMany.mockResolvedValue([]);
    h.db.structureMove.updateMany.mockResolvedValue({ count: 0 });
    h.db.structureMove.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data }));
  });

  it("ignores the lens outside the commercial pass", async () => {
    await executeTool("ProposeStructureMove", { ...ctx, workflowId: "restructure" } as never, {
      kind: "reorder", chapterNumbers: [4], targetPosition: 2, reason: "x", confidence: 0.6, lens: "commercial",
    });
    expect(JSON.parse(h.db.structureMove.create.mock.calls[0][0].data.payload).lens).toBeUndefined();
  });

  it("tags every move of the commercial pass, without making it a different move (live: the model never set it)", async () => {
    await executeTool("ProposeStructureMove", { ...ctx, workflowId: "restructure-commercial" } as never, {
      kind: "reorder", chapterNumbers: [4], targetPosition: 2, reason: "Pokretački događaj kasni.", confidence: 0.6,
    });
    const payload = JSON.parse(h.db.structureMove.create.mock.calls[0][0].data.payload);
    expect(payload.lens).toBe("commercial");
    expect(moveIdentityKey(payload)).toBe(moveIdentityKey({ ...payload, lens: undefined }));
  });
});
