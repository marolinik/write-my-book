/**
 * The canon check runs while the writer types, so it must only ask about what
 * changed, write its notes where the writer already looks, and never touch
 * the book when the judge fails.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { paragraphHash } from "@/lib/continuity/canon-check";

const ENV = { CANON_CHECK_ENABLED: "1", TYPESAFE_API_KEY: "k" };
const P1 = "Ime mi je Dimitrije Milovanović, major. Ovo pišem u Beogradu, na kraju 1918. godine.";
const P2 = "Vetar ih je dočekao čim su izašli iz kafane, prejak za to doba godine.";
const CHAPTER = ["# Glava", P1, P2].join("\n\n");

function mockWorld(opts: { cached?: string[]; fail?: boolean; bible?: string | null } = {}) {
  const findings: Array<Record<string, unknown>> = [];
  const cacheRows: Array<Record<string, unknown>> = [];
  const asked: string[] = [];
  vi.doMock("@/lib/db", () => ({
    db: {
      book: { findUnique: vi.fn(async () => ({ language: "sr" })) },
      canonCheck: {
        findMany: vi.fn(async () => (opts.cached ?? []).map((h) => ({ paragraphHash: h }))),
        createMany: vi.fn(async (args: { data: Array<Record<string, unknown>> }) => {
          cacheRows.push(...args.data);
          return { count: args.data.length };
        }),
      },
      editFinding: {
        createMany: vi.fn(async (args: { data: Array<Record<string, unknown>> }) => {
          findings.push(...args.data);
          return { count: args.data.length };
        }),
      },
    },
  }));
  vi.doMock("@/lib/editorial/book-evidence", () => ({
    readChapterText: vi.fn(async () => CHAPTER),
    readVoiceFingerprint: vi.fn(async () => null),
    readStoryBible: vi.fn(async () => (opts.bible === undefined ? "Dimitrije je pukovnik." : opts.bible)),
  }));
  vi.doMock("@typesafe-ai/sdk", () => ({
    TypeSafeClient: class {
      async systemOne(req: { state: { passages?: string[]; sentences?: string[] } }) {
        // The API rejects unknown top-level fields with 400: only these two may go.
        if (Object.keys(req).sort().join() !== "questions,state") throw new Error("400 Invalid request.");
        if (opts.fail) throw new Error("upstream 503");
        if (req.state.passages) {
          asked.push(...req.state.passages);
          return {
            answers: Object.fromEntries(
              req.state.passages.map((p, i) => [`p${i}`, { type: "noul", noul: p.includes("major") ? 0.9 : 0.1 }])
            ),
          };
        }
        return {
          answers: Object.fromEntries(
            (req.state.sentences ?? []).map((s, i) => [`s${i}`, { type: "noul", noul: s.includes("major") ? 0.93 : 0.05 }])
          ),
        };
      }
    },
  }));
  return { findings, cacheRows, asked };
}

describe("checkChapterCanon", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does nothing when it is switched off", async () => {
    const world = mockWorld();
    const { checkChapterCanon } = await import("@/lib/continuity/canon-check-service");
    expect((await checkChapterCanon({ bookId: "b", chapterNumber: 1, env: {} })).reason).toBe("disabled");
    expect(world.asked).toHaveLength(0);
  });

  it("does nothing for a book without a story bible: there is no canon to break", async () => {
    const world = mockWorld({ bible: null });
    const { checkChapterCanon } = await import("@/lib/continuity/canon-check-service");
    expect((await checkChapterCanon({ bookId: "b", chapterNumber: 1, env: ENV })).reason).toBe("no-bible");
    expect(world.asked).toHaveLength(0);
  });

  it("points a continuity note at the contradicting sentence, in the book's language", async () => {
    const world = mockWorld();
    const { checkChapterCanon } = await import("@/lib/continuity/canon-check-service");
    const result = await checkChapterCanon({ bookId: "b", chapterNumber: 1, env: ENV });

    expect(result).toMatchObject({ judged: 2, cached: 0, flagged: 1 });
    const sr = getAgentStrings("sr");
    expect(world.findings).toHaveLength(1);
    expect(world.findings[0]).toMatchObject({
      bookId: "b",
      chapterNumber: 1,
      agentType: "canon-judge",
      category: "continuity",
      severity: "important",
      paragraphNumber: 2,
      anchorQuote: "Ime mi je Dimitrije Milovanović, major.",
      description: sr.canonFinding,
      suggestion: sr.canonSuggestion,
      status: "pending",
    });
    expect(world.cacheRows).toHaveLength(2);
  });

  it("only asks about paragraphs it has not judged against this bible", async () => {
    const world = mockWorld({ cached: [paragraphHash(P1)] });
    const { checkChapterCanon } = await import("@/lib/continuity/canon-check-service");
    const result = await checkChapterCanon({ bookId: "b", chapterNumber: 1, env: ENV });
    expect(world.asked).toEqual([P2]);
    expect(result).toMatchObject({ judged: 1, cached: 1, flagged: 0 });
  });

  it("writes nothing, not even the cache, when the judge fails", async () => {
    const world = mockWorld({ fail: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkChapterCanon } = await import("@/lib/continuity/canon-check-service");
    expect((await checkChapterCanon({ bookId: "b", chapterNumber: 1, env: ENV })).reason).toBe("failed");
    expect(world.findings).toHaveLength(0);
    expect(world.cacheRows).toHaveLength(0);
  });
});
