import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: { book: { findFirst: vi.fn() }, continuityFlag: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { POST } from "@/app/api/books/[id]/continuity/intentional/route";
const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown) {
  return new Request("http://t/api/books/b1/continuity/intentional", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.continuityFlag.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /continuity/intentional", () => {
  it("401 / 404 / 400 guards", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await POST(req({ flagId: "f1" }) as never, ctx as never)).status).toBe(401);
    h.db.book.findFirst.mockResolvedValueOnce(null);
    expect((await POST(req({ flagId: "f1" }) as never, ctx as never)).status).toBe(404);
    expect((await POST(req({}) as never, ctx as never)).status).toBe(400);
  });

  it("flips the flag to intentional, fenced to the owned book", async () => {
    const res = await POST(req({ flagId: "f1" }) as never, ctx as never);
    expect(res.status).toBe(200);
    const call = h.db.continuityFlag.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "f1", bookId: "b1" });
    expect(call.data.status).toBe("intentional");
  });

  it("404s when the flag is not in the owned book (updateMany count 0)", async () => {
    h.db.continuityFlag.updateMany.mockResolvedValue({ count: 0 });
    expect((await POST(req({ flagId: "x" }) as never, ctx as never)).status).toBe(404);
  });
});
