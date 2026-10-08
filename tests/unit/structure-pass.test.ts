import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dev editor v2, phase A — one restructure run is ONE coherent pass.
 *
 * Live baseline (2026-10-08, copy of "Legat - Zavet"): the conductor delegated
 * to the architect three times, every delegation filed anew under its own
 * sub-session, and the panel showed 36 pending moves while the chat promised 6.
 * merge [24,25] was filed five times because each copy carried a different
 * model-written title, and dedup compared the whole payload.
 */

const h = vi.hoisted(() => ({
  db: {
    chapter: { findMany: vi.fn() },
    structureMove: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

import { executeTool, getToolDefinitions } from "@/lib/agents/tools";
import { moveIdentityKey, type StructureMoveInput } from "@/lib/structure/moves";
import { passIdOf, MAX_MOVES_PER_PASS } from "@/lib/structure/pass";

const ROOT = "root-session";
const ctx = {
  bookId: "b1",
  userId: "u1",
  sessionId: `${ROOT}-delegate-0b7c`,
  agentType: "story-architect",
  documentService: {} as never,
  language: "sr",
};

const chapters = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i + 1}`,
  chapterNumber: i + 1,
  title: `Glava ${i + 1}`,
  wordCount: 1500 + i * 10,
  actNumber: 1,
  status: "drafted",
}));

interface LiveRow {
  id: string;
  kind: string;
  payload: string;
  status: string;
  sessionId: string | null;
  alternativeToId: string | null;
  reason: string;
}

function liveMerge(
  id: string,
  numbers: number[],
  opts: Partial<LiveRow> & { title?: string } = {}
): LiveRow {
  const { title, ...rest } = opts;
  return {
    id,
    kind: "merge",
    payload: JSON.stringify({
      kind: "merge",
      chapterIds: numbers.map((n) => `c${n}`),
      chapterNumbers: numbers,
      title,
    }),
    status: "pending",
    sessionId: ROOT,
    alternativeToId: null,
    reason: `Spoji ${numbers.join("+")}`,
    ...rest,
  };
}

/** Seven pending primaries of the current pass: merges 1+2, 2+3, ... 7+8. */
function fullPass(): LiveRow[] {
  return Array.from({ length: 7 }, (_, i) => liveMerge(`p${i + 1}`, [i + 1, i + 2]));
}

const merge = (numbers: number[], extra: Record<string, unknown> = {}) => ({
  kind: "merge",
  chapterNumbers: numbers,
  reason: "Ista noć, dve polovine iste scene.",
  confidence: 0.7,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findMany.mockResolvedValue(chapters);
  h.db.structureMove.findMany.mockResolvedValue([]);
  h.db.structureMove.findFirst.mockResolvedValue(null);
  h.db.structureMove.updateMany.mockResolvedValue({ count: 0 });
  h.db.structureMove.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: "m-new", ...data })
  );
});

describe("moveIdentityKey — what makes two proposals the same move", () => {
  const a: StructureMoveInput = {
    kind: "merge",
    chapterIds: ["c24", "c25"],
    chapterNumbers: [24, 25],
    title: "Povratna putanja",
  };

  it("ignores the model-written title", () => {
    expect(moveIdentityKey(a)).toBe(moveIdentityKey({ ...a, title: "Pismeno o putu" }));
  });

  it("ignores the order the chapters were named in", () => {
    expect(moveIdentityKey(a)).toBe(
      moveIdentityKey({ ...a, chapterIds: ["c25", "c24"], chapterNumbers: [25, 24] })
    );
  });

  it("tells different chapters apart", () => {
    expect(moveIdentityKey(a)).not.toBe(
      moveIdentityKey({ ...a, chapterIds: ["c25", "c26"], chapterNumbers: [25, 26] })
    );
  });

  it("tells a different split point apart, but not different spacing", () => {
    const split: StructureMoveInput = {
      kind: "split",
      chapterId: "c28",
      chapterNumber: 28,
      anchorQuote: "U staroj kući Aleksandar je još jednom",
    };
    expect(moveIdentityKey(split)).toBe(
      moveIdentityKey({ ...split, anchorQuote: "U  staroj kući\nAleksandar je još jednom ", secondTitle: "X" })
    );
    expect(moveIdentityKey(split)).not.toBe(
      moveIdentityKey({ ...split, anchorQuote: "Prvih nekoliko kilometara" })
    );
  });
});

describe("passIdOf — every delegation of one run files into one pass", () => {
  it("maps a delegate's sub-session to its root session", () => {
    expect(passIdOf(`${ROOT}-delegate-0b7c-11`)).toBe(ROOT);
    expect(passIdOf(ROOT)).toBe(ROOT);
  });

  it("stores the move under the root session", async () => {
    await executeTool("ProposeStructureMove", ctx as never, merge([2, 3]));
    expect(h.db.structureMove.create.mock.calls[0][0].data.sessionId).toBe(ROOT);
  });
});

describe("ProposeStructureMove — the same move is never filed twice", () => {
  it("refuses a merge already on the table under a different title", async () => {
    h.db.structureMove.findMany.mockResolvedValue([
      liveMerge("m-old", [2, 3], { title: "Povratna putanja" }),
    ]);
    const out = await executeTool(
      "ProposeStructureMove",
      ctx as never,
      merge([2, 3], { title: "Pismeno o putu" })
    );
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toContain("m-old");
  });

  it("refuses a move the writer already applied in an earlier pass", async () => {
    h.db.structureMove.findMany.mockResolvedValue([
      liveMerge("m-old", [2, 3], { status: "applied", sessionId: "older" }),
    ]);
    await executeTool("ProposeStructureMove", ctx as never, merge([2, 3]));
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
  });
});

describe("review fixes", () => {
  it("re-files a move an older pass left pending, instead of skipping it and then retiring it", async () => {
    h.db.structureMove.findMany.mockResolvedValue([
      liveMerge("old", [2, 3], { sessionId: "older" }),
    ]);
    await executeTool("ProposeStructureMove", ctx as never, merge([2, 3]));
    expect(h.db.structureMove.create).toHaveBeenCalledTimes(1);
  });

  it("does not refuse a reorder just because the same reorder was applied earlier", async () => {
    h.db.structureMove.findMany.mockResolvedValue([
      {
        id: "r-old",
        kind: "reorder",
        payload: JSON.stringify({ kind: "reorder", chapterId: "c4", chapterNumber: 4, targetPosition: 2 }),
        status: "applied",
        sessionId: "older",
        alternativeToId: null,
        reason: "x",
      },
    ]);
    await executeTool("ProposeStructureMove", ctx as never, {
      kind: "reorder",
      chapterNumbers: [4],
      targetPosition: 2,
      reason: "Opet napred.",
      confidence: 0.6,
    });
    expect(h.db.structureMove.create).toHaveBeenCalledTimes(1);
  });

  it("serializes filings of one pass, so parallel calls cannot overshoot the cap", async () => {
    const rows: LiveRow[] = fullPass().slice(0, 6);
    h.db.structureMove.findMany.mockImplementation(async () => [...rows]);
    h.db.structureMove.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      await new Promise((r) => setTimeout(r, 5));
      const row = { ...liveMerge(`n${rows.length}`, [1, 2]), ...data, id: `n${rows.length}` } as LiveRow;
      rows.push(row);
      return row;
    });
    await Promise.all([
      executeTool("ProposeStructureMove", ctx as never, merge([9, 10])),
      executeTool("ProposeStructureMove", ctx as never, merge([10, 11])),
    ]);
    expect(h.db.structureMove.create).toHaveBeenCalledTimes(1);
  });
});

describe("a new pass retires the pending moves of older passes", () => {
  it("supersedes every still-pending move that is not from this pass", async () => {
    await executeTool("ProposeStructureMove", ctx as never, merge([2, 3]));
    const call = h.db.structureMove.updateMany.mock.calls.find(
      ([args]) => args.data?.status === "superseded"
    );
    expect(call).toBeDefined();
    const where = call![0].where;
    expect(where).toMatchObject({ bookId: "b1", status: "pending" });
    // Older passes, including rows filed before passes existed (sessionId null).
    expect(JSON.stringify(where)).toContain(ROOT);
    expect(JSON.stringify(where)).toContain("null");
  });

  it("does not count an older pass's moves against this pass's cap", async () => {
    h.db.structureMove.findMany.mockResolvedValue(
      fullPass().map((m) => ({ ...m, sessionId: "older" }))
    );
    await executeTool("ProposeStructureMove", ctx as never, merge([10, 11]));
    expect(h.db.structureMove.create).toHaveBeenCalledTimes(1);
  });
});

describe("a pass holds at most seven moves", () => {
  it("is seven", () => {
    expect(MAX_MOVES_PER_PASS).toBe(7);
  });

  it("refuses the eighth and lists what is already filed", async () => {
    h.db.structureMove.findMany.mockResolvedValue(fullPass());
    const out = await executeTool("ProposeStructureMove", ctx as never, merge([10, 11]));
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/7\/7/);
    expect(out).toContain("p1");
    expect(out).toMatch(/WithdrawStructureMove/);
  });

  it("reports the pass so far after every filing", async () => {
    h.db.structureMove.findMany.mockResolvedValue(fullPass().slice(0, 2));
    const out = await executeTool("ProposeStructureMove", ctx as never, merge([10, 11]));
    expect(out).toMatch(/3\/7/);
  });
});

describe("alternatives nest under a primary move", () => {
  it("files an alternative without counting it against the cap", async () => {
    h.db.structureMove.findMany.mockResolvedValue(fullPass());
    const out = await executeTool(
      "ProposeStructureMove",
      ctx as never,
      merge([10, 11], { alternativeTo: "p1" })
    );
    expect(h.db.structureMove.create).toHaveBeenCalledTimes(1);
    expect(h.db.structureMove.create.mock.calls[0][0].data.alternativeToId).toBe("p1");
    expect(out).toMatch(/7\/7/);
  });

  it("refuses an alternative to a move outside this pass", async () => {
    h.db.structureMove.findMany.mockResolvedValue([
      liveMerge("old", [1, 2], { sessionId: "older" }),
    ]);
    const out = await executeTool(
      "ProposeStructureMove",
      ctx as never,
      merge([10, 11], { alternativeTo: "old" })
    );
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
    expect(out).toMatch(/alternative/i);
  });

  it("refuses an alternative to an alternative", async () => {
    h.db.structureMove.findMany.mockResolvedValue([
      liveMerge("p1", [1, 2]),
      liveMerge("a1", [2, 3], { alternativeToId: "p1" }),
    ]);
    await executeTool("ProposeStructureMove", ctx as never, merge([10, 11], { alternativeTo: "a1" }));
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
  });

  it("allows at most two alternatives per move", async () => {
    h.db.structureMove.findMany.mockResolvedValue([
      liveMerge("p1", [1, 2]),
      liveMerge("a1", [2, 3], { alternativeToId: "p1" }),
      liveMerge("a2", [3, 4], { alternativeToId: "p1" }),
    ]);
    await executeTool("ProposeStructureMove", ctx as never, merge([10, 11], { alternativeTo: "p1" }));
    expect(h.db.structureMove.create).not.toHaveBeenCalled();
  });
});

describe("WithdrawStructureMove — the editor replaces a weaker move", () => {
  it("withdraws a pending move of this pass and its alternatives", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({
      id: "p1",
      status: "pending",
      sessionId: ROOT,
      alternativeToId: null,
    });
    h.db.structureMove.updateMany.mockResolvedValue({ count: 2 });
    const out = await executeTool("WithdrawStructureMove", ctx as never, { moveId: "p1" });
    const [args] = h.db.structureMove.updateMany.mock.calls[0];
    expect(args.data.status).toBe("withdrawn");
    expect(JSON.stringify(args.where)).toContain("p1");
    expect(args.where).toMatchObject({ bookId: "b1", status: "pending" });
    expect(out).toMatch(/withdrawn/i);
  });

  it("refuses a move from another pass", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({
      id: "p1",
      status: "pending",
      sessionId: "older",
      alternativeToId: null,
    });
    await executeTool("WithdrawStructureMove", ctx as never, { moveId: "p1" });
    expect(h.db.structureMove.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a move the writer already decided", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({
      id: "p1",
      status: "applied",
      sessionId: ROOT,
      alternativeToId: null,
    });
    await executeTool("WithdrawStructureMove", ctx as never, { moveId: "p1" });
    expect(h.db.structureMove.updateMany).not.toHaveBeenCalled();
  });
});

describe("the tool contract the model sees", () => {
  const defs = getToolDefinitions(["ProposeStructureMove", "WithdrawStructureMove"]);
  const propose = defs.find((d) => d.name === "ProposeStructureMove")!;

  it("requires a confidence on every proposal", () => {
    expect(propose.input_schema.required).toContain("confidence");
  });

  it("offers alternativeTo", () => {
    expect(Object.keys(propose.input_schema.properties ?? {})).toContain("alternativeTo");
  });

  it("offers WithdrawStructureMove", () => {
    expect(defs.map((d) => d.name)).toContain("WithdrawStructureMove");
  });
});
