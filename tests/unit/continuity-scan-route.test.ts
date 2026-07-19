import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    continuityFlag: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
  updateFromChapter: vi.fn(),
  getExtractionKeysForUser: vi.fn(),
  runConsistencyChecks: vi.fn(),
  getChapterNodeUpdatedAt: vi.fn(),
  findByType: vi.fn(),
  readPinned: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/graph/graph-maintenance", () => ({ updateFromChapter: h.updateFromChapter }));
vi.mock("@/lib/agents/extraction-keys", () => ({ getExtractionKeysForUser: h.getExtractionKeysForUser }));
vi.mock("@/lib/graph/graph-queries", () => ({
  runConsistencyChecks: h.runConsistencyChecks,
  getChapterNodeUpdatedAt: h.getChapterNodeUpdatedAt,
}));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
  },
}));
vi.mock("@/generated/prisma/enums", () => ({ DocumentType: { CHAPTER_CONTENT: "CHAPTER_CONTENT" } }));

import { POST } from "@/app/api/books/[id]/continuity/scan/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(qs: string) {
  return new Request(`http://t/api/books/b1/continuity/scan${qs}`, { method: "POST" });
}
const deadIssue = {
  type: "dead_character_reappears", severity: "critical",
  description: 'Character "Ana" dies in chapter 12 but participates in events in chapters 18.',
  entities: ["Ana"], chapters: [12, 18],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "openrouter-qwen-max/opus" });
  h.db.continuityFlag.findMany.mockResolvedValue([]);       // no existing/intentional
  h.db.continuityFlag.upsert.mockResolvedValue({ id: "new1" });
  h.db.continuityFlag.deleteMany.mockResolvedValue({ count: 0 });
  h.updateFromChapter.mockResolvedValue({ updated: true, entitiesFound: 3 });
  h.getExtractionKeysForUser.mockResolvedValue({});
  h.getChapterNodeUpdatedAt.mockResolvedValue(null);
  h.findByType.mockResolvedValue({ id: "doc1" });
  h.readPinned.mockResolvedValue({ content: "Ana walked in.", document: { currentVersion: 1 } });
  h.runConsistencyChecks.mockResolvedValue([deadIssue]);
});

describe("POST /continuity/scan", () => {
  it("401s when auth fails", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    expect((await POST(req("?chapterNumber=18") as never, ctx as never)).status).toBe(401);
  });
  it("404s when the book is not owned", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    expect((await POST(req("?chapterNumber=18") as never, ctx as never)).status).toBe(404);
  });
  it("400s on invalid chapterNumber", async () => {
    expect((await POST(req("") as never, ctx as never)).status).toBe(400);
  });
  it("scopes ownership by userId", async () => {
    await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(h.db.book.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "b1", userId: "u1" }) }));
  });

  it("extracts (positive) then detects, upserts a flag, and returns it with an id", async () => {
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    // 4th arg threads the user's defaultModel so extraction honors their provider (C1/S9);
    // 6th arg threads userId so every written node/edge is tenant-stamped (RC-6).
    expect(h.updateFromChapter).toHaveBeenCalledWith("b1", 18, "Ana walked in.", "openrouter-qwen-max/opus", {}, "u1");
    const up = h.db.continuityFlag.upsert.mock.calls[0][0];
    expect(up.where.bookId_signature.bookId).toBe("b1");
    expect(up.create.type).toBe("dead_character_reappears");
    expect(up.create.severity).toBe("critical"); // graph vocab, no mapping
    expect(up.create.status).toBe("active");
    expect(json.flags).toHaveLength(1);
    expect(json.flags[0].id).toBe("new1");
  });

  it("throttles extraction when the chapter was extracted recently", async () => {
    h.getChapterNodeUpdatedAt.mockResolvedValue(new Date(Date.now() - 10_000));
    await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(h.updateFromChapter).not.toHaveBeenCalled();
    expect(h.runConsistencyChecks).toHaveBeenCalled(); // check still runs
  });

  it("still runs the check (200) when extraction throws", async () => {
    h.findByType.mockRejectedValue(new Error("storage down"));
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.runConsistencyChecks).toHaveBeenCalled();
  });
  it("still runs the check (200) when updateFromChapter itself throws", async () => {
    h.updateFromChapter.mockRejectedValue(new Error("neo4j down"));
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.runConsistencyChecks).toHaveBeenCalled();
  });

  it("returns {flags:[], degraded:true} and deletes NOTHING when the check throws", async () => {
    h.runConsistencyChecks.mockRejectedValue(new Error("cypher error"));
    h.db.continuityFlag.findMany.mockResolvedValue([{ id: "f1", signature: "sig1", status: "active" }]);
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.flags).toEqual([]);
    expect(json.degraded).toBe(true);
    expect(h.db.continuityFlag.deleteMany).not.toHaveBeenCalled();
  });

  it("dedupes the response by signature when runConsistencyChecks emits same-signature rows", async () => {
    // Two location_conflict issues at the same two locations/chapter, differing
    // only by event name (not part of the signature) — same signature, two rows.
    const dup1 = { type: "location_conflict", severity: "major", description: "Milan and Rome, event A", entities: ["Milan", "Rome"], chapters: [7] };
    const dup2 = { type: "location_conflict", severity: "major", description: "Milan and Rome, event B", entities: ["Milan", "Rome"], chapters: [7] };
    h.runConsistencyChecks.mockResolvedValue([dup1, dup2]);
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.flags).toHaveLength(1);
  });

  it("filters out an intentional-status flag and does not recreate it", async () => {
    const { continuityIssueSignature } = await import("@/lib/continuity/continuity-flags");
    const sig = continuityIssueSignature(deadIssue as never);
    h.db.continuityFlag.findMany.mockResolvedValue([{ id: "i1", signature: sig, status: "intentional" }]);
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(json.flags).toEqual([]);
    expect(h.db.continuityFlag.upsert).not.toHaveBeenCalled();
  });

  it("deletes stale ACTIVE flags no longer detected", async () => {
    h.runConsistencyChecks.mockResolvedValue([]); // nothing detected
    h.db.continuityFlag.findMany.mockResolvedValue([{ id: "f1", signature: "sig1", status: "active" }]);
    await POST(req("?chapterNumber=18") as never, ctx as never);
    const del = h.db.continuityFlag.deleteMany.mock.calls[0][0];
    expect(del.where.id).toEqual({ in: ["f1"] });
    expect(del.where.bookId).toBe("b1");
  });

  it("does NOT resolve/delete cross-chapter flags — a ch7 issue still detected survives a ch18 scan", async () => {
    // runConsistencyChecks is book-wide: it returns BOTH the ch18 dead issue and a ch7 location issue.
    const ch7 = { type: "location_conflict", severity: "major", description: "Milan in two places, ch7", entities: ["Milan"], chapters: [7] };
    h.runConsistencyChecks.mockResolvedValue([deadIssue, ch7]);
    const { continuityIssueSignature } = await import("@/lib/continuity/continuity-flags");
    const ch7sig = continuityIssueSignature(ch7 as never);
    h.db.continuityFlag.findMany.mockResolvedValue([{ id: "f7", signature: ch7sig, status: "active" }]);
    await POST(req("?chapterNumber=18") as never, ctx as never);
    // f7 is still detected (book-wide) → NOT deleted
    if (h.db.continuityFlag.deleteMany.mock.calls.length) {
      const del = h.db.continuityFlag.deleteMany.mock.calls[0][0];
      expect(del.where.id.in).not.toContain("f7");
    }
  });
});
