import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RC-4 fix 5c: a READ-ONLY continuity surface. GET lists active flags without
 * running (or billing) an extraction — the old code offered no read path at all,
 * so seeing flags meant POSTing /scan, which kicks off a billed extraction. GET
 * with ?chapterNumber also returns the honest extraction status. DELETE is a
 * transient "dismiss" verb, distinct from the permanent /intentional suppress.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    continuityFlag: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
  getChapterExtractionFacts: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/graph/graph-maintenance", () => ({
  getChapterExtractionFacts: h.getChapterExtractionFacts,
  MAX_EMPTY_EXTRACTION_ATTEMPTS: 5,
}));

import { GET, DELETE } from "@/app/api/books/[id]/continuity/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(method: string, qs = "") {
  return new Request(`http://t/api/books/b1/continuity${qs}`, { method });
}

const activeRow = {
  id: "f1", signature: "sig1", type: "dead_character_reappears", severity: "critical",
  description: 'Character "Ana" reappears', entities: JSON.stringify(["Ana"]),
  chapterNumber: 18, jumpChapter: 12, anchor: "Ana",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.continuityFlag.findMany.mockResolvedValue([activeRow]);
  h.db.continuityFlag.deleteMany.mockResolvedValue({ count: 1 });
  h.getChapterExtractionFacts.mockResolvedValue({
    hasNode: true, contentHash: "abc", emptyExtractionCount: 0,
    lastEmptyExtractionAt: null, lowYield: false, updatedAt: new Date(),
  });
});

describe("GET /continuity (read-only listing)", () => {
  it("401s when auth fails", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    expect((await GET(req("GET") as never, ctx as never)).status).toBe(401);
  });

  it("404s when the book is not owned", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET") as never, ctx as never)).status).toBe(404);
  });

  it("lists active flags with entities parsed back to an array, without extracting", async () => {
    const res = await GET(req("GET") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.flags).toHaveLength(1);
    expect(json.flags[0].entities).toEqual(["Ana"]);
    // No chapterNumber → no extraction status, and never triggers extraction.
    expect(json.extraction).toBeNull();
    expect(h.db.continuityFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookId: "b1", status: "active" } })
    );
  });

  it("returns the honest extraction status when a chapterNumber is given", async () => {
    h.getChapterExtractionFacts.mockResolvedValue({
      hasNode: true, contentHash: null, emptyExtractionCount: 5,
      lastEmptyExtractionAt: new Date(), lowYield: false, updatedAt: new Date(),
    });
    const res = await GET(req("GET", "?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(json.extraction.state).toBe("failed");
    expect(json.extraction.capped).toBe(true);
  });

  it("tolerates malformed entities JSON (defaults to [])", async () => {
    h.db.continuityFlag.findMany.mockResolvedValue([{ ...activeRow, entities: "not-json" }]);
    const res = await GET(req("GET") as never, ctx as never);
    const json = await res.json();
    expect(json.flags[0].entities).toEqual([]);
  });
});

describe("DELETE /continuity (dismiss)", () => {
  it("400s when flagId is missing", async () => {
    expect((await DELETE(req("DELETE") as never, ctx as never)).status).toBe(400);
  });

  it("404s when the flag does not match the owned book", async () => {
    h.db.continuityFlag.deleteMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(req("DELETE", "?flagId=f1") as never, ctx as never)).status).toBe(404);
  });

  it("dismisses a flag fenced to the owned book", async () => {
    const res = await DELETE(req("DELETE", "?flagId=f1") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    const del = h.db.continuityFlag.deleteMany.mock.calls[0][0];
    expect(del.where).toEqual({ id: "f1", bookId: "b1" });
  });
});
