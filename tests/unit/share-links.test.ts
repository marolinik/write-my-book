// P1-27 / P2-78: share links defaulted to never expiring, could not be listed
// or revoked from the product (DELETE had no caller), expired rows were never
// purged, and share pages inherited `index: true` and `canonical: "/"` from
// the root layout. A link now lives 30 days unless the writer picks another
// lifetime, the book lists its links and revokes them, the worker purges
// expired rows, and share pages tell search engines to stay out.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    sharedSnapshot: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { POST, GET, DELETE } from "@/app/api/share/route";
import { purgeExpiredShares } from "@/lib/share/purge";
import robots from "@/app/robots";

const DAY = 24 * 60 * 60 * 1000;
const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://t/api/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.sharedSnapshot.create.mockResolvedValue({});
});

describe("creating a link", () => {
  it("expires in 30 days when the writer does not choose", async () => {
    const before = Date.now();
    const res = await post({ bookId: "b1", kind: "book" });
    expect(res.status).toBe(200);
    const stored = h.db.sharedSnapshot.create.mock.calls[0][0].data.expiresAt as Date;
    expect(stored.getTime() - before).toBeGreaterThanOrEqual(30 * DAY - 1000);
    expect(stored.getTime() - before).toBeLessThanOrEqual(30 * DAY + 1000);
  });

  it("never expires only when the writer asks for no expiry", async () => {
    await post({ bookId: "b1", kind: "book", ttlDays: null });
    expect(h.db.sharedSnapshot.create.mock.calls[0][0].data.expiresAt).toBeNull();
  });
});

describe("listing and revoking", () => {
  it("lists the book's live links without their tokens", async () => {
    h.db.sharedSnapshot.findMany.mockResolvedValue([
      {
        id: "s1",
        token: "abcdefghijklmnopqrstuvwxyz012345",
        kind: "book",
        createdAt: new Date("2026-11-01T00:00:00Z"),
        expiresAt: new Date("2026-12-01T00:00:00Z"),
        lastViewedAt: null,
      },
    ]);
    const res = await GET(new Request("http://t/api/share?bookId=b1") as unknown as NextRequest);
    expect(res.status).toBe(200);
    const where = h.db.sharedSnapshot.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ bookId: "b1", createdById: "u1" });
    const { links } = (await res.json()) as { links: Array<Record<string, unknown>> };
    expect(links).toEqual([
      {
        id: "s1",
        tokenTail: "2345",
        kind: "book",
        createdAt: "2026-11-01T00:00:00.000Z",
        expiresAt: "2026-12-01T00:00:00.000Z",
        lastViewedAt: null,
      },
    ]);
    expect(JSON.stringify(links)).not.toContain("abcdefghij");
  });

  it("revokes the writer's own link by id, and only theirs", async () => {
    h.db.sharedSnapshot.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const ok = await DELETE(new Request("http://t/api/share?id=s1", { method: "DELETE" }) as unknown as NextRequest);
    expect(ok.status).toBe(200);
    expect(h.db.sharedSnapshot.deleteMany.mock.calls[0][0]).toEqual({ where: { id: "s1", createdById: "u1" } });
    const missing = await DELETE(new Request("http://t/api/share?id=s9", { method: "DELETE" }) as unknown as NextRequest);
    expect(missing.status).toBe(404);
  });
});

describe("expired links", () => {
  it("are purged, and only they", async () => {
    h.db.sharedSnapshot.deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date("2026-11-11T12:00:00Z");
    expect(await purgeExpiredShares(now)).toBe(3);
    expect(h.db.sharedSnapshot.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } });
  });

  it("the worker runs the purge", () => {
    expect(read("src", "worker.ts")).toContain("purgeExpiredShares(");
  });
});

describe("search engines", () => {
  it("robots.txt disallows /share/", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list.flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : [r.disallow]))).toContain("/share/");
  });

  it("every branch of the share page's metadata says noindex", () => {
    const page = read("src", "app", "share", "[token]", "page.tsx");
    expect(page).not.toMatch(/return \{\};/);
    expect(page).toMatch(/index: false/);
  });

  it("share responses carry X-Robots-Tag: noindex", () => {
    const config = read("next.config.ts");
    expect(config).toMatch(/source: "\/share\/:path\*"[\s\S]{0,200}X-Robots-Tag[\s\S]{0,60}noindex/);
  });
});
