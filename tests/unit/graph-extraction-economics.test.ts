import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * D-73 silent-failure economics of updateFromChapter() — the hardening layer on
 * top of RC-4:
 *
 * - E4: the cap counter is SPLIT. Suspicious-EMPTY (unparseable content) keeps
 *   the content-edit-gated cap; a hard FAILURE (provider throw / infra flake)
 *   feeds a SEPARATE counter bounded by a TIME-DECAYING backoff, NOT a prose
 *   edit — so 5 provider outages the writer didn't cause never force an edit,
 *   and the cheapest (~0-token) failure class self-heals when the provider
 *   returns. `failureKind` + `failureReason` distinguish the two.
 * - E6: a POST-SPEND infra throw (extraction billed, then remove/upsert/stamp
 *   flakes) marks FAILED, counts toward the backoff cap, and returns an HONEST
 *   failed envelope — never the skip-shaped {updated:false} that == an unchanged
 *   skip and re-bills every scan with no ceiling.
 *
 * The mock wires BOTH counters' read-back + a controllable clock (h.clock) so
 * the backoff windows are deterministic.
 */

interface ChapterRow {
  contentHash: string | null;
  emptyExtractionCount: number;
  lastEmptyHash: string | null;
  lastEmptyExtractionAt: string | null;
  failedExtractionCount: number;
  lastFailedExtractionAt: string | null;
  lastFailureReason: string | null;
  lowYield: boolean;
  updatedAt: string | null;
}

const h = vi.hoisted(() => ({
  store: new Map<string, ChapterRow>(),
  clock: new Date("2026-07-19T10:00:00.000Z").getTime(),
  extractCalls: [] as Array<{ text: string; bookId: string; chapterNumber: number }>,
  extractImpl: null as
    | null
    | ((text: string, bookId: string, chapterNumber: number) => unknown),
  upsertCalls: [] as unknown[],
  upsertThrows: false,
  removeCalls: [] as Array<{ bookId: string; chapterNumber: number }>,
}));

function keyOf(params: Record<string, unknown>): string {
  return `${String(params.bookId)}:${String(params.chapterNumber ?? 0)}`;
}

function blankRow(): ChapterRow {
  return {
    contentHash: null,
    emptyExtractionCount: 0,
    lastEmptyHash: null,
    lastEmptyExtractionAt: null,
    failedExtractionCount: 0,
    lastFailedExtractionAt: null,
    lastFailureReason: null,
    lowYield: false,
    updatedAt: null,
  };
}

function getOrCreate(key: string): ChapterRow {
  let row = h.store.get(key);
  if (!row) {
    row = blankRow();
    h.store.set(key, row);
  }
  return row;
}

function record(obj: Record<string, unknown>) {
  return { get: (k: string) => obj[k] };
}

const nowIso = () => new Date(h.clock).toISOString();

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
    if (h.upsertThrows) throw new Error("neo4j write flake (post-spend)");
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
        // getExtractionState (both counters)
        if (query.includes("c.emptyExtractionCount AS emptyCount")) {
          const row = h.store.get(key);
          return {
            records: row
              ? [
                  record({
                    emptyCount: row.emptyExtractionCount,
                    lastEmptyHash: row.lastEmptyHash,
                    failedCount: row.failedExtractionCount,
                    lastFailedAt: row.lastFailedExtractionAt,
                    lastFailureReason: row.lastFailureReason,
                  }),
                ]
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
                    failedExtractionCount: row.failedExtractionCount,
                    lastFailedExtractionAt: row.lastFailedExtractionAt,
                    lastFailureReason: row.lastFailureReason,
                    lowYield: row.lowYield,
                    updatedAt: row.updatedAt,
                  }),
                ]
              : [],
          };
        }
        // markSuspiciousEmptyExtraction (empty marker, per-content-version)
        if (query.includes("CASE WHEN c.lastEmptyHash")) {
          const row = getOrCreate(key);
          const emptyHash = String(params.emptyHash);
          row.emptyExtractionCount =
            row.lastEmptyHash === emptyHash ? row.emptyExtractionCount + 1 : 1;
          row.lastEmptyHash = emptyHash;
          row.lastEmptyExtractionAt = nowIso();
          row.updatedAt = nowIso();
          return { records: [] };
        }
        // markFailedExtraction (hard-failure marker, unconditional increment)
        if (query.includes("c.failedExtractionCount = coalesce")) {
          const row = getOrCreate(key);
          row.failedExtractionCount = row.failedExtractionCount + 1;
          row.lastFailedExtractionAt = nowIso();
          row.lastFailureReason = String(params.reason);
          row.updatedAt = nowIso();
          return { records: [] };
        }
        // setContentHash / setStoryBibleHash (success stamp + reset BOTH counters)
        if (query.includes("c.contentHash = $hash")) {
          const row = getOrCreate(key);
          row.contentHash = String(params.hash);
          row.emptyExtractionCount = 0;
          row.lastEmptyHash = null;
          row.lastEmptyExtractionAt = null;
          row.failedExtractionCount = 0;
          row.lastFailedExtractionAt = null;
          row.lastFailureReason = null;
          row.lowYield = params.lowYield === true;
          row.updatedAt = nowIso();
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
  MAX_EMPTY_EXTRACTION_ATTEMPTS,
  MAX_FAILED_EXTRACTION_ATTEMPTS,
  FAILED_BACKOFF_MS,
} from "@/lib/graph/graph-maintenance";
import type { ExtractionOutcome } from "@/lib/graph/entity-extractor";

