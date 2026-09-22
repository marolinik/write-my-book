/**
 * A judge nothing calls is not a feature.
 *
 * Triage shipped with a route and no caller: the panel ranks what has been
 * judged, and nothing in the product ever judged anything. Both passes now run
 * where findings are born, at the end of an editorial session, so a writer who
 * runs Lektura opens a ranked list without knowing a judge exists.
 *
 * Order matters: the stock-prose pass writes findings, and triage must see them.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

function mockPasses(opts: { stockThrows?: boolean } = {}) {
  const calls: string[] = [];
  vi.doMock("@/lib/editorial/stock-prose-service", () => ({
    checkChapterStockProse: vi.fn(async () => {
      calls.push("stock");
      if (opts.stockThrows) throw new Error("boom");
      return { judged: 1, marked: 1, requests: 1 };
    }),
  }));
  vi.doMock("@/lib/editorial/triage-service", () => ({
    triageChapter: vi.fn(async () => {
      calls.push("triage");
      return { judged: 1, unanswered: 0, requests: 1 };
    }),
  }));
  return calls;
}

describe("judgeChapterAfterEdit", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("reads for stock prose before it ranks, so the new notes are ranked too", async () => {
    const calls = mockPasses();
    const { judgeChapterAfterEdit } = await import("@/lib/editorial/after-edit");
    await judgeChapterAfterEdit({ workflowId: "line-edit", bookId: "b", chapterNumber: 3, sessionId: "s" });
    expect(calls).toEqual(["stock", "triage"]);
  });

  it("only ranks after a developmental edit: stock prose is a line-level concern", async () => {
    const calls = mockPasses();
    const { judgeChapterAfterEdit } = await import("@/lib/editorial/after-edit");
    await judgeChapterAfterEdit({ workflowId: "dev-edit", bookId: "b", chapterNumber: 3, sessionId: "s" });
    expect(calls).toEqual(["triage"]);
  });

  it("does nothing for a session that produced no editorial findings", async () => {
    const calls = mockPasses();
    const { judgeChapterAfterEdit } = await import("@/lib/editorial/after-edit");
    await judgeChapterAfterEdit({ workflowId: "write-chapter", bookId: "b", chapterNumber: 3, sessionId: "s" });
    expect(calls).toEqual([]);
  });

  it("still ranks when the stock-prose pass breaks, and never throws into the session", async () => {
    const calls = mockPasses({ stockThrows: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { judgeChapterAfterEdit } = await import("@/lib/editorial/after-edit");
    await expect(
      judgeChapterAfterEdit({ workflowId: "line-edit", bookId: "b", chapterNumber: 3, sessionId: "s" })
    ).resolves.toBeUndefined();
    expect(calls).toEqual(["stock", "triage"]);
  });
});
