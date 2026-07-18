import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// D-14: the legacy style/style-lenses routes ended in a blanket
// `catch { return 401 }` — a Prisma client-side validation error (wrong-type
// field) or any unexpected failure was mislabeled "Unauthorized", which can
// send clients into a bogus re-login flow. Errors must be classed honestly:
// auth → 401, Prisma validation → 400, unknown → generic 500.
const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    styleProfile: { findMany: vi.fn(), create: vi.fn() },
    characterLens: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { GET as GET_STYLE, POST as POST_STYLE } from "@/app/api/books/[id]/style/route";
import { GET as GET_LENSES, POST as POST_LENS } from "@/app/api/books/[id]/style/lenses/route";
import { PATCH as PATCH_LENS, DELETE as DELETE_LENS } from "@/app/api/books/[id]/style/lenses/[lensId]/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
const lensCtx = { params: Promise.resolve({ id: "b1", lensId: "l1" }) };

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_LENS = {
  characterName: "Milan",
  sensoryPriority: "sound",
  metaphorDomain: "sea",
  interiorStyle: "brooding",
  vocabularyRegister: "formal",
};

function prismaValidationError() {
  const err = new Error("Argument `name`: Invalid value provided.");
  err.name = "PrismaClientValidationError";
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", bookNumber: 1 });
  h.db.styleProfile.findMany.mockResolvedValue([]);
  h.db.styleProfile.create.mockResolvedValue({ id: "sp1" });
  h.db.characterLens.findMany.mockResolvedValue([]);
  h.db.characterLens.findFirst.mockResolvedValue({ id: "l1", bookId: "b1" });
  h.db.characterLens.create.mockResolvedValue({ id: "l1" });
  h.db.characterLens.update.mockResolvedValue({ id: "l1" });
  h.db.characterLens.deleteMany.mockResolvedValue({ count: 1 });
});

describe("style routes class errors honestly (D-14)", () => {
  it("POST style: Prisma validation error → 400 Invalid input (was 401)", async () => {
    h.db.styleProfile.create.mockRejectedValue(prismaValidationError());
    const res = await POST_STYLE(
      jsonReq("http://t/api/books/b1/style", "POST", { name: "X", description: 42 }),
      ctx as never
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid input" });
  });

  it("POST style: unauthenticated → 401", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST_STYLE(
      jsonReq("http://t/api/books/b1/style", "POST", { name: "X" }),
      ctx as never
    );
    expect(res.status).toBe(401);
  });

  it("POST style: unknown failure → generic 500, NOT 401, no internals", async () => {
    h.db.styleProfile.create.mockRejectedValue(new Error("ECONNREFUSED 5432"));
    const res = await POST_STYLE(
      jsonReq("http://t/api/books/b1/style", "POST", { name: "X" }),
      ctx as never
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.error).not.toMatch(/unauthorized/i);
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|5432/);
  });

  it("POST style: hand-validation stays intact (missing name → 400)", async () => {
    const res = await POST_STYLE(
      jsonReq("http://t/api/books/b1/style", "POST", {}),
      ctx as never
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Name is required" });
  });

  it("GET style: db outage → 500, not 401; unauth → 401", async () => {
    h.db.styleProfile.findMany.mockRejectedValue(new Error("boom"));
    const res = await GET_STYLE(
      new NextRequest("http://t/api/books/b1/style"),
      ctx as never
    );
    expect(res.status).toBe(500);

    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const res401 = await GET_STYLE(
      new NextRequest("http://t/api/books/b1/style"),
      ctx as never
    );
    expect(res401.status).toBe(401);
  });

  it("POST lens: Prisma validation error → 400; P2002 duplicate stays 409", async () => {
    h.db.characterLens.create.mockRejectedValue(prismaValidationError());
    const res = await POST_LENS(
      jsonReq("http://t/api/books/b1/style/lenses", "POST", {
        ...VALID_LENS,
        blindSpots: { not: "a string" },
      }),
      ctx as never
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid input" });

    const dup = Object.assign(new Error("Unique constraint"), { code: "P2002" });
    h.db.characterLens.create.mockRejectedValue(dup);
    const res409 = await POST_LENS(
      jsonReq("http://t/api/books/b1/style/lenses", "POST", VALID_LENS),
      ctx as never
    );
    expect(res409.status).toBe(409);
  });

  it("GET lenses: unknown failure → 500, not 401", async () => {
    h.db.characterLens.findMany.mockRejectedValue(new Error("boom"));
    const res = await GET_LENSES(
      new NextRequest("http://t/api/books/b1/style/lenses"),
      ctx as never
    );
    expect(res.status).toBe(500);
  });

  it("PATCH lens: Prisma validation error → 400; DELETE unknown → 500", async () => {
    h.db.characterLens.update.mockRejectedValue(prismaValidationError());
    const res = await PATCH_LENS(
      jsonReq("http://t/api/books/b1/style/lenses/l1", "PATCH", {
        sensoryPriority: 123,
      }),
      lensCtx as never
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid input" });

    h.db.characterLens.deleteMany.mockRejectedValue(new Error("boom"));
    const resDel = await DELETE_LENS(
      new NextRequest("http://t/api/books/b1/style/lenses/l1"),
      lensCtx as never
    );
    expect(resDel.status).toBe(500);
  });
});