const BOOK = "book-econ";
const CH = 7;
const SUBSTANTIVE = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
const LARGE = Array.from({ length: 900 }, (_, i) => `w${i}`).join(" ");
const SHORT = "It failed."; // below the suspicious-empty word floor

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

/** updateFromChapter with the injected test clock as `now`. */
const run = (content: string) =>
  updateFromChapter(BOOK, CH, content, undefined, undefined, undefined, new Date(h.clock));

const row = () => h.store.get(`${BOOK}:${CH}`);

beforeEach(() => {
  h.store.clear();
  h.clock = new Date("2026-07-19T10:00:00.000Z").getTime();
  h.extractCalls.length = 0;
  h.upsertCalls.length = 0;
  h.removeCalls.length = 0;
  h.extractImpl = null;
  h.upsertThrows = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("D-73 E4: EMPTY cap is content-edit-gated", () => {
  it("caps suspicious-empty after MAX_EMPTY on unchanged content (skips LLM, no bill)", async () => {
    h.extractImpl = () => outcome({}); // empty on substantive prose
    let last: Awaited<ReturnType<typeof run>> | undefined;
    for (let i = 0; i < MAX_EMPTY_EXTRACTION_ATTEMPTS + 3; i++) {
      last = await run(SUBSTANTIVE);
    }
    expect(h.extractCalls.length).toBe(MAX_EMPTY_EXTRACTION_ATTEMPTS);
    expect(last?.capped).toBe(true);
    expect(last?.failureKind).toBe("empty");
    expect(last?.suspiciousEmpty).toBe(true);
    expect(row()?.contentHash).toBeNull(); // never stamped
  });

  it("a content edit resets the empty cap and re-enables extraction", async () => {
    h.extractImpl = () => outcome({});
    for (let i = 0; i < MAX_EMPTY_EXTRACTION_ATTEMPTS + 2; i++) await run(SUBSTANTIVE);
    expect(h.extractCalls.length).toBe(MAX_EMPTY_EXTRACTION_ATTEMPTS);

    const edited = SUBSTANTIVE + " and then everything changed.";
    h.extractImpl = () => genuine(2);
    const res = await run(edited);

    expect(res.updated).toBe(true);
    expect(h.extractCalls.length).toBe(MAX_EMPTY_EXTRACTION_ATTEMPTS + 1);
    expect(row()?.contentHash).toBe(`h${edited.length}:${edited.slice(0, 8)}`);
    expect(row()?.emptyExtractionCount).toBe(0);
  });
});

describe("D-73 E4: FAILED cap is backoff-gated, NOT edit-gated", () => {
  it("caps hard failures after MAX_FAILED and exposes a backoff retry time", async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "provider 503" });
    let last: Awaited<ReturnType<typeof run>> | undefined;
    for (let i = 0; i < MAX_FAILED_EXTRACTION_ATTEMPTS + 3; i++) last = await run(SUBSTANTIVE);

    expect(h.extractCalls.length).toBe(MAX_FAILED_EXTRACTION_ATTEMPTS);
    expect(last?.capped).toBe(true);
    expect(last?.failed).toBe(true);
    expect(last?.failureKind).toBe("failed");
    expect(last?.retryEligibleAt).toBe(h.clock + FAILED_BACKOFF_MS);
    expect(row()?.contentHash).toBeNull();
  });

  it("editing the prose does NOT lift a failed cap inside the backoff window (it is infra, not content)", async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "503" });
    for (let i = 0; i < MAX_FAILED_EXTRACTION_ATTEMPTS + 1; i++) await run(SUBSTANTIVE);
    expect(h.extractCalls.length).toBe(MAX_FAILED_EXTRACTION_ATTEMPTS);

    // A prose edit changes the hash — which WOULD reset an empty cap — but the
    // failed cap is time-gated, so within the backoff window it stays capped.
    const res = await run(SUBSTANTIVE + " edited within the outage.");
    expect(res.capped).toBe(true);
    expect(res.failureKind).toBe("failed");
    expect(h.extractCalls.length).toBe(MAX_FAILED_EXTRACTION_ATTEMPTS); // no new spend
  });

  it("past the backoff window a probe runs again and a success self-heals the counter", async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "503" });
    for (let i = 0; i < MAX_FAILED_EXTRACTION_ATTEMPTS + 1; i++) await run(SUBSTANTIVE);
    expect(h.extractCalls.length).toBe(MAX_FAILED_EXTRACTION_ATTEMPTS);

    // Provider recovers; the backoff window elapses.
    h.clock += FAILED_BACKOFF_MS + 1;
    h.extractImpl = () => genuine(2);
    const res = await run(SUBSTANTIVE);

    expect(res.updated).toBe(true);
    expect(h.extractCalls.length).toBe(MAX_FAILED_EXTRACTION_ATTEMPTS + 1); // one probe
    expect(row()?.failedExtractionCount).toBe(0); // self-healed
  });
});

