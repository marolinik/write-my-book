import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O12 — the structure API. The writer's accept is the only door to the apply
 * engine, so the fences matter as much as the happy path: every route proves
 * book ownership before it reads or decides anything.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    structureMove: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  applyStructureMove: vi.fn(),
  undoStructureMove: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/structure/apply-move", () => ({
  applyStructureMove: (...a: unknown[]) => h.applyStructureMove(...a),
  undoStructureMove: (...a: unknown[]) => h.undoStructureMove(...a),
}));

import { GET } from "@/app/api/books/[id]/structure/moves/route";
import { POST as DECIDE } from "@/app/api/books/[id]/structure/moves/[moveId]/decision/route";
import { POST as UNDO } from "@/app/api/books/[id]/structure/moves/[moveId]/undo/route";

const listCtx = { params: Promise.resolve({ id: "b1" }) };
const moveCtx = { params: Promise.resolve({ id: "b1", moveId: "m1" }) };

function req(body?: unknown) {
  return new Request("http://t/x", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.structureMove.findMany.mockResolvedValue([
    {
      id: "m1",
      kind: "merge",
      payload: JSON.stringify({ kind: "merge", chapterNumbers: [17, 18] }),
      reason: "Isti prizor u dva poglavlja.",
      evidence: null,
      confidence: 0.8,
      status: "pending",
      resultSummary: null,
      createdAt: new Date("2026-09-18T00:00:00Z"),
    },
  ]);
  h.db.structureMove.update.mockResolvedValue({ id: "m1", status: "rejected" });
  h.db.structureMove.updateMany.mockResolvedValue({ count: 1 });
  h.applyStructureMove.mockResolvedValue({ ok: true, summary: "Merged chapters 17 + 18." });
  h.undoStructureMove.mockResolvedValue({ ok: true, summary: "Undone." });
});

describe("GET /api/books/:id/structure/moves", () => {
  it("401 without a user, 404 for someone else's book", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await GET(req() as never, listCtx as never)).status).toBe(401);

    h.db.book.findFirst.mockResolvedValueOnce(null);
    expect((await GET(req() as never, listCtx as never)).status).toBe(404);
  });

  it("returns the moves with their payload already parsed", async () => {
    const res = await GET(req() as never, listCtx as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.moves[0]).toMatchObject({
      id: "m1",
      kind: "merge",
      status: "pending",
      reason: "Isti prizor u dva poglavlja.",
    });
    expect(body.moves[0].payload).toEqual({ kind: "merge", chapterNumbers: [17, 18] });
    expect(h.db.structureMove.findMany.mock.calls[0][0].where).toMatchObject({ bookId: "b1" });
  });
});

describe("POST /api/books/:id/structure/moves/:moveId/decision", () => {
  it("accept runs the apply engine and reports its summary", async () => {
    const res = await DECIDE(req({ decision: "accept" }) as never, moveCtx as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      applied: true,
      summary: "Merged chapters 17 + 18.",
    });
    expect(h.applyStructureMove).toHaveBeenCalledWith("m1", { bookId: "b1", userId: "u1" });
  });

  it("surfaces an apply failure as 409 with the reason, not a generic 500", async () => {
    h.applyStructureMove.mockResolvedValueOnce({
      ok: false,
      error: { code: "anchor_not_found", message: 'The quote "x" is not in this chapter.' },
    });
    const res = await DECIDE(req({ decision: "accept" }) as never, moveCtx as never);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "anchor_not_found" });
  });

  it("reject marks the move rejected and never touches the manuscript", async () => {
    const res = await DECIDE(
      req({ decision: "reject", reason: "Namerno je tako." }) as never,
      moveCtx as never
    );
    expect(res.status).toBe(200);
    expect(h.applyStructureMove).not.toHaveBeenCalled();
    const call = h.db.structureMove.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "m1", bookId: "b1" });
    expect(call.data).toMatchObject({ status: "rejected", rejectionReason: "Namerno je tako." });
  });

  it("404s when the proposal belongs to another book", async () => {
    h.db.structureMove.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await DECIDE(req({ decision: "reject" }) as never, moveCtx as never);
    expect(res.status).toBe(404);
  });

  it("401 / 404 / 400 guards", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await DECIDE(req({ decision: "accept" }) as never, moveCtx as never)).status).toBe(401);

    h.db.book.findFirst.mockResolvedValueOnce(null);
    expect((await DECIDE(req({ decision: "accept" }) as never, moveCtx as never)).status).toBe(404);

    expect((await DECIDE(req({ decision: "maybe" }) as never, moveCtx as never)).status).toBe(400);
  });
});

describe("POST /api/books/:id/structure/moves/:moveId/undo", () => {
  it("undoes an applied move", async () => {
    const res = await UNDO(req() as never, moveCtx as never);
    expect(res.status).toBe(200);
    expect(h.undoStructureMove).toHaveBeenCalledWith("m1", { bookId: "b1", userId: "u1" });
  });

  it("409s when there is nothing to undo", async () => {
    h.undoStructureMove.mockResolvedValueOnce({
      ok: false,
      error: { code: "not_applied", message: "nothing to undo" },
    });
    const res = await UNDO(req() as never, moveCtx as never);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "not_applied" });
  });

  it("is fenced to the owner's book", async () => {
    h.db.book.findFirst.mockResolvedValueOnce(null);
    expect((await UNDO(req() as never, moveCtx as never)).status).toBe(404);
    expect(h.undoStructureMove).not.toHaveBeenCalled();
  });
});
