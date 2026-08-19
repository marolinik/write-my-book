import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * D-31 regression: an LLM extraction that returns an EMPTY result (zero
 * entities AND zero relationships) on substantive prose was recorded as
 * SUCCESS by updateFromChapter():
 *
 *   1. removeChapterEntities() had ALREADY deleted the chapter's previous
 *      graph contribution (delete ran before extraction), and
 *   2. setContentHash() stamped the chapter's content-hash unconditionally,
 *
 * so the content-hash skip treated every future scan of the unchanged chapter
 * as a no-op — the chapter's entities never entered the graph, silently,
 * forever (until the writer happened to edit the text). Empirically proven in
 * the QA campaign (trace 24: ch3 "successful" re-extraction with zero graph
 * delta; the pre-existing ch3-only Event node was destroyed and never
 * recreated).
 *
 * Fix contract (asserted here):
 *   1. SUSPICIOUS EMPTY (substantive content, zero entities AND zero
 *      relationships) → treated as a FAILED extraction: content-hash is NOT
 *      stamped, the prior graph contribution is NOT deleted, and the next
 *      scan retries extraction.
 *   2. PLAUSIBLY EMPTY (content below a small word threshold, e.g. a 3-word
 *      chapter) → stamped as a normal success so trivial chapters do not
 *      re-extract (and re-bill) forever.
 *   3. The failure is observable: a marker (lastEmptyExtractionAt /
 *      emptyExtractionCount) is written on the Chapter node and the throttle
 *      timestamp (updatedAt) is bumped so the 90s scan throttle still spaces
 *      retries — WITHOUT touching contentHash.
 *   4. No regression: genuine extractions still stamp the hash and skip
 *      unchanged content; the D-30 bookId injection is preserved.
 */

type Meta = Record<string, unknown>;

const h = vi.hoisted(() => ({
  /** every Cypher call: query text + params */
  calls: [] as Array<{ query: string; params: Record<string, unknown> }>,
  /** Chapter meta nodes: key `bookId:chapterNumber` → properties */
  chapters: new Map<string, Meta>(),
  extractCalls: [] as Array<{ text: string; bookId: string; chapterNumber: number }>,
  extractImpl: null as
    | null
    | ((text: string, bookId: string, chapterNumber: number) => unknown),
  upsertCalls: [] as unknown[],
  removeCalls: [] as Array<{ bookId: string; chapterNumber: number }>,
}));

vi.mock("@/lib/graph/entity-extractor", () => ({
  hashContent: (text: string) => `h${text.length}:${text.slice(0, 8)}`,
  extractEntities: async (
    text: string,
    bookId: string,
    chapterNumber: number
  ) => {
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
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Record<string, unknown> = {}) => {
        h.calls.push({ query, params });
        // Story-bible queries hardcode chapterNumber 0 in the Cypher and omit
        // the param; chapter queries always pass it.
        const key = `${String(params.bookId)}:${String(params.chapterNumber ?? 0)}`;

        // ── getContentHash / getStoryBibleHash ──
        if (query.includes("RETURN c.contentHash AS hash")) {
          const meta = h.chapters.get(key);
          if (!meta) return { records: [] };
          const hash = meta.contentHash;
          return {
            records: [{ get: () => (typeof hash === "string" ? hash : null) }],
          };
        }

        // ── setContentHash / setStoryBibleHash (the poisoned stamp) ──
        if (query.includes("c.contentHash = $hash")) {
          const existing = h.chapters.get(key) ?? {};
          h.chapters.set(key, {
            ...existing,
            contentHash: params.hash,
            updatedAt: new Date().toISOString(),
          });
          return { records: [] };
        }

        // ── suspicious-empty failure marker (post-fix observability) ──
        if (query.includes("lastEmptyExtractionAt")) {
          const existing = h.chapters.get(key) ?? {};
          h.chapters.set(key, {
            ...existing,
            lastEmptyExtractionAt: new Date().toISOString(),
            emptyExtractionCount: (Number(existing.emptyExtractionCount) || 0) + 1,
            updatedAt: new Date().toISOString(),
          });
          return { records: [] };
        }

        return { records: [] };
      },
    };
    return fn(session);
  },
}));

import {
  updateFromChapter,
  updateFromStoryBible,
} from "@/lib/graph/graph-maintenance";
import { hashContent } from "@/lib/graph/entity-extractor";
import type { ExtractionResult } from "@/lib/graph/types";