describe("D-73 E4: the two failure classes feed SEPARATE counters", () => {
  it("a hard failure increments only the FAILED counter and reports failureKind='failed'", async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "429 rate limited" });
    const res = await run(SUBSTANTIVE);
    expect(res.failed).toBe(true);
    expect(res.failureKind).toBe("failed");
    expect(res.failureReason).toBe("429 rate limited");
    expect(row()?.failedExtractionCount).toBe(1);
    expect(row()?.emptyExtractionCount).toBe(0);
    expect(row()?.lastFailureReason).toBe("429 rate limited");
  });

  it("a suspicious-empty increments only the EMPTY counter and reports failureKind='empty'", async () => {
    h.extractImpl = () => outcome({});
    const res = await run(SUBSTANTIVE);
    expect(res.suspiciousEmpty).toBe(true);
    expect(res.failureKind).toBe("empty");
    expect(row()?.emptyExtractionCount).toBe(1);
    expect(row()?.failedExtractionCount).toBe(0);
  });

  it("honors `failed` even on SHORT content (a failure is a failure at any length)", async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "503" });
    const res = await run(SHORT);
    expect(res.updated).toBe(false);
    expect(res.failed).toBe(true);
    expect(res.failureKind).toBe("failed");
    expect(row()?.contentHash).toBeNull(); // not stamped
    expect(row()?.failedExtractionCount).toBe(1);
  });
});

describe("D-73 E6: post-spend infra window is honest + bounded", () => {
  it("a post-spend upsert throw marks FAILED and returns an honest envelope (never skip-shaped)", async () => {
    h.extractImpl = () => genuine(2); // extraction SUCCEEDS (tokens billed)
    h.upsertThrows = true; // then the persistence write flakes
    const res = await run(SUBSTANTIVE);

    expect(res.updated).toBe(false);
    expect(res.failed).toBe(true); // NOT the {updated:false} skip shape
    expect(res.suspiciousEmpty).toBe(true);
    expect(res.failureKind).toBe("failed");
    expect(row()?.contentHash).toBeNull(); // not stamped
    expect(row()?.failedExtractionCount).toBe(1); // attempt counted
  });

  it("a persistent post-spend infra outage is bounded by the failed cap (no unbounded re-spend)", async () => {
    h.extractImpl = () => genuine(2);
    h.upsertThrows = true; // Neo4j writes down for the whole outage
    for (let i = 0; i < MAX_FAILED_EXTRACTION_ATTEMPTS + 3; i++) await run(SUBSTANTIVE);

    // After the cap, updateFromChapter returns BEFORE extractEntities — the
    // billed LLM call is skipped, so re-spend is bounded (this is the E6 fix).
    expect(h.extractCalls.length).toBe(MAX_FAILED_EXTRACTION_ATTEMPTS);
  });
});

