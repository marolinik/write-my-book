/**
 * Triaging a chapter: what it reads, what it stores, and what it refuses.
 *
 * The judgements are worth nothing if the pass around them is careless. This
 * is the part that decides which findings are sent, in what batches, and what
 * ends up on the row.
 *
 * What it must get right:
 *  - OFF unless both switches are set, like everything else here that spends;
 *  - only PENDING findings: a writer who already applied or dismissed a note
 *    does not need it ranked, and paying to rank it is waste;
 *  - batches respect the per-request cap rather than sending a book;
 *  - a finding that comes back unjudged keeps its old values instead of being
 *    written to null;
 *  - a failure leaves every row exactly as it was.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  chunkForTriage,
  triageConfigured,
  rowUpdateFor,
} from "@/lib/editorial/triage-service";
import { MAX_FINDINGS_PER_REQUEST } from "@/lib/editorial/finding-triage";

describe("the switch", () => {
  it("needs the key and the flag together", () => {
    expect(triageConfigured({})).toBe(false);
    expect(triageConfigured({ TYPESAFE_API_KEY: "k" })).toBe(false);
    expect(triageConfigured({ FINDING_TRIAGE_ENABLED: "1" })).toBe(false);
    expect(
      triageConfigured({ TYPESAFE_API_KEY: "k", FINDING_TRIAGE_ENABLED: "1" })
    ).toBe(true);
  });
});

describe("batching", () => {
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `f${i}`,
      category: "prose",
      severity: "suggestion",
      description: "x",
    }));

  it("sends one batch when the chapter fits", () => {
    expect(chunkForTriage(make(5))).toHaveLength(1);
  });

  it("never exceeds what one request should carry", () => {
    for (const batch of chunkForTriage(make(MAX_FINDINGS_PER_REQUEST * 2 + 3))) {
      expect(batch.length).toBeLessThanOrEqual(MAX_FINDINGS_PER_REQUEST);
    }
  });

  it("loses nothing on the way", () => {
    const all = make(47);
    const flat = chunkForTriage(all).flat();
    expect(flat).toHaveLength(47);
    expect(new Set(flat.map((f) => f.id)).size).toBe(47);
  });

  it("has no empty batch to spend a request on", () => {
    expect(chunkForTriage([])).toEqual([]);
    for (const batch of chunkForTriage(make(21))) {
      expect(batch.length).toBeGreaterThan(0);
    }
  });
});

describe("what lands on the row", () => {
  it("carries both judgements and the moment they were made", () => {
    const update = rowUpdateFor({
      findingId: "a",
      impact: 7.5,
      ruleConflict: 0.1,
      impactConfidence: 0.8,
    });
    expect(update.impactScore).toBe(7.5);
    expect(update.ruleConflict).toBe(0.1);
    expect(update.triagedAt).toBeInstanceOf(Date);
  });

  it("stores the raw judgement, not the ranking weight", () => {
    // The weight is policy. Storing it would freeze today's weighting into
    // the data and make changing it a migration.
    const update = rowUpdateFor({
      findingId: "a",
      impact: 9,
      ruleConflict: 0.9,
      impactConfidence: 0.8,
    });
    expect(update.impactScore).toBe(9);
    expect(Object.keys(update).sort()).toEqual(
      ["impactScore", "ruleConflict", "triagedAt"].sort()
    );
  });
});

describe("the pass itself", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does nothing at all when it is switched off", async () => {
    vi.resetModules();
    const updates: unknown[] = [];
    vi.doMock("@/lib/db", () => ({
      db: {
        editFinding: {
          findMany: vi.fn(async () => [{ id: "a" }]),
          update: vi.fn(async (args: unknown) => {
            updates.push(args);
            return {};
          }),
        },
      },
    }));
    const { triageChapter } = await import("@/lib/editorial/triage-service");
    const result = await triageChapter({
      bookId: "b",
      chapterNumber: 1,
      env: {},
    });
    expect(result.judged).toBe(0);
    expect(result.reason).toBe("disabled");
    expect(updates).toHaveLength(0);
  });
});
