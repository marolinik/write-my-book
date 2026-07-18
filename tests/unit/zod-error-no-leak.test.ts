import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

/**
 * Error hygiene (z6 sweep): a Zod validation failure must answer 400 with only
 * plain-language field messages — never the raw ZodError / `issue` objects,
 * which carry `code`, `expected`/`received` types, union trees, and can echo
 * submitted input. The judges saw the raw dump in a memory route's 400
 * `details`. Full detail belongs in server logs, not the client body.
 */

import { zodErrorResponse, zodErrorDetails } from "@/lib/api/zod-error";

// Marker keys that only appear when a raw ZodIssue is serialized. `flatten`-style
// output (plain messages) never contains these as JSON keys.
const RAW_INTERNALS = /"code"\s*:|"expected"\s*:|"received"\s*:|"unionErrors"\s*:/;

function realZodError(): z.ZodError {
  const schema = z.object({ name: z.string(), age: z.number() });
  try {
    schema.parse({ name: 123, age: "old" });
    throw new Error("schema should have rejected");
  } catch (e) {
    return e as z.ZodError;
  }
}

describe("zodErrorResponse / zodErrorDetails helper", () => {
  it("maps issues to plain field/form messages, no raw internals", () => {
    const details = zodErrorDetails(realZodError());
    expect(details).toHaveProperty("fieldErrors");
    expect(details).toHaveProperty("formErrors");
    expect(JSON.stringify(details)).not.toMatch(RAW_INTERNALS);
    // The field messages are still surfaced (useful client feedback).
    expect(Object.keys(details.fieldErrors)).toContain("name");
  });

  it("returns a 400 NextResponse for a Zod error, null otherwise", async () => {
    const res = zodErrorResponse(realZodError());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error).toBe("Invalid input");
    expect(JSON.stringify(body)).not.toMatch(RAW_INTERNALS);

    expect(zodErrorResponse(new Error("boom"))).toBeNull();
    expect(zodErrorResponse(undefined)).toBeNull();
  });

  it("also classes errors by name (cross-realm ZodError without instanceof)", () => {
    const faux = { name: "ZodError", issues: [{ path: ["x"], message: "bad" }] };
    const res = zodErrorResponse(faux);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });
});

// Route-level lock: two representative routes must not leak raw internals.
const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  checkPlanAccess: vi.fn(),
  db: {
    book: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    bookSettings: { create: vi.fn() },
    chapter: { create: vi.fn() },
    series: { findFirst: vi.fn() },
    writerMemory: { create: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/plan-gating", () => ({
  checkPlanAccess: (...a: unknown[]) => h.checkPlanAccess(...a),
}));

import { POST as CREATE_BOOK } from "@/app/api/books/route";
import { POST as CREATE_MEMORY } from "@/app/api/memory/route";

function jsonPost(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.checkPlanAccess.mockResolvedValue({ allowed: true });
  h.db.book.findFirst.mockResolvedValue(null);
});

describe("routes never leak raw ZodError internals in 400 bodies", () => {
  it("POST /api/books invalid body → 400 Invalid input, no internals", async () => {
    // name must be a string; send a number to force a Zod type failure.
    const res = await CREATE_BOOK(jsonPost("http://t/api/books", { name: 123 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
    expect(JSON.stringify(body)).not.toMatch(RAW_INTERNALS);
    expect(h.db.book.create).not.toHaveBeenCalled();
  });

  it("POST /api/memory invalid body → 400, no internals (judge-cited leak)", async () => {
    const res = await CREATE_MEMORY(jsonPost("http://t/api/memory", { category: 5 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(RAW_INTERNALS);
    expect(h.db.writerMemory.create).not.toHaveBeenCalled();
  });
});
