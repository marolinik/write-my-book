import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-01 regression lock: a malformed JSON body must answer 400 with the
 * standard `{ error }` envelope — pre-fix every unguarded `await req.json()`
 * under src/app/api/** let the runtime SyntaxError escape as a raw 500.
 * Covers the parseJsonBody helper directly plus a representative migrated
 * route handler (archive), mocked per archive-route.test.ts.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: { book: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import {
  parseJsonBody,
  invalidJsonBodyResponse,
  InvalidJsonBodyError,
} from "@/lib/api/parse-json-body";
import { POST } from "@/app/api/books/[id]/archive/route";

function rawReq(body: string) {
  return new Request("http://t/api/books/b1/archive", { method: "POST", body });
}
const ctx = { params: Promise.resolve({ id: "b1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.updateMany.mockResolvedValue({ count: 1 });
});

describe("parseJsonBody helper", () => {
  it("returns the parsed payload for valid JSON", async () => {
    await expect(parseJsonBody(rawReq('{"archived":true}'))).resolves.toEqual({
      archived: true,
    });
  });

  it("throws the typed InvalidJsonBodyError for malformed JSON", async () => {
    await expect(parseJsonBody(rawReq("{not json"))).rejects.toBeInstanceOf(
      InvalidJsonBodyError
    );
  });

  it("throws for an empty body (also a JSON parse failure)", async () => {
    await expect(parseJsonBody(rawReq(""))).rejects.toBeInstanceOf(
      InvalidJsonBodyError
    );
  });

  it("maps only InvalidJsonBodyError to the 400 envelope", async () => {
    const res = invalidJsonBodyResponse(new InvalidJsonBodyError());
    expect(res?.status).toBe(400);
    await expect(res?.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(invalidJsonBodyResponse(new Error("boom"))).toBeNull();
    expect(invalidJsonBodyResponse(undefined)).toBeNull();
  });
});

describe("migrated route handler (archive) on malformed JSON", () => {
  it("answers 400 with the standard envelope, not a raw 500", async () => {
    const res = await POST(rawReq("{definitely not json") as never, ctx as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(h.db.book.updateMany).not.toHaveBeenCalled();
  });

  it("still accepts a valid body after migration", async () => {
    const res = await POST(rawReq('{"archived":true}') as never, ctx as never);
    expect(res.status).toBe(200);
  });
});
