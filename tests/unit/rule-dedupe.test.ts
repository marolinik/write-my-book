/**
 * One decision, one rule.
 *
 * The owner explained "the signet and the brass template are two separate
 * objects" in three threads, and two of them each saved the rule: one short,
 * one longer and more specific. Measured over every pair of active rules in
 * the database (13 pairs): asking "same decision?" and "does the new one cover
 * everything the old one asks?", the two real duplicates reached 0.57 and 0.77
 * on one question or the other; every other pair stayed at or under 0.12.
 * Neither question alone separated both.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildDedupeRequest,
  readDedupe,
  pickDuplicate,
  keepOf,
  MAX_RULES_PER_REQUEST,
} from "@/lib/agents/rule-dedupe";

const existing = [
  { id: "a", content: "Drži pečatnjak (Glavnjača) i mesinganu mustru (Studenica) kao dva odvojena predmeta." },
  { id: "b", content: "Treat the separate letter to Milena as a closed beat." },
];

describe("buildDedupeRequest", () => {
  it("asks both questions against every existing rule", () => {
    const { state, questions } = buildDedupeRequest("Drži mesingani pečatnjak Crne ruke i ravnalo odvojeno.", existing);
    expect(state).toEqual({ new_rule: "Drži mesingani pečatnjak Crne ruke i ravnalo odvojeno.", existing_rules: existing.map((e) => e.content) });
    expect(Object.keys(questions).sort()).toEqual(["covers_0", "covers_1", "same_0", "same_1"]);
    expect(questions.same_1.instructions).toContain("`existing_rules[1]`");
  });

  it("keeps a request small enough that position does not decide", () => {
    expect(MAX_RULES_PER_REQUEST).toBeLessThanOrEqual(6);
    const many = Array.from({ length: MAX_RULES_PER_REQUEST + 1 }, (_, i) => ({ id: `r${i}`, content: "x" }));
    expect(() => buildDedupeRequest("y", many)).toThrow();
  });
});

describe("readDedupe and pickDuplicate", () => {
  it("takes the stronger of the two answers for each rule", () => {
    const scores = readDedupe(
      {
        same_0: { type: "noul", noul: 0.34 },
        covers_0: { type: "noul", noul: 0.57 },
        same_1: { type: "noul", noul: 0.05 },
        covers_1: { type: "noul", noul: 0.09 },
      },
      existing
    );
    expect(scores).toEqual([{ id: "a", p: 0.57 }, { id: "b", p: 0.09 }]);
    expect(pickDuplicate(scores)).toEqual({ id: "a", p: 0.57 });
  });

  it("finds no duplicate among rules that only share a subject", () => {
    expect(pickDuplicate([{ id: "a", p: 0.12 }, { id: "b", p: 0.05 }])).toBeNull();
  });
});

describe("keepOf", () => {
  it("keeps the more detailed of two rules that say the same thing", () => {
    expect(keepOf({ id: "short", content: "Dva predmeta." }, { id: "long", content: "Dva predmeta: pečatnjak u Glavnjači, ravnalo u Studenici." })).toBe("long");
  });
});

describe("supersedeDuplicateRule", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  function mockWorld(noul: (key: string) => number, fail = false) {
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    vi.doMock("@/lib/db", () => ({
      db: {
        writerMemory: {
          findUnique: vi.fn(async () => ({ id: "new", userId: "u", bookId: "b", content: "Drži mesingani pečatnjak Crne ruke (Prolog, ostaje u Glavnjači) i mesingano ravnalo / pisarsku mustru (porodično, nađeno u Studenici) kao dva predmeta; nikad ih ne spajaj." })),
          findMany: vi.fn(async () => existing),
          update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
            updates.push({ id: args.where.id, data: args.data });
            return {};
          }),
        },
      },
    }));
    vi.doMock("@typesafe-ai/sdk", () => ({
      TypeSafeClient: class {
        async systemOne(req: { questions: Record<string, unknown> }) {
          if (Object.keys(req).sort().join() !== "questions,state") throw new Error("400 Invalid request.");
          if (fail) throw new Error("upstream 503");
          return { answers: Object.fromEntries(Object.keys(req.questions).map((k) => [k, { type: "noul", noul: noul(k) }])) };
        }
      },
    }));
    return updates;
  }
  const ENV = { RULE_DEDUPE_ENABLED: "1", TYPESAFE_API_KEY: "k" };

  it("deactivates the shorter duplicate and never deletes it", async () => {
    const updates = mockWorld((k) => (k === "covers_0" ? 0.57 : 0.05));
    const { supersedeDuplicateRule } = await import("@/lib/agents/rule-dedupe-service");
    const result = await supersedeDuplicateRule({ memoryId: "new", env: ENV });
    expect(result).toEqual({ superseded: "a", kept: "new" });
    expect(updates).toEqual([{ id: "a", data: { active: false } }]);
  });

  it("does nothing when it is switched off, finds no duplicate, or the judge fails", async () => {
    let updates = mockWorld(() => 0.9);
    let mod = await import("@/lib/agents/rule-dedupe-service");
    expect(await mod.supersedeDuplicateRule({ memoryId: "new", env: {} })).toBeNull();
    expect(updates).toHaveLength(0);

    vi.resetModules();
    updates = mockWorld(() => 0.1);
    mod = await import("@/lib/agents/rule-dedupe-service");
    expect(await mod.supersedeDuplicateRule({ memoryId: "new", env: ENV })).toBeNull();
    expect(updates).toHaveLength(0);

    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
    updates = mockWorld(() => 0.9, true);
    mod = await import("@/lib/agents/rule-dedupe-service");
    expect(await mod.supersedeDuplicateRule({ memoryId: "new", env: ENV })).toBeNull();
    expect(updates).toHaveLength(0);
  });
});
