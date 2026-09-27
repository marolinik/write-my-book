import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/memory/rebuild re-embeds a whole book on the platform's key. It is
 * the one prose-indexing path that never asked the indexing gate: a Free
 * writer paused above the AI-eligible word cap could press "Rebuild index" and
 * have every chapter embedded at the platform's expense, while the memory card
 * beside the button said indexing was paused. The rebuild now asks the same
 * gate the chapter save does, and answers with the paused state instead of a
 * silent degradation.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  canIndex: vi.fn(),
  paused: vi.fn(),
  rebuild: vi.fn(),
  db: { book: { findFirst: vi.fn() } },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/vector", () => ({
  rebuildBookIndex: (...a: unknown[]) => h.rebuild(...a),
}));
vi.mock("@/lib/vector/indexing-gate", () => ({
  canIndexProseForUser: (...a: unknown[]) => h.canIndex(...a),
  isProseIndexingPausedForUser: (...a: unknown[]) => h.paused(...a),
}));

import { POST } from "@/app/api/memory/rebuild/route";

const BOOK = "2b4e9a4e-6f3e-4c1a-9d0e-8f4b1c2d3e4f";

function rebuild() {
  return POST(
    new NextRequest("http://t/api/memory/rebuild", {
      method: "POST",
      body: JSON.stringify({ bookId: BOOK }),
      headers: { "content-type": "application/json" },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: BOOK });
  h.canIndex.mockResolvedValue(true);
  h.paused.mockResolvedValue(false);
  h.rebuild.mockResolvedValue({ chunksIndexed: 12 });
});

describe("POST /api/memory/rebuild — the indexing gate", () => {
  it("rebuilds when the gate is open", async () => {
    const res = await rebuild();
    expect(res.status).toBe(200);
    expect((await res.json()).chunksIndexed).toBe(12);
    expect(h.rebuild).toHaveBeenCalledWith(BOOK, "u1");
  });

  it("a Free writer past the cap is told indexing is paused and nothing is embedded", async () => {
    h.canIndex.mockResolvedValue(false);
    h.paused.mockResolvedValue(true);

    const res = await rebuild();

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.indexingPaused).toBe(true);
    expect(body.error).toMatch(/paused/i);
    expect(h.rebuild).not.toHaveBeenCalled();
  });

  it("an embeddings outage is not a plan wall: 503, not paused", async () => {
    h.canIndex.mockResolvedValue(false);
    h.paused.mockResolvedValue(false);

    const res = await rebuild();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.indexingPaused).toBe(false);
    expect(h.rebuild).not.toHaveBeenCalled();
  });

  it("asks the gate for the signed-in writer, after the book is confirmed theirs", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await rebuild();
    expect(res.status).toBe(404);
    expect(h.canIndex).not.toHaveBeenCalled();
  });
});
