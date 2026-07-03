import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: { book: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { POST } from "@/app/api/books/[id]/archive/route";
const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown) {
  return new Request("http://t/api/books/b1/archive", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/books/:id/archive", () => {
  it("401 / 400 / 404 guards", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await POST(req({ archived: true }) as never, ctx as never)).status).toBe(401);
    expect((await POST(req({}) as never, ctx as never)).status).toBe(400);
    expect((await POST(req({ archived: "yes" }) as never, ctx as never)).status).toBe(400);
    h.db.book.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await POST(req({ archived: true }) as never, ctx as never)).status).toBe(404);
  });

  it("archives: fences to {id,userId}, writes a Date to archivedAt only", async () => {
    const res = await POST(req({ archived: true }) as never, ctx as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ archived: true });
    const call = h.db.book.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "b1", userId: "u1" });
    expect(Object.keys(call.data)).toEqual(["archivedAt"]);
    expect(call.data.archivedAt).toBeInstanceOf(Date);
  });

  it("restores: sets archivedAt to null", async () => {
    const res = await POST(req({ archived: false }) as never, ctx as never);
    expect(res.status).toBe(200);
    const call = h.db.book.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ archivedAt: null });
  });
});
