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

const h = vi.hoisted(() => ({ counts: new Map<string, number>(), hang: false }));
vi.mock("@/lib/queue/connection", () => ({
  getAppConnection: () => ({
    set: async (key: string) => {
      if (h.hang) await new Promise(() => {});
      if (!h.counts.has(key)) h.counts.set(key, 0);
      return "OK";
    },
    incr: async (key: string) => {
      const next = (h.counts.get(key) ?? 0) + 1;
      h.counts.set(key, next);
      return next;
    },
    expire: async () => 1,
    // Review M-5: one MULTI round trip; `hang` stands for a Redis that never answers.
    multi: () => {
      const ops: Array<() => unknown> = [];
      const chain = {
        set: (key: string) => {
          ops.push(() => {
            if (!h.counts.has(key)) h.counts.set(key, 0);
            return "OK";
          });
          return chain;
        },
        incr: (key: string) => {
          ops.push(() => {
            const next = (h.counts.get(key) ?? 0) + 1;
            h.counts.set(key, next);
            return next;
          });
          return chain;
        },
        exec: () =>
          h.hang ? new Promise(() => {}) : Promise.resolve(ops.map((op) => [null, op()])),
      };
      return chain;
    },
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
  beforeEach(() => {
    h.counts.clear();
    h.hang = false;
  });

  it("lets the request through within about a second when Redis does not answer (review M-5)", async () => {
    h.hang = true;
    const started = Date.now();
    expect(await rateLimit("import:u9", 10, 600)).toBe(true);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("allows up to the limit in the window, then refuses", async () => {
    for (let i = 0; i < 10; i++) expect(await rateLimit("import:u1", 10, 600)).toBe(true);
    expect(await rateLimit("import:u1", 10, 600)).toBe(false);
    expect(await rateLimit("import:u2", 10, 600)).toBe(true);
  });
});

// Wave 4 review M-2: the inspection inflated each entry whole (up to 200 MB in
// memory) before mammoth inflated it again, and the limiter counted requests,
// not concurrency, so one writer could run many inspections at once.
describe("the inspection streams, and conversions per writer are bounded", () => {
  it("counts inflated bytes chunk by chunk without keeping them", async () => {
    const { inflatesWithin } = await import("@/lib/import-export/docx-archive-guard");
    const data = deflateRawSync(Buffer.alloc(20 * 1024 * 1024));
    let largest = 0;
    expect(await inflatesWithin(data, 20 * 1024 * 1024, (n) => (largest = Math.max(largest, n)))).toBe(true);
    expect(largest).toBeGreaterThan(0);
    expect(largest).toBeLessThanOrEqual(64 * 1024);
    expect(await inflatesWithin(data, 1024 * 1024)).toBe("ARCHIVE_TOO_LARGE");
    expect(await inflatesWithin(Buffer.from("not deflate"), 10)).toBe("NOT_A_DOCX");
  });

  it("a third conversion at once for the same writer is refused, others are not", async () => {
    const buffer = await zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document>hi</w:document>" });
    const gates: Array<() => void> = [];
    const slow = () => new Promise<string>((resolve) => gates.push(() => resolve("# done")));
    const first = convertDocxSafely(buffer, { convert: slow, slotKey: "u1" });
    const second = convertDocxSafely(buffer, { convert: slow, slotKey: "u1" });
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    expect(await convertDocxSafely(buffer, { convert: slow, slotKey: "u1" })).toEqual({ ok: false, code: "RATE_LIMITED" });
    const other = convertDocxSafely(buffer, { convert: async () => "# other", slotKey: "u2" });
    expect(await other).toEqual({ ok: true, markdown: "# other" });
    gates.forEach((open) => open());
    await Promise.all([first, second]);
    expect(await convertDocxSafely(buffer, { convert: async () => "# again", slotKey: "u1" })).toEqual({ ok: true, markdown: "# again" });
  });

  it("a timed-out conversion keeps its slot until it really stops", async () => {
    const buffer = await zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document>hi</w:document>" });
    let release: () => void = () => {};
    const stuck = () => new Promise<string>((resolve) => (release = () => resolve("# late")));
    expect(await convertDocxSafely(buffer, { convert: stuck, slotKey: "u3", timeoutMs: 5 })).toEqual({ ok: false, code: "CONVERSION_TIMEOUT" });
    expect(await convertDocxSafely(buffer, { convert: stuck, slotKey: "u3", timeoutMs: 5 })).toEqual({ ok: false, code: "CONVERSION_TIMEOUT" });
    expect(await convertDocxSafely(buffer, { convert: stuck, slotKey: "u3" })).toEqual({ ok: false, code: "RATE_LIMITED" });
    release();
  });

  it("both import routes pass the writer as the slot and answer 429 when busy", () => {
    for (const route of ["src/app/api/books/[id]/import/route.ts", "src/app/api/books/[id]/import/preview/route.ts"]) {
      const src = readFileSync(join(__dirname, "..", "..", route), "utf-8");
      expect(src, route).toMatch(/slotKey: /);
      expect(src, route).toMatch(/converted\.code === "RATE_LIMITED"[\s\S]{0,200}status: 429/);
    }
  });
});
