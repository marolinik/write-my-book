import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UAT P7-S11 regression lock: covers are promised "up to 8 MB" (client check,
 * coverHint copy, MAX_COVER_BYTES in the routes), but they travel as a base64
 * data URL inside JSON, and the generic 5 MiB JSON ceiling answered 413 for
 * any image above ~3.75 MiB — the route's own 8 MB check was unreachable.
 * Between 3 and 3.75 MiB the data-URL regex also blew the stack (500).
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), update: vi.fn() },
  },
  storage: { writeBuffer: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/storage", () => ({ getBookStorage: () => h.storage }));

import { PUT as putBackCover } from "@/app/api/books/[id]/back-cover/route";
import { PUT as putCover } from "@/app/api/books/[id]/cover/route";
import { parseImageDataUrl, MAX_COVER_BYTES } from "@/lib/api/image-data-url";

function pngDataUrl(rawBytes: number): string {
  const buf = Buffer.alloc(rawBytes, 7);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function jsonReq(url: string, body: unknown) {
  const text = JSON.stringify(body);
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) },
    body: text,
  });
}
const ctx = { params: Promise.resolve({ id: "b1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", backCoverUrl: null, coverUrl: null });
  h.db.book.update.mockResolvedValue({});
  h.storage.writeBuffer.mockResolvedValue(undefined);
  h.storage.delete.mockResolvedValue(undefined);
});

describe("parseImageDataUrl", () => {
  it("splits mime and payload without a backtracking regex", () => {
    const parsed = parseImageDataUrl(pngDataUrl(4 * 1024 * 1024));
    expect(parsed?.mime).toBe("image/png");
    expect(parsed?.buffer.byteLength).toBe(4 * 1024 * 1024);
  });

  it("rejects anything that is not a base64 data URL", () => {
    expect(parseImageDataUrl("http://evil/x.png")).toBeNull();
    expect(parseImageDataUrl("data:image/png,abc")).toBeNull();
    expect(parseImageDataUrl("data:;base64,abc")).toBeNull();
    expect(parseImageDataUrl("data:image/png;base64,")).toBeNull();
  });
});

describe("cover routes accept everything up to the promised 8 MB", () => {
  for (const [name, put, url] of [
    ["back cover", putBackCover, "http://t/api/books/b1/back-cover"],
    ["front cover", putCover, "http://t/api/books/b1/cover"],
  ] as const) {
    it(`${name}: a 7.5 MB image is stored (was 413)`, async () => {
      const res = await put(jsonReq(url, { dataUrl: pngDataUrl(7.5 * 1024 * 1024) }) as never, ctx as never);
      expect(res.status).toBe(200);
      expect(h.storage.writeBuffer).toHaveBeenCalledTimes(1);
    });

    it(`${name}: just over 8 MB gets the route's own size answer`, async () => {
      const res = await put(jsonReq(url, { dataUrl: pngDataUrl(MAX_COVER_BYTES + 1) }) as never, ctx as never);
      expect(res.status).toBe(400);
      expect(h.storage.writeBuffer).not.toHaveBeenCalled();
    });
  }
});
