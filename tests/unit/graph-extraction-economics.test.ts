import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * RC-4 silent-failure economics for updateFromChapter():
 *
 *  - A HARD LLM failure is not laundered into a clean/empty success
 *    (`failed` is honored, hash not stamped, graph not deleted).
 *  - Retries on a permanently-failing chapter are BOUNDED: at most
 *    MAX_EMPTY_EXTRACTION_ATTEMPTS billed LLM calls per content version, then
 *    extraction is SKIPPED entirely (no `extractEntities` call = no tokens).
 *  - Recovery is idempotent: editing the chapter (new content hash) resets the
 *    cap window and re-enables extraction; a genuine success clears the failing
 *    state so the graph reaches a correct state.
 *  - Minimum-yield: an implausibly sparse extraction on large prose is stamped
 *    but surfaced as a `lowYield` advisory (not a silent pass).
 *
 * Unlike the D-31 poison test, this mock wires the per-chapter counter READ-BACK
 * (emptyExtractionCount / lastEmptyHash) so the billing cap can actually fire.
 */

interface ChapterRow {
  contentHash: string | null;
  emptyExtractionCount: number;
  lastEmptyHash: string | null;
  lowYield: boolean;
  updatedAt: string | null;
  lastEmptyExtractionAt: string | null;
}

const h = vi.hoisted(() => ({
  store: new Map<string, ChapterRow>(),
  extractCalls: [] as Array<{ text: string; bookId: string; chapterNumber: number }>,
  extractImpl: null as
    | null
    | ((text: string, bookId: string, chapterNumber: number) => unknown),
  upsertCalls: [] as unknown[],
  removeCalls: [] as Array<{ bookId: string; chapterNumber: number }>,
}));

function keyOf(params: Record<string, unknown>): string {
  return `${String(params.bookId)}:${String(params.chapterNumber ?? 0)}`;
}
function rowFor(key: string): ChapterRow {
  let row = h.store.get(key);
  if (!row) {
    row = {
      contentHash: null,
      emptyExtractionCount: 0,
      lastEmptyHash: null,
      lowYield: false,
      updatedAt: null,
      lastEmptyExtractionAt: null,
    };
    h.store.set(key, row);
  }
  return row;
}
function record(obj: Record<string, unknown>) {
  return { get: (k: string) => obj[k] };
}

vi.mock("@/lib/graph/entity-extractor", () => ({
  hashContent: (text: string) => `h${text.length}:${text.slice(0, 8)}`,
  extractEntities: async (text: string, bookId: string, chapterNumber: number) => {
    h.extractCalls.push({ text, bookId, chapterNumber });
    if (!h.extractImpl) throw new Error("extractImpl not configured");
    return h.extractImpl(text, bookId, chapterNumber);
  },
}));

vi.mock("@/lib/graph/graph-builder", () => ({
  upsertEntities: async (result: unknown) => {
    h.upsertCalls.push(result);
    return { nodesCreated: 0, nodesUpdated: 0, relationshipsCreated: 0 };
  },
  removeChapterEntities: async (bookId: string, chapterNumber: number) => {
    h.removeCalls.push({ bookId, chapterNumber });
  },
}));

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (_mode: string, fn: (session: unknown) => Promise<unknown>) => {
    const session = {
      run: async (query: string, params: Record<string, unknown> = {}) => {
        const key = keyOf(params);

        // getContentHash / getStoryBibleHash
        if (query.includes("RETURN c.contentHash AS hash")) {
          const row = h.store.get(key);
          return { records: row ? [record({ hash: row.contentHash })] : [] };
        }
        // getEmptyExtractionState
        if (query.includes("c.emptyExtractionCount AS count")) {
          const row = h.store.get(key);
          return {
            records: row
              ? [record({ count: row.emptyExtractionCount, lastEmptyHash: row.lastEmptyHash })]
              : [],
          };
        }
        // getChapterExtractionFacts
        if (query.includes("RETURN c.contentHash AS contentHash")) {
          const row = h.store.get(key);
          return {
            records: row
              ? [
                  record({
                    contentHash: row.contentHash,
                    emptyExtractionCount: row.emptyExtractionCount,
                    lastEmptyExtractionAt: row.lastEmptyExtractionAt,
                    lowYield: row.lowYield,
                    updatedAt: row.updatedAt,
                  }),
                ]
              : [],
          };
        }
        // markSuspiciousEmptyExtraction (per-version counter)
        if (query.includes("CASE WHEN c.lastEmptyHash")) {
          const row = rowFor(key);
          const emptyHash = String(params.emptyHash);
          row.emptyExtractionCount =
            row.lastEmptyHash === emptyHash ? row.emptyExtractionCount + 1 : 1;
          row.lastEmptyHash = emptyHash;
          row.lastEmptyExtractionAt = new Date().toISOString();
          row.updatedAt = new Date().toISOString();
          return { records: [] };
        }
        // setContentHash (success → stamp + reset markers)
        if (query.includes("c.contentHash = $hash")) {
          const row = rowFor(key);
          row.contentHash = String(params.hash);
          row.emptyExtractionCount = 0;
          row.lastEmptyHash = null;
          row.lastEmptyExtractionAt = null;
          row.lowYield = params.lowYield === true;
          row.updatedAt = new Date().toISOString();
          return { records: [] };
        }
        return { records: [] };
      },
    };
    return fn(session);
  },
}));

import { updateFromChapter, MAX_EMPTY_EXTRACTION_ATTEMPTS } from "@/lib/graph/graph-maintenance";
import type { ExtractionOutcome } from "@/lib/graph/entity-extractor";

