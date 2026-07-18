import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// D-15: the wiki routes had no top-level try/catch — a Zod .parse() failure
// (or an unauthorized request) escaped as a raw 500 with an EMPTY body.
// Every error must answer with the standard {error, details?} envelope.
const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    wikiEntity: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { GET, POST } from "@/app/api/books/[id]/wiki/route";
import {
  GET as GET_ENTITY,
  PATCH,
  DELETE,
} from "@/app/api/books/[id]/wiki/[entityId]/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
const entityCtx = { params: Promise.resolve({ id: "b1", entityId: "e1" }) };

function post(body: unknown, url = "http://t/api/books/b1/wiki") {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function patch(body: unknown) {
  return new NextRequest("http://t/api/books/b1/wiki/e1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function get(url: string) {
  return new NextRequest(url);
}

const VALID_ENTITY = { type: "character", name: "Milan" };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.wikiEntity.findMany.mockResolvedValue([]);
  h.db.wikiEntity.findFirst.mockResolvedValue({ id: "e1", bookId: "b1" });
  h.db.wikiEntity.create.mockResolvedValue({ id: "e1" });
  h.db.wikiEntity.update.mockResolvedValue({ id: "e1" });
  h.db.wikiEntity.delete.mockResolvedValue({ id: "e1" });
});

describe("wiki routes answer errors with the standard envelope (D-15)", () => {
  it("POST invalid body → 400 {error, details}, never an empty-body 500", async () => {
    const res = await POST(post({ name: "" }), ctx as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
    expect(body.details).toBeDefined();
    expect(h.db.wikiEntity.create).not.toHaveBeenCalled();
  });

  it("POST wrong enum type → 400 envelope", async () => {
    const res = await POST(
      post({ type: "spaceship", name: "X" }),
      ctx as never
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid input" });
  });

  it("POST valid body still creates → 201", async () => {
    const res = await POST(post(VALID_ENTITY), ctx as never);
    expect(res.status).toBe(201);
    expect(h.db.wikiEntity.create).toHaveBeenCalledTimes(1);
  });

  it("GET with invalid ?type= → 400 envelope", async () => {
    const res = await GET(
      get("http://t/api/books/b1/wiki?type=not-a-type"),
      ctx as never
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid input" });
  });

  it("PATCH invalid field type → 400 envelope", async () => {
    const res = await PATCH(patch({ type: 123 }), entityCtx as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid input" });
    expect(h.db.wikiEntity.update).not.toHaveBeenCalled();
  });

  it("unauthorized → 401 {error}, not a raw 500 (all five handlers)", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    for (const call of [
      () => GET(get("http://t/api/books/b1/wiki"), ctx as never),
      () => POST(post(VALID_ENTITY), ctx as never),
      () => GET_ENTITY(get("http://t/api/books/b1/wiki/e1"), entityCtx as never),
      () => PATCH(patch({ name: "Y" }), entityCtx as never),
      () => DELETE(get("http://t/api/books/b1/wiki/e1"), entityCtx as never),
    ]) {
      const res = await call();
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    }
  });

  it("unexpected failure → generic 500 {error} with a non-empty body, no internals", async () => {
    h.db.wikiEntity.create.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:5432")
    );
    const res = await POST(post(VALID_ENTITY), ctx as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|5432/);
  });

  it("malformed JSON body still answers 400 via the D-01 guard", async () => {
    const res = await POST(
      new NextRequest("http://t/api/books/b1/wiki", {
        method: "POST",
        body: "{not json",
        headers: { "content-type": "application/json" },
      }),
      ctx as never
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