const BOOK = "book-d31";
const CH = 3;

/** Substantive prose: well above any sensible "trivial chapter" word floor. */
const SUBSTANTIVE = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
/** A trivial 2-word chapter where an empty extraction is plausible. */
const TRIVIAL = "The End.";

function result(
  text: string,
  chapterNumber: number,
  over: Partial<ExtractionResult> = {}
): ExtractionResult {
  return {
    bookId: BOOK,
    entities: [],
    relationships: [],
    chapterNumber,
    contentHash: hashContent(text),
    ...over,
  };
}

function emptyResult(text: string, chapterNumber: number): ExtractionResult {
  return result(text, chapterNumber);
}

function genuineResult(text: string, chapterNumber: number): ExtractionResult {
  return result(text, chapterNumber, {
    entities: [
      {
        name: "Corvin Ashe",
        label: "Character",
        properties: { role: "protagonist", status: "alive" },
      },
    ],
    relationships: [],
  });
}

const chapterMeta = () => h.chapters.get(`${BOOK}:${CH}`);
const bibleMeta = () => h.chapters.get(`${BOOK}:0`);

beforeEach(() => {
  h.calls.length = 0;
  h.chapters.clear();
  h.extractCalls.length = 0;
  h.extractImpl = null;
  h.upsertCalls.length = 0;
  h.removeCalls.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("D-31: suspicious empty extraction must not be recorded as success", () => {
  it("does NOT stamp the content-hash when substantive prose yields zero entities and zero relationships", async () => {
    h.extractImpl = (text, _b, ch) => emptyResult(text, ch);

    const res = await updateFromChapter(BOOK, CH, SUBSTANTIVE);

    expect(res.updated).toBe(false);
    // The poisoned stamp: pre-fix this held hashContent(SUBSTANTIVE).
    expect(chapterMeta()?.contentHash).toBeUndefined();
  });

  it("retries extraction on the next scan of the UNCHANGED chapter (no poisoned skip)", async () => {
    h.extractImpl = (text, _b, ch) => emptyResult(text, ch);

    await updateFromChapter(BOOK, CH, SUBSTANTIVE);
    await updateFromChapter(BOOK, CH, SUBSTANTIVE);

    // Pre-fix: the first call stamped the hash, so the second was a silent
    // no-op (extractEntities called exactly once — the loss was permanent).
    expect(h.extractCalls.length).toBe(2);
  });

  it("does NOT delete the chapter's prior graph contribution on a suspicious empty", async () => {
    h.extractImpl = (text, _b, ch) => emptyResult(text, ch);

    await updateFromChapter(BOOK, CH, SUBSTANTIVE);

    // Pre-fix: removeChapterEntities ran BEFORE extraction, so the empty
    // flake destroyed the chapter's existing nodes/edges (trace 24: the
    // "Eleventh Day Assault" Event died and was never recreated).
    expect(h.removeCalls).toEqual([]);
  });

  it("writes an observable failure marker and bumps the throttle timestamp — without touching the hash", async () => {
    h.extractImpl = (text, _b, ch) => emptyResult(text, ch);

    const res = await updateFromChapter(BOOK, CH, SUBSTANTIVE);
    expect(res.suspiciousEmpty).toBe(true);

    const meta = chapterMeta();
    expect(meta?.lastEmptyExtractionAt).toBeDefined();
    expect(meta?.emptyExtractionCount).toBe(1);
    // updatedAt bumped → getChapterNodeUpdatedAt() still feeds the 90s scan
    // throttle, so retries stay spaced (bounded billing, D-28 not worsened).
    expect(meta?.updatedAt).toBeDefined();
    expect(meta?.contentHash).toBeUndefined();

    // A second flake increments the counter (ops can see stuck chapters).
    await updateFromChapter(BOOK, CH, SUBSTANTIVE);
    expect(chapterMeta()?.emptyExtractionCount).toBe(2);

    // The marker write must never carry the content-hash stamp.
    const markerCalls = h.calls.filter((c) =>
      c.query.includes("lastEmptyExtractionAt")
    );
    expect(markerCalls.length).toBeGreaterThan(0);
    for (const c of markerCalls) {
      expect(c.query).not.toMatch(/contentHash/);
    }
  });

  it("a hard extraction failure (throw) also leaves the prior graph contribution intact", async () => {
    h.extractImpl = () => {
      throw new Error("No API key available for entity extraction");
    };

    const res = await updateFromChapter(BOOK, CH, SUBSTANTIVE);

    expect(res).toMatchObject({ updated: false, entitiesFound: 0 });
    expect(chapterMeta()?.contentHash).toBeUndefined();
    // Pre-fix, delete-then-fail re-destroyed surviving data on EVERY failing
    // attempt after a content edit (D-31 fix direction 2 / D-28 destructive
    // side). Extraction must run before the destructive delete.
    expect(h.removeCalls).toEqual([]);
  });
});

describe("D-31: plausibly empty (trivial content) still stamps — no infinite re-billing", () => {
  it("stamps the hash for a trivial chapter with a legitimately empty result and skips the next scan", async () => {
    h.extractImpl = (text, _b, ch) => emptyResult(text, ch);

    const res = await updateFromChapter(BOOK, CH, TRIVIAL);

    expect(res.updated).toBe(true);
    expect(chapterMeta()?.contentHash).toBe(hashContent(TRIVIAL));
    // Stale entities of the previous content version still get cleaned up.
    expect(h.removeCalls).toEqual([{ bookId: BOOK, chapterNumber: CH }]);

    await updateFromChapter(BOOK, CH, TRIVIAL);
    expect(h.extractCalls.length).toBe(1); // content-hash skip intact
  });
});

describe("D-31: no regression to the genuine extraction path", () => {
  it("stamps the hash, upserts, and skips the unchanged re-scan when entities are found", async () => {
    h.extractImpl = (text, _b, ch) => genuineResult(text, ch);

    const res = await updateFromChapter(BOOK, CH, SUBSTANTIVE);

    expect(res).toMatchObject({ updated: true, entitiesFound: 1 });
    expect(chapterMeta()?.contentHash).toBe(hashContent(SUBSTANTIVE));
    expect(h.removeCalls).toEqual([{ bookId: BOOK, chapterNumber: CH }]);
    expect(h.upsertCalls.length).toBe(1);

    // D-30: the authoritative bookId is injected into every entity AND kept
    // on the result before the graph write.
    const upserted = h.upsertCalls[0] as ExtractionResult;
    expect(upserted.bookId).toBe(BOOK);
    expect(upserted.entities[0].properties.bookId).toBe(BOOK);

    await updateFromChapter(BOOK, CH, SUBSTANTIVE);
    expect(h.extractCalls.length).toBe(1); // content-hash skip intact
  });

  it("entities WITH zero relationships on substantive prose is NOT suspicious (AND-criterion)", async () => {
    h.extractImpl = (text, _b, ch) => genuineResult(text, ch); // 1 entity, 0 rels

    const res = await updateFromChapter(BOOK, CH, SUBSTANTIVE);

    expect(res.updated).toBe(true);
    expect(res.suspiciousEmpty).toBeUndefined();
    expect(chapterMeta()?.contentHash).toBe(hashContent(SUBSTANTIVE));
  });

  it("empty/whitespace content still returns early without extracting", async () => {
    h.extractImpl = (text, _b, ch) => emptyResult(text, ch);

    const res = await updateFromChapter(BOOK, CH, "   ");

    expect(res).toMatchObject({ updated: false, entitiesFound: 0 });
    expect(h.extractCalls).toEqual([]);
  });
});

describe("D-31: story bible has the same poisoned-success mechanism", () => {
  it("suspicious empty on a substantive bible does NOT stamp; next run retries", async () => {
    h.extractImpl = (text) => result(text, 0);

    await updateFromStoryBible(BOOK, SUBSTANTIVE);
    expect(bibleMeta()?.contentHash).toBeUndefined();

    await updateFromStoryBible(BOOK, SUBSTANTIVE);
    expect(h.extractCalls.length).toBe(2);
  });

  it("plausibly empty bible content stamps normally", async () => {
    h.extractImpl = (text) => result(text, 0);

    await updateFromStoryBible(BOOK, TRIVIAL);

    expect(bibleMeta()?.contentHash).toBe(hashContent(TRIVIAL));
    await updateFromStoryBible(BOOK, TRIVIAL);
    expect(h.extractCalls.length).toBe(1);
  });

  it("genuine bible extraction still stamps (no regression)", async () => {
    h.extractImpl = (text) => genuineResult(text, 0);

    await updateFromStoryBible(BOOK, SUBSTANTIVE);

    expect(bibleMeta()?.contentHash).toBe(hashContent(SUBSTANTIVE));
    expect(h.upsertCalls.length).toBe(1);
  });
});
