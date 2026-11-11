// P1-24: DOCX import inflated the archive with no decompressed-size cap on an
// unrate-limited route, so any signed-in user could send a zip bomb. The
// archive is now inspected from its central directory before anything is
// inflated, conversion has a time limit, and imports are rate limited.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import JSZip from "jszip";
import { inspectDocxArchive, convertDocxSafely } from "@/lib/import-export/docx-to-markdown";

const h = vi.hoisted(() => ({ counts: new Map<string, number>() }));
vi.mock("@/lib/queue/connection", () => ({
  getAppConnection: () => ({
    set: async (key: string) => {
      if (!h.counts.has(key)) h.counts.set(key, 0);
      return "OK";
    },
    incr: async (key: string) => {
      const next = (h.counts.get(key) ?? 0) + 1;
      h.counts.set(key, next);
      return next;
    },
    expire: async () => 1,
  }),
}));

import { rateLimit } from "@/lib/security/rate-limit";

async function zip(files: Record<string, string>): Promise<Buffer> {
  const z = new JSZip();
  for (const [name, content] of Object.entries(files)) z.file(name, content);
  return z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("inspectDocxArchive", () => {
  it("accepts an ordinary document", async () => {
    const buffer = await zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document>hello</w:document>" });
    expect(await inspectDocxArchive(buffer)).toEqual({ ok: true });
  });

  it("refuses an archive that would inflate far beyond its size (zip bomb)", async () => {
    const buffer = await zip({ "word/document.xml": "a".repeat(5_000_000) });
    expect(await inspectDocxArchive(buffer)).toEqual({ ok: false, code: "ARCHIVE_TOO_LARGE" });
  });

  it("refuses an entry whose header lies about its size", async () => {
    // A central directory that declares 1 KB for an entry that inflates to 50 MB.
    const name = Buffer.from("word/document.xml");
    const bomb = deflateRawSync(Buffer.alloc(50_000_000, 0x61));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(bomb.length, 18);
    local.writeUInt32LE(1024, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(bomb.length, 20);
    central.writeUInt32LE(1024, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const localPart = Buffer.concat([local, name, bomb]);
    const centralPart = Buffer.concat([central, name]);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(centralPart.length, 12);
    eocd.writeUInt32LE(localPart.length, 16);
    expect(await inspectDocxArchive(Buffer.concat([localPart, centralPart, eocd]))).toEqual({
      ok: false,
      code: "ARCHIVE_TOO_LARGE",
    });
  });

  it("refuses an archive with thousands of entries", async () => {
    const files: Record<string, string> = { "word/document.xml": "<w:document/>" };
    for (let i = 0; i < 2_001; i++) files[`word/media/x${i}.bin`] = "x";
    expect(await inspectDocxArchive(await zip(files))).toEqual({ ok: false, code: "TOO_MANY_ENTRIES" });
  });

  it("refuses a zip that is not a Word document, and a file that is not a zip", async () => {
    expect(await inspectDocxArchive(await zip({ "notes.txt": "hi" }))).toEqual({ ok: false, code: "NOT_A_DOCX" });
    expect(await inspectDocxArchive(Buffer.from("not a zip at all"))).toEqual({ ok: false, code: "NOT_A_DOCX" });
  });
});

describe("convertDocxSafely", () => {
  it("gives up on a conversion that runs past the time limit", async () => {
    const buffer = await zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document/>" });
    const result = await convertDocxSafely(buffer, { timeoutMs: 20, convert: () => new Promise(() => {}) });
    expect(result).toEqual({ ok: false, code: "CONVERSION_TIMEOUT" });
  });

  it("never runs the converter on a refused archive", async () => {
    const convert = vi.fn(async () => "never");
    const result = await convertDocxSafely(await zip({ "word/document.xml": "a".repeat(5_000_000) }), { convert });
    expect(result).toEqual({ ok: false, code: "ARCHIVE_TOO_LARGE" });
    expect(convert).not.toHaveBeenCalled();
  });
});

describe("the import routes", () => {
  it.each([
    ["src/app/api/books/[id]/import/route.ts"],
    ["src/app/api/books/[id]/import/preview/route.ts"],
  ])("%s rate limits uploads and maps refusals to 413, 422 and 429", (file) => {
    const src = readFileSync(join(__dirname, "..", "..", ...file.split("/")), "utf-8");
    expect(src).toContain("rateLimit(");
    expect(src).toContain("convertDocxSafely(");
    expect(src).not.toContain("convertDocxToMarkdown(");
    expect(src).toContain("status: 413");
    expect(src).toContain("status: 422");
    expect(src).toContain("status: 429");
  });
});

describe("rateLimit", () => {
  beforeEach(() => h.counts.clear());

  it("allows up to the limit in the window, then refuses", async () => {
    for (let i = 0; i < 10; i++) expect(await rateLimit("import:u1", 10, 600)).toBe(true);
    expect(await rateLimit("import:u1", 10, 600)).toBe(false);
    expect(await rateLimit("import:u2", 10, 600)).toBe(true);
  });
});