describe("D-73: reset-on-success clears both counters + idempotent recovery", () => {
  it("a genuine success after a hard failure clears the failed counter and skips a re-scan", async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "503" });
    await run(SUBSTANTIVE);
    expect(row()?.failedExtractionCount).toBe(1);

    h.extractImpl = () => genuine(2);
    const ok = await run(SUBSTANTIVE);
    expect(ok.updated).toBe(true);
    expect(row()?.failedExtractionCount).toBe(0);
    expect(row()?.emptyExtractionCount).toBe(0);

    const before = h.extractCalls.length;
    await run(SUBSTANTIVE); // unchanged content → content-hash skip
    expect(h.extractCalls.length).toBe(before);
  });
});

describe("D-73 E7: story-bible cap parity (keyed on chapter 0)", () => {
  const bibleRow = () => h.store.get(`${BOOK}:0`);
  const runBible = (content: string) =>
    updateFromStoryBible(BOOK, content, undefined, undefined, undefined, new Date(h.clock));

  it("caps suspicious-empty bible extraction after MAX_EMPTY unchanged saves", async () => {
    h.extractImpl = () => outcome({}); // empty on substantive bible
    for (let i = 0; i < MAX_EMPTY_EXTRACTION_ATTEMPTS + 3; i++) await runBible(SUBSTANTIVE);
    expect(h.extractCalls.length).toBe(MAX_EMPTY_EXTRACTION_ATTEMPTS);
    expect(bibleRow()?.contentHash).toBeNull(); // never stamped
  });

  it("caps hard-failure bible extraction after MAX_FAILED (backoff-gated)", async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "503" });
    for (let i = 0; i < MAX_FAILED_EXTRACTION_ATTEMPTS + 3; i++) await runBible(SUBSTANTIVE);
    expect(h.extractCalls.length).toBe(MAX_FAILED_EXTRACTION_ATTEMPTS);
    expect(bibleRow()?.failedExtractionCount).toBe(MAX_FAILED_EXTRACTION_ATTEMPTS);
  });

  it("bounds a post-spend infra outage on the bible (E6 parity)", async () => {
    h.extractImpl = () => genuine(2);
    h.upsertThrows = true;
    for (let i = 0; i < MAX_FAILED_EXTRACTION_ATTEMPTS + 2; i++) await runBible(SUBSTANTIVE);
    expect(h.extractCalls.length).toBe(MAX_FAILED_EXTRACTION_ATTEMPTS);
  });

  it("a genuine bible success stamps the hash, resets markers, and skips a re-save", async () => {
    h.extractImpl = () => outcome({ failed: true, failureReason: "503" });
    await runBible(SUBSTANTIVE);
    expect(bibleRow()?.failedExtractionCount).toBe(1);

    h.extractImpl = () => genuine(2);
    await runBible(SUBSTANTIVE);
    expect(bibleRow()?.contentHash).toBe(`h${SUBSTANTIVE.length}:${SUBSTANTIVE.slice(0, 8)}`);
    expect(bibleRow()?.failedExtractionCount).toBe(0);

    const before = h.extractCalls.length;
    await runBible(SUBSTANTIVE); // unchanged → hash skip
    expect(h.extractCalls.length).toBe(before);
  });
});

describe("RC-4: minimum-yield advisory (unchanged under D-73)", () => {
  it("flags lowYield on implausibly sparse extraction of large prose (but still stamps)", async () => {
    h.extractImpl = () => genuine(1); // 1 entity, 0 rels on ~900 words
    const res = await run(LARGE);
    expect(res.updated).toBe(true);
    expect(res.lowYield).toBe(true);
    expect(row()?.contentHash).toBe(`h${LARGE.length}:${LARGE.slice(0, 8)}`);
  });

  it("does NOT flag lowYield when the large prose yields a plausible graph", async () => {
    h.extractImpl = () => genuine(6);
    const res = await run(LARGE);
    expect(res.updated).toBe(true);
    expect(res.lowYield).toBeUndefined();
  });

  it("does NOT flag lowYield on small prose (sparse is expected there)", async () => {
    h.extractImpl = () => genuine(1);
    const res = await run(SUBSTANTIVE); // 120 words
    expect(res.updated).toBe(true);
    expect(res.lowYield).toBeUndefined();
  });
});
