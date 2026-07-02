// tests/unit/ambient-sources.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getChapterEntities: vi.fn(),
  getPlotThreads: vi.fn(),
  getBookCharacterStates: vi.fn(),
  styleFindFirst: vi.fn(),
  findByType: vi.fn(),
  readPinned: vi.fn(),
}));

vi.mock("@/lib/graph/graph-queries", () => ({
  getChapterEntities: h.getChapterEntities,
  getPlotThreads: h.getPlotThreads,
  getBookCharacterStates: h.getBookCharacterStates,
}));
vi.mock("@/lib/db", () => ({ db: { styleProfile: { findFirst: h.styleFindFirst } } }));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
  },
}));
vi.mock("@/generated/prisma/enums", () => ({ DocumentType: { CHAPTER_CONTENT: "CHAPTER_CONTENT" } }));

import {
  getOnStageNames,
  getPriorCharacters,
  getOpenThreads,
  getStyleBaseline,
  getCurrentChapterMetrics,
} from "@/lib/series/ambient-sources";

beforeEach(() => vi.clearAllMocks());

describe("getPriorCharacters", () => {
  it("flattens per-book states, tagging bookNumber", async () => {
    h.getBookCharacterStates.mockResolvedValueOnce([
      { name: "Milan", aliases: ["Cap"], role: "supporting", status: "alive", lastMentioned: 18, firstAppearance: 2, description: "d" },
    ]);
    const out = await getPriorCharacters([{ id: "b1", bookNumber: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0].bookNumber).toBe(1);
    expect(out[0].name).toBe("Milan");
  });

  it("isolates a failing book — others still return", async () => {
    h.getBookCharacterStates
      .mockRejectedValueOnce(new Error("neo4j down"))
      .mockResolvedValueOnce([{ name: "Ana", aliases: [], role: "minor", status: "alive", lastMentioned: 3, firstAppearance: 1, description: null }]);
    const out = await getPriorCharacters([{ id: "b1", bookNumber: 1 }, { id: "b2", bookNumber: 2 }]);
    expect(out.map((c) => c.name)).toEqual(["Ana"]);
  });

  it("throws when ALL prior books fail (so the route flags graph offline)", async () => {
    h.getBookCharacterStates.mockRejectedValue(new Error("neo4j down"));
    await expect(
      getPriorCharacters([{ id: "b1", bookNumber: 1 }, { id: "b2", bookNumber: 2 }])
    ).rejects.toThrow();
  });
});

describe("getOnStageNames", () => {
  it("returns the chapter's character names", async () => {
    h.getChapterEntities.mockResolvedValueOnce({ characters: ["Milan", "Ana"], locations: [], events: [], objects: [] });
    expect(await getOnStageNames("b2", 7)).toEqual(["Milan", "Ana"]);
  });
});

describe("getOpenThreads", () => {
  it("keeps only unresolved threads and maps relatedNames", async () => {
    h.getPlotThreads.mockResolvedValueOnce({
      threads: [
        { name: "Open", type: "mystery", status: "developing", introducedChapter: 4, resolvedChapter: undefined, relatedCharacters: ["Milan"] },
        { name: "Done", type: "main", status: "resolved", introducedChapter: 1, resolvedChapter: 20, relatedCharacters: ["Ana"] },
      ],
    });
    const out = await getOpenThreads([{ id: "b1", bookNumber: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Open", bookNumber: 1, relatedNames: ["Milan"] });
  });

  it("isolates a failing book — others still return", async () => {
    h.getPlotThreads
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ threads: [{ name: "T", type: "mystery", status: "developing", introducedChapter: 2, resolvedChapter: undefined, relatedCharacters: ["Ana"] }] });
    const out = await getOpenThreads([{ id: "b1", bookNumber: 1 }, { id: "b2", bookNumber: 2 }]);
    expect(out.map((t) => t.name)).toEqual(["T"]);
  });

  it("throws when ALL prior books fail", async () => {
    h.getPlotThreads.mockRejectedValue(new Error("down"));
    await expect(getOpenThreads([{ id: "b1", bookNumber: 1 }])).rejects.toThrow();
  });
});

describe("getStyleBaseline", () => {
  it("maps a StructuredFingerprint into StyleMetrics", async () => {
    h.styleFindFirst.mockResolvedValueOnce({
      sourceBookNumber: 1,
      metrics: { sentenceLength: { mean: 18 }, dialogueRatio: 0.25, paragraphLength: { mean: 4 } },
    });
    const out = await getStyleBaseline("u1", ["b1", "b2"]);
    expect(out.baselineBookNumber).toBe(1);
    expect(out.metrics).toEqual({ avgWordsPerSentence: 18, dialogueRatio: 0.25, avgSentencesPerParagraph: 4 });
  });

  it("returns nulls when no profile exists", async () => {
    h.styleFindFirst.mockResolvedValueOnce(null);
    const out = await getStyleBaseline("u1", ["b1"]);
    expect(out).toEqual({ metrics: null, baselineBookNumber: null });
  });

  it("returns null metrics (but keeps bookNumber) when metrics JSON is null", async () => {
    h.styleFindFirst.mockResolvedValueOnce({ sourceBookNumber: 1, metrics: null });
    expect(await getStyleBaseline("u1", ["b1"])).toEqual({ metrics: null, baselineBookNumber: 1 });
  });

  it("returns null metrics when fingerprint fields are the wrong type", async () => {
    h.styleFindFirst.mockResolvedValueOnce({
      sourceBookNumber: 1,
      metrics: { sentenceLength: { mean: "18" }, dialogueRatio: 0.2, paragraphLength: { mean: 4 } },
    });
    expect(await getStyleBaseline("u1", ["b1"])).toEqual({ metrics: null, baselineBookNumber: 1 });
  });
});

describe("getCurrentChapterMetrics", () => {
  it("returns null when no chapter-content document exists", async () => {
    h.findByType.mockResolvedValueOnce(null);
    expect(await getCurrentChapterMetrics("u1", "b2", 7)).toBeNull();
  });

  it("computes metrics from the document content", async () => {
    h.findByType.mockResolvedValueOnce({ id: "doc1" });
    h.readPinned.mockResolvedValueOnce({ content: "He ran fast. She followed.", document: { currentVersion: 1 } });
    const m = await getCurrentChapterMetrics("u1", "b2", 7);
    expect(m).not.toBeNull();
    expect(m!.avgWordsPerSentence).toBeCloseTo(2.5, 5); // (3 + 2) / 2 sentences
  });
});
