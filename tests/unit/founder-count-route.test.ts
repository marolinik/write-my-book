import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * X-S18 / P7-S08 — the public Founder counter reported `available: -1` once
 * 201 slots existed, and the billing page rendered "201 of 200 claimed · -1
 * left". The cap now holds at the webhook, but rows from before the fix can
 * exceed it; availability is a count of open slots and is never negative.
 */
const h = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { founderSlot: { count: h.count } } }));

import { GET } from "@/app/api/billing/founder-count/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/billing/founder-count", () => {
  it("reports open slots below the cap", async () => {
    h.count.mockResolvedValue(150);
    const body = await (await GET()).json();
    expect(body).toEqual({ claimed: 150, total: 200, available: 50 });
  });

  it("never reports negative availability when rows exceed the cap", async () => {
    h.count.mockResolvedValue(201);
    const body = await (await GET()).json();
    expect(body.total).toBe(200);
    expect(body.available).toBe(0);
  });
});
