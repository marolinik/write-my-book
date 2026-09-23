/**
 * Reading the manuscript before setup must never stand in the way of setup:
 * off without its flag, silent on a book with too little prose, and a failure
 * means the conversation asks, as it always did.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

const ENV = { SETUP_FACTS_ENABLED: "1", TYPESAFE_API_KEY: "k" };

function mockWorld(opts: { chapters?: Record<number, string>; fail?: boolean } = {}) {
  const sent: Array<Record<string, unknown>> = [];
  vi.doMock("@/lib/editorial/book-evidence", () => ({
    readChapterText: vi.fn(async (_b: string, ch: number) => opts.chapters?.[ch] ?? null),
  }));
  vi.doMock("@typesafe-ai/sdk", () => ({
    TypeSafeClient: class {
      async systemOne(req: Record<string, unknown>) {
        if (Object.keys(req).sort().join() !== "questions,state") throw new Error("400 Invalid request.");
        if (opts.fail) throw new Error("upstream 503");
        sent.push(req);
        return {
          answers: {
            pov: { type: "choice", choice: "third-limited", confidence: 0.97, probabilities: {} },
            tense: { type: "choice", choice: "past", confidence: 0.99, probabilities: {} },
            genre: { type: "choice", choice: "historical", confidence: 1, probabilities: {} },
          },
        };
      }
    },
  }));
  return { sent };
}

describe("readManuscriptFacts", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does nothing when it is switched off", async () => {
    const world = mockWorld({ chapters: { 1: "x".repeat(5000) } });
    const { readManuscriptFacts } = await import("@/lib/setup/manuscript-facts-service");
    expect(await readManuscriptFacts("b", {})).toBeNull();
    expect(world.sent).toHaveLength(0);
  });

  it("stays silent on a book without enough prose to read", async () => {
    const world = mockWorld({ chapters: { 1: "Kratko." } });
    const { readManuscriptFacts } = await import("@/lib/setup/manuscript-facts-service");
    expect(await readManuscriptFacts("b", ENV)).toBeNull();
    expect(world.sent).toHaveLength(0);
  });

  it("reads across the opening chapters and returns what is settled", async () => {
    const world = mockWorld({ chapters: { 1: "a".repeat(1000), 2: "b".repeat(1000) } });
    const { readManuscriptFacts } = await import("@/lib/setup/manuscript-facts-service");
    expect(await readManuscriptFacts("b", ENV)).toEqual({ pov: "third-limited", tense: "past", genre: "historical" });
    const opening = (world.sent[0].state as { manuscript_opening: string }).manuscript_opening;
    expect(opening).toContain("a");
    expect(opening).toContain("b");
  });

  it("returns null, so setup asks, when the judge fails", async () => {
    mockWorld({ chapters: { 1: "x".repeat(5000) }, fail: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { readManuscriptFacts } = await import("@/lib/setup/manuscript-facts-service");
    expect(await readManuscriptFacts("b", ENV)).toBeNull();
  });
});
