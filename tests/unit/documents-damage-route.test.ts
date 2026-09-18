import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O3 — the damage scan the writer can act on. Two rules matter beyond the
 * happy path: chapter prose is never offered for regeneration (it is his own
 * work), and a document type nothing can rebuild is not reported as broken,
 * because that would be an alarm with no way forward.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    document: { findMany: vi.fn() },
  },
  read: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    read = h.read;
  },
}));

import { GET } from "@/app/api/books/[id]/documents/damage/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
const req = new Request("http://t/api/books/b1/documents/damage");

const CLEAN = "# Biblija priče\n\nMarko je stajao pred kućom koja nije bila njegova.";
const BROKEN = "# Biblija pri��e\n\nMarko je stajao pred ku��om.";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", language: "sr" });
  h.db.document.findMany.mockResolvedValue([
    { id: "d1", type: "STORY_BIBLE", title: "Biblija", updatedAt: new Date("2026-08-30") },
    { id: "d2", type: "ARCHITECTURE", title: "Arhitektura", updatedAt: new Date("2026-08-30") },
  ]);
  h.read.mockImplementation(async (id: string) => ({
    document: { id },
    content: id === "d1" ? BROKEN : CLEAN,
  }));
});

describe("GET /api/books/:id/documents/damage", () => {
  it("401 and 404 guards", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await GET(req as never, ctx as never)).status).toBe(401);

    h.db.book.findFirst.mockResolvedValueOnce(null);
    expect((await GET(req as never, ctx as never)).status).toBe(404);
  });

  it("reports the damaged document and how to rebuild it", async () => {
    const res = await GET(req as never, ctx as never);
    const body = await res.json();
    expect(body.damaged).toHaveLength(1);
    expect(body.damaged[0]).toMatchObject({
      id: "d1",
      type: "STORY_BIBLE",
      recoverable: false,
      regenerateWorkflow: "create-story-bible",
    });
    expect(body.damaged[0].reasons).toContain("replacement_chars");
  });

  it("scans only book-level documents, never the writer's chapter prose", async () => {
    await GET(req as never, ctx as never);
    expect(h.db.document.findMany.mock.calls[0][0].where).toMatchObject({
      bookId: "b1",
      chapterNumber: null,
    });
  });

  it("stays silent about a document type nothing can regenerate", async () => {
    h.db.document.findMany.mockResolvedValueOnce([
      { id: "d3", type: "FREEWRITE", title: "Beleške", updatedAt: new Date() },
    ]);
    const body = await (await GET(req as never, ctx as never)).json();
    expect(body.damaged).toEqual([]);
    expect(h.read).not.toHaveBeenCalled();
  });

  it("skips a document whose content cannot be read instead of failing the scan", async () => {
    h.read.mockRejectedValueOnce(new Error("s3 down"));
    const res = await GET(req as never, ctx as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.damaged).toEqual([]);
  });
});
