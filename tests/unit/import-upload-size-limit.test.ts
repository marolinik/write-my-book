import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UAT P6-S01 + P6-S06 — manuscripts between 10 and 20 MB could not be
 * imported, though the dropzone promises 20 MB. Next's proxy clones every
 * body the middleware matches and cuts it at 10 MB unless
 * `experimental.proxyClientMaxBodySize` says otherwise; the preview route
 * then read a truncated multipart body, `req.formData()` threw, and the
 * writer got a 500 "Preview failed". The route's own 20 MB per-file warning
 * could never be reached.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import nextConfig from "../../next.config";
import { POST } from "@/app/api/books/[id]/import/preview/route";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_UPLOAD_REQUEST_BYTES,
} from "@/lib/import-export/upload-limits";
import { MAX_COVER_JSON_BODY_BYTES } from "@/lib/api/image-data-url";

const MB = 1024 * 1024;
const URL_PREVIEW = "http://localhost:3000/api/books/b1/import/preview";
const ctx = { params: Promise.resolve({ id: "b1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.chapter.findMany.mockResolvedValue([]);
});

describe("the proxy body cap (next.config.ts)", () => {
  const cap = nextConfig.experimental?.proxyClientMaxBodySize;

  it("is set, so Next's 10 MB default does not apply", () => {
    expect(typeof cap).toBe("number");
    expect(cap as number).toBeGreaterThan(10 * MB);
  });

  it("holds the largest request an upload route accepts", () => {
    expect(cap).toBe(MAX_UPLOAD_REQUEST_BYTES);
    // One file at the 20 MB limit plus its multipart framing.
    expect(MAX_UPLOAD_REQUEST_BYTES).toBeGreaterThan(MAX_IMPORT_FILE_BYTES + 64 * 1024);
  });

  it("also holds an 8 MB cover sent as base64 JSON (P7-S11)", () => {
    expect(cap as number).toBeGreaterThanOrEqual(MAX_COVER_JSON_BODY_BYTES);
  });
});

describe("POST /api/books/:id/import/preview at the size limits", () => {
  it("parses a file over 10 MB but within 20 MB", async () => {
    const text = "# Poglavlje 1: Povratak\n\n" + "reč ".repeat((14 * MB) / 4);
    const form = new FormData();
    form.append("files", new File([text], "Rukopis.txt", { type: "text/plain" }));
    const res = await POST(new Request(URL_PREVIEW, { method: "POST", body: form }) as never, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters).toHaveLength(1);
    expect(body.warnings).toBeUndefined();
  });

  it("skips a file over 20 MB with its own warning instead of failing the upload", async () => {
    const form = new FormData();
    form.append("files", new File([new Uint8Array(21 * MB)], "Veliki.txt", { type: "text/plain" }));
    form.append("files", new File(["# Epilog\n\nKraj."], "Epilog.md", { type: "text/markdown" }));
    const res = await POST(new Request(URL_PREVIEW, { method: "POST", body: form }) as never, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters).toHaveLength(1);
    expect(body.warnings).toEqual([expect.stringContaining("Veliki.txt")]);
  });

  it("refuses a body larger than the request cap with 413, not a 500", async () => {
    const res = await POST(
      new Request(URL_PREVIEW, {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=x",
          "content-length": String(MAX_UPLOAD_REQUEST_BYTES + 1),
        },
        body: "--x--\r\n",
      }) as never,
      ctx
    );

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe("UPLOAD_TOO_LARGE");
    expect(body.error).not.toBe("Preview failed");
  });

  it("answers a truncated multipart body with 400, not a 500", async () => {
    // What the proxy used to hand the route: the body cut off mid-part.
    const res = await POST(
      new Request(URL_PREVIEW, {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=x" },
        body: '--x\r\nContent-Disposition: form-data; name="files"; filename="a.txt"\r\n\r\nabc',
      }) as never,
      ctx
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("UPLOAD_UNREADABLE");
  });
});
