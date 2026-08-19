import { describe, it, expect, vi } from "vitest";

// Method-not-allowed is decided before any auth/db work, but the route module
// pulls these in at load — mock them so importing it stays side-effect free.
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { GET } from "@/app/api/series/[id]/books/route";

describe("GET /api/series/:id/books — unsupported method", () => {
  // D-112 (D-15 class): the only route in the sweep that answered a bare-body
  // 405. Every 4xx must carry the standard { error } envelope.
  it("D-112: returns 405 with the { error: 'Method not allowed' } envelope", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toEqual({ error: "Method not allowed" });
  });
});
