// P2-18 / P2-19: WriteChapter over prose the writer already has.
// - The write names the version the agent read (expectedVersion), so a
//   chapter the writer (or a second session) changed in the meantime is a
//   conflict the agent is told about, not a silent last-write-wins.
// - In an interactive session, overwriting existing prose needs an approval
//   the server recorded (the orchestrator sets it when the writer approves),
//   not only the model's choice to ask.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VersionConflictError } from "@/lib/documents/errors";

const h = vi.hoisted(() => ({
  db: { chapter: { findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { executeTool } from "@/lib/agents/tools";

function docService(currentVersion = 4) {
  return {
    findByType: vi.fn(async () => ({ id: "doc3", currentVersion })),
    read: vi.fn(async () => ({ content: "Old prose of chapter three." })),
    update: vi.fn(async () => ({ version: { version: currentVersion + 1 } })),
    create: vi.fn(async () => ({ id: "docNew" })),
  };
}

function ctx(extra: Record<string, unknown> = {}) {
  return {
    bookId: "b1",
    userId: "u1",
    sessionId: "s1",
    agentType: "ghostwriter",
    language: "en",
    documentService: docService(),
    chapterVersionsSeen: new Map<number, number>(),
    ...extra,
  } as Record<string, unknown> & { documentService: ReturnType<typeof docService>; chapterVersionsSeen: Map<number, number> };
}

const write = (c: ReturnType<typeof ctx>) =>
  executeTool("WriteChapter", c as never, { chapterNumber: 3, markdown: "New prose for chapter three." });

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findFirst.mockResolvedValue({ id: "c3", chapterNumber: 3, actNumber: 1, wordCount: 5 });
  h.db.chapter.update.mockResolvedValue({});
});

describe("WriteChapter version guard (P2-19)", () => {
  it("writes with the version the session read", async () => {
    const c = ctx({ overwriteApproved: true });
    await executeTool("ReadChapter", c as never, { chapterNumber: 3 });
    expect(c.chapterVersionsSeen.get(3)).toBe(4);
    await write(c);
    const args = c.documentService.update.mock.calls[0] as unknown[];
    expect(args[5]).toBe(4);
  });

  it("tells the agent when the chapter changed since it read it, and writes nothing", async () => {
    const c = ctx({ overwriteApproved: true });
    await executeTool("ReadChapter", c as never, { chapterNumber: 3 });
    c.documentService.update.mockRejectedValue(new VersionConflictError("doc3"));
    const out = await write(c);
    expect(out).toMatch(/changed since you read it/i);
    expect(h.db.chapter.update).not.toHaveBeenCalled();
  });
});

describe("WriteChapter overwrite approval (P2-18)", () => {
  it("an interactive session cannot overwrite existing prose without a recorded approval", async () => {
    const c = ctx({ interactive: true });
    const out = await write(c);
    expect(out).toMatch(/RequestApproval/);
    expect(c.documentService.update).not.toHaveBeenCalled();
  });

  it("with the writer's approval recorded, it writes", async () => {
    const c = ctx({ interactive: true, overwriteApproved: true });
    const out = await write(c);
    expect(out).toMatch(/Wrote chapter 3/);
    expect(c.documentService.update).toHaveBeenCalled();
  });

  it("an empty chapter needs no approval", async () => {
    h.db.chapter.findFirst.mockResolvedValue({ id: "c3", chapterNumber: 3, actNumber: 1, wordCount: 0 });
    const c = ctx({ interactive: true });
    expect(await write(c)).toMatch(/Wrote chapter 3/);
  });
});
