// P2-64 (Wave 5 Task 6): /api/share/[token] had no route test. GET is public:
// a well-formed, unexpired token loads a small snapshot, everything else is
// 404, and a burst from one address is 429. DELETE is owner-only.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  loadShareBook: vi.fn(),
  loadShareEditorial: vi.fn(),
}));

// P2-23: the shared Redis budget is covered in share-rate-limit.test.ts; here
// the in-memory per-address backstop answers (no Redis in the unit job).
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: async () => true }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!h.user) throw new Error("Unauthorized");
    return h.user;
  },
}));
vi.mock("@/lib/db", () => ({
  db: { sharedSnapshot: { findUnique: h.findUnique, findFirst: h.findFirst, update: h.update, delete: h.del } },
}));
vi.mock("@/lib/share/snapshot-data", () => ({
  loadShareBook: h.loadShareBook,
  loadShareEditorial: h.loadShareEditorial,
}));

import { GET, DELETE } from "@/app/api/share/[token]/route";

const TOKEN = "a".repeat(48);

function get(token: string, ip = "203.0.113.1") {
  const req = new Request(`http://test/api/share/${token}`, { headers: { "x-forwarded-for": ip } }) as unknown as NextRequest;
  return GET(req, { params: Promise.resolve({ token }) });
}

function del(token: string) {
  const req = new Request(`http://test/api/share/${token}`, { method: "DELETE" }) as unknown as NextRequest;
  return DELETE(req, { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: "u1" };
  h.update.mockResolvedValue({});
  h.loadShareBook.mockResolvedValue({ title: "The Salt Letters" });
  h.loadShareEditorial.mockResolvedValue({ findings: [] });
});

describe("GET /api/share/:token (public)", () => {
  it("loads the snapshot for its creator's book", async () => {
    h.findUnique.mockResolvedValue({ token: TOKEN, kind: "book", bookId: "b1", createdById: "u1", expiresAt: new Date(Date.now() + 86_400_000) });
    const res = await get(TOKEN, "203.0.113.10");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "The Salt Letters" });
    expect(h.loadShareBook).toHaveBeenCalledWith("b1", "u1");
  });

  it("loads the editorial snapshot for an editorial link", async () => {
    h.findUnique.mockResolvedValue({ token: TOKEN, kind: "editorial", bookId: "b1", createdById: "u1", expiresAt: null });
    expect((await get(TOKEN, "203.0.113.11")).status).toBe(200);
    expect(h.loadShareEditorial).toHaveBeenCalledWith("b1", "u1");
  });

  it("answers 404 for an expired link, without loading anything", async () => {
    h.findUnique.mockResolvedValue({ token: TOKEN, kind: "book", bookId: "b1", createdById: "u1", expiresAt: new Date(Date.now() - 1000) });
    expect((await get(TOKEN, "203.0.113.12")).status).toBe(404);
    expect(h.loadShareBook).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown token and for a malformed one (no lookup)", async () => {
    h.findUnique.mockResolvedValue(null);
    expect((await get(TOKEN, "203.0.113.13")).status).toBe(404);
    expect((await get("not-a-token", "203.0.113.13")).status).toBe(404);
    expect(h.findUnique).toHaveBeenCalledTimes(1);
  });

  it("answers 429 after 120 loads from one address in a minute, while another address still loads", async () => {
    h.findUnique.mockResolvedValue({ token: TOKEN, kind: "book", bookId: "b1", createdById: "u1", expiresAt: null });
    for (let i = 0; i < 120; i++) expect((await get(TOKEN, "198.51.100.7")).status).toBe(200);
    expect((await get(TOKEN, "198.51.100.7")).status).toBe(429);
    expect((await get(TOKEN, "198.51.100.8")).status).toBe(200);
  });

  it("never leaks the loader's error", async () => {
    h.findUnique.mockResolvedValue({ token: TOKEN, kind: "book", bookId: "b1", createdById: "u1", expiresAt: null });
    h.loadShareBook.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const res = await get(TOKEN, "203.0.113.14");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("ECONNREFUSED");
  });
});

describe("DELETE /api/share/:token (owner only)", () => {
  it("revokes the owner's link", async () => {
    h.findFirst.mockResolvedValue({ id: "row-1" });
    expect((await del(TOKEN)).status).toBe(200);
    expect(h.findFirst).toHaveBeenCalledWith({ where: { token: TOKEN, createdById: "u1" }, select: { id: true } });
    expect(h.del).toHaveBeenCalledWith({ where: { id: "row-1" } });
  });

  it("answers 404 for another writer's link and deletes nothing", async () => {
    h.findFirst.mockResolvedValue(null);
    expect((await del(TOKEN)).status).toBe(404);
    expect(h.del).not.toHaveBeenCalled();
  });

  it("answers 401 when signed out", async () => {
    h.user = null;
    expect((await del(TOKEN)).status).toBe(401);
    expect(h.del).not.toHaveBeenCalled();
  });
});
