import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * P4-S10 (UAT 2026-09-25): POST /api/share with a positive ttlDays below one
 * day (0.5, 0.99) stored expires_at NULL — a link that never expires. The
 * route floored the value (0.5 -> 0) AFTER checking it was positive, and then
 * read 0 as "no TTL". A TTL the owner asked for must expire; only a missing or
 * non-positive one means "never" (R-331).
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    sharedSnapshot: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { POST } from "@/app/api/share/route";

const DAY = 24 * 60 * 60 * 1000;

async function share(ttlDays: unknown) {
  const req = new Request("http://t/api/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bookId: "b1", kind: "book", ttlDays }),
  }) as unknown as NextRequest;
  const res = await POST(req);
  expect(res.status).toBe(200);
  const stored = h.db.sharedSnapshot.create.mock.calls.at(-1)![0].data.expiresAt as Date | null;
  const body = (await res.json()) as { expiresAt: string | null };
  return { stored, body };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.sharedSnapshot.create.mockResolvedValue({});
});

describe("a share link's time to live (P4-S10)", () => {
  it.each([0.5, 0.99, 0.01])("expires when asked for %s of a day", async (ttl) => {
    const before = Date.now();
    const { stored, body } = await share(ttl);
    expect(stored, "a positive TTL must be stored").not.toBeNull();
    expect(body.expiresAt).not.toBeNull();
    // Rounded up to the smallest unit the API speaks: one day.
    expect(stored!.getTime() - before).toBeGreaterThanOrEqual(DAY - 1000);
    expect(stored!.getTime() - before).toBeLessThanOrEqual(DAY + 1000);
  });

  it("still floors whole days and caps at a year", async () => {
    const before = Date.now();
    expect((await share(1.5)).stored!.getTime() - before).toBeLessThanOrEqual(DAY + 1000);
    expect((await share(9999)).stored!.getTime() - before).toBeLessThanOrEqual(365 * DAY + 1000);
  });

  it.each([0, -3, undefined, "soon"])("never expires for %s, as documented", async (ttl) => {
    const { stored, body } = await share(ttl);
    expect(stored).toBeNull();
    expect(body.expiresAt).toBeNull();
  });
});
