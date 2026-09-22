/**
 * The stock-prose check has to land where the writer already looks, and say
 * "look again", not "a machine wrote this".
 *
 * A marked paragraph becomes a `prose` suggestion, so it shows in Lektura, is
 * triaged with everything else and can be applied or dismissed like any other
 * note. It is written in the book's language, because the judge produces no
 * prose of its own to show.
 *
 * A paragraph that already carries a pending prose-level note is not asked
 * about again, and running the pass twice over the same text writes nothing new.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

const long = (seed: string) => `${seed} ${"reč ".repeat(60)}`.trim();
const CHAPTER = [long("Prvi"), long("Drugi"), long("Treći")].join("\n\n");
const ENV = { STOCK_PROSE_ENABLED: "1", TYPESAFE_API_KEY: "k" };

function mockWorld(opts: {
  alreadyNoted?: number[];
  answers?: (passages: string[]) => Record<string, unknown>;
  fail?: boolean;
}) {
  const created: Array<Record<string, unknown>> = [];
  const sent: string[][] = [];
  let skipDuplicates: boolean | undefined;
  let overlapQuery: unknown;

  vi.doMock("@/lib/db", () => ({
    db: {
      book: { findUnique: vi.fn(async () => ({ language: "sr" })) },
      editFinding: {
        findMany: vi.fn(async (args: { where: { category: unknown } }) => {
          overlapQuery = args.where.category;
          return (opts.alreadyNoted ?? []).map((n) => ({ paragraphNumber: n }));
        }),
        createMany: vi.fn(async (args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => {
          created.push(...args.data);
          skipDuplicates = args.skipDuplicates;
          return { count: args.data.length };
        }),
      },
    },
  }));
  vi.doMock("@/lib/editorial/book-evidence", () => ({
    readChapterText: vi.fn(async () => CHAPTER),
    readVoiceFingerprint: vi.fn(async () => null),
  }));
  vi.doMock("@typesafe-ai/sdk", () => ({
    TypeSafeClient: class {
      async systemOne(req: { state: { passages: string[] } }) {
        if (opts.fail) throw new Error("upstream 503");
        sent.push(req.state.passages);
        return { answers: opts.answers?.(req.state.passages) ?? {} };
      }
    },
  }));
  return { created, sent, skipDuplicates: () => skipDuplicates, overlapQuery: () => overlapQuery };
}

/** Level 3 of 4, confidently, for "Drugi"; level 0 for everything else. */
const markSecond = (passages: string[]) =>
  Object.fromEntries(
    passages.map((p, i) => [
      `p${i}`,
      { type: "score", score: p.startsWith("Drugi") ? 3 : 0, confidence: 0.6 },
    ])
  );

describe("checkChapterStockProse", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does nothing at all when it is switched off", async () => {
    const world = mockWorld({ answers: markSecond });
    const { checkChapterStockProse } = await import("@/lib/editorial/stock-prose-service");
    const result = await checkChapterStockProse({ bookId: "b", chapterNumber: 2, env: {} });
    expect(result.reason).toBe("disabled");
    expect(world.sent).toHaveLength(0);
    expect(world.created).toHaveLength(0);
  });

  it("leaves a prose suggestion to check, in the book's language, never an AI-tell verdict", async () => {
    const world = mockWorld({ answers: markSecond });
    const { checkChapterStockProse } = await import("@/lib/editorial/stock-prose-service");
    const result = await checkChapterStockProse({ bookId: "b", chapterNumber: 2, sessionId: "s", env: ENV });

    expect(result).toMatchObject({ judged: 3, marked: 1, requests: 1 });
    expect(world.created).toHaveLength(1);
    const sr = getAgentStrings("sr");
    expect(world.created[0]).toMatchObject({
      bookId: "b",
      chapterNumber: 2,
      sessionId: "s",
      agentType: "stock-prose-judge",
      category: "prose",
      severity: "suggestion",
      paragraphNumber: 2,
      description: sr.stockProseFinding,
      suggestion: sr.stockProseSuggestion,
      status: "pending",
    });
    expect(String(world.created[0].anchorQuote).startsWith("Drugi")).toBe(true);
    expect(world.skipDuplicates()).toBe(true);
  });

  it("does not ask again about a paragraph that already carries a prose-level note", async () => {
    const world = mockWorld({ alreadyNoted: [2], answers: markSecond });
    const { checkChapterStockProse } = await import("@/lib/editorial/stock-prose-service");
    await checkChapterStockProse({ bookId: "b", chapterNumber: 2, env: ENV });
    expect(world.overlapQuery()).toEqual({ in: ["prose", "ai-tell", "anti-ai", "crutch-phrase"] });
    expect(world.sent.flat().some((p) => p.startsWith("Drugi"))).toBe(false);
    expect(world.created).toHaveLength(0);
  });

  it("gives the same paragraph the same hash, so a second run writes nothing new", async () => {
    const first = mockWorld({ answers: markSecond });
    const a = await import("@/lib/editorial/stock-prose-service");
    await a.checkChapterStockProse({ bookId: "b", chapterNumber: 2, env: ENV });
    vi.resetModules();
    const second = mockWorld({ answers: markSecond });
    const b = await import("@/lib/editorial/stock-prose-service");
    await b.checkChapterStockProse({ bookId: "b", chapterNumber: 2, env: ENV });
    expect(first.created[0].contentHash).toBe(second.created[0].contentHash);
  });

  it("leaves the book exactly as it was when the judge fails", async () => {
    const world = mockWorld({ fail: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkChapterStockProse } = await import("@/lib/editorial/stock-prose-service");
    const result = await checkChapterStockProse({ bookId: "b", chapterNumber: 2, env: ENV });
    expect(result.reason).toBe("failed");
    expect(world.created).toHaveLength(0);
  });
});