const BOOK = "book-econ";
const CH = 7;
const SUBSTANTIVE = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
const LARGE = Array.from({ length: 900 }, (_, i) => `w${i}`).join(" ");
const SHORT = "It failed."; // < 50 words

function outcome(over: Partial<ExtractionOutcome>): ExtractionOutcome {
  return {
    bookId: BOOK,
    entities: [],
    relationships: [],
    chapterNumber: CH,
    contentHash: "x",
    ...over,
  };
}
function genuine(entities = 3): ExtractionOutcome {
  return outcome({
    entities: Array.from({ length: entities }, (_, i) => ({
      name: `Char${i}`,
      label: "Character" as const,
      properties: { role: "supporting" },
    })),
  });
}

const row = () => h.store.get(`${BOOK}:${CH}`);

beforeEach(() => {
  h.store.clear();
  h.extractCalls.length = 0;
  h.upsertCalls.length = 0;
  h.removeCalls.length = 0;
  h.extractImpl = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("RC-4: hard LLM failure is honest, not a clean-empty success", () => {
  it("honors `failed` even on SHORT content (a failure is a failure at any length)", async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "provider 503" });

    const res = await updateFromChapter(BOOK, CH, SHORT);

    expect(res.updated).toBe(false);
    expect(res.failed).toBe(true);
    expect(res.suspiciousEmpty).toBe(true);
    // NOT stamped, prior graph NOT deleted → next scan retries.
    expect(row()?.contentHash).toBeNull();
    expect(h.removeCalls).toEqual([]);
  });
});

describe("RC-4: billing cap bounds retries on a permanently-failing chapter", () => {
  it(`stops calling the LLM after ${MAX_EMPTY_EXTRACTION_ATTEMPTS} attempts on unchanged content`, async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "always down" });

    let last;
    for (let i = 0; i < MAX_EMPTY_EXTRACTION_ATTEMPTS + 3; i++) {
      last = await updateFromChapter(BOOK, CH, SUBSTANTIVE);
    }

    // Billed LLM calls are capped; the extra scans skipped extraction entirely.
    expect(h.extractCalls.length).toBe(MAX_EMPTY_EXTRACTION_ATTEMPTS);
    expect(last?.capped).toBe(true);
    expect(last?.suspiciousEmpty).toBe(true);
    expect(last?.attempts).toBe(MAX_EMPTY_EXTRACTION_ATTEMPTS);
    expect(row()?.contentHash).toBeNull(); // still never stamped
  });

  it("a content edit resets the cap window and re-enables extraction", async () => {
    h.extractImpl = () => outcome({ failed: true });
    for (let i = 0; i < MAX_EMPTY_EXTRACTION_ATTEMPTS + 2; i++) {
      await updateFromChapter(BOOK, CH, SUBSTANTIVE);
    }
    expect(h.extractCalls.length).toBe(MAX_EMPTY_EXTRACTION_ATTEMPTS); // capped

    // Writer edits the chapter → new hash → fresh attempts, extraction runs again.
    const edited = SUBSTANTIVE + " and then everything changed.";
    h.extractImpl = () => genuine(2);
    const res = await updateFromChapter(BOOK, CH, edited);

    expect(res.updated).toBe(true);
    expect(h.extractCalls.length).toBe(MAX_EMPTY_EXTRACTION_ATTEMPTS + 1);
    // Recovery is complete: hash stamped, failing state cleared.
    expect(row()?.contentHash).toBe(`h${edited.length}:${edited.slice(0, 8)}`);
    expect(row()?.emptyExtractionCount).toBe(0);
  });
});

describe("RC-4: idempotent recovery + reset-on-success", () => {
  it("a success after a failure clears the counter and the next unchanged scan skips", async () => {
    h.extractImpl = () => outcome({ failed: true });
    await updateFromChapter(BOOK, CH, SUBSTANTIVE);
    expect(row()?.emptyExtractionCount).toBe(1);

    // Same content now extracts cleanly (transient provider blip resolved).
    h.extractImpl = () => genuine(2);
    const ok = await updateFromChapter(BOOK, CH, SUBSTANTIVE);
    expect(ok.updated).toBe(true);
    expect(row()?.emptyExtractionCount).toBe(0);
    expect(h.removeCalls).toEqual([{ bookId: BOOK, chapterNumber: CH }]);

    // Unchanged re-scan is a no-op — no re-extraction, no re-billing.
    const before = h.extractCalls.length;
    await updateFromChapter(BOOK, CH, SUBSTANTIVE);
    expect(h.extractCalls.length).toBe(before);
  });
});

describe("RC-4: minimum-yield advisory", () => {
  it("flags lowYield on large prose that reduced to almost nothing (still stamps)", async () => {
    h.extractImpl = () => genuine(1); // 1 entity, 0 rels on ~900 words
    const res = await updateFromChapter(BOOK, CH, LARGE);

    expect(res.updated).toBe(true);
    expect(res.lowYield).toBe(true);
    expect(row()?.contentHash).toBe(`h${LARGE.length}:${LARGE.slice(0, 8)}`);
    expect(row()?.lowYield).toBe(true);
  });

  it("does NOT flag lowYield when a large chapter yields a normal graph", async () => {
    h.extractImpl = () => genuine(6);
    const res = await updateFromChapter(BOOK, CH, LARGE);
    expect(res.updated).toBe(true);
    expect(res.lowYield).toBeUndefined();
  });

  it("does NOT flag lowYield on small prose (sparse is expected there)", async () => {
    h.extractImpl = () => genuine(1);
    const res = await updateFromChapter(BOOK, CH, SUBSTANTIVE); // 120 words
    expect(res.updated).toBe(true);
    expect(res.lowYield).toBeUndefined();
  });
});
