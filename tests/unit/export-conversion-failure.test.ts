// Wave 4 review M-4 (Wave 5 Task 9): "a failed conversion is a 502, never a
// fallback" was pinned only by reading the source. These run the code: pandoc
// is made to fail, the pipeline throws ExportConversionError and uploads
// nothing, and the route answers 502 CONVERSION_FAILED without the detail.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  pandocError: new Error("pandoc: Error parsing YAML metadata at \"/tmp/wmb-export-1234/input.md\" (line 2)"),
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("child_process", async (original) => {
  const real = await original<typeof import("child_process")>();
  return {
    ...real,
    // `which pandoc` / `which typst` succeed...
    exec: (_cmd: string, cb: (err: Error | null, out: { stdout: string; stderr: string }) => void) =>
      cb(null, { stdout: "/usr/bin/tool\n", stderr: "" }),
    // ...but the conversion itself fails.
    execFile: (_file: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => cb(h.pandocError),
  };
});
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({ db: { book: { findFirst: h.findFirst }, chapter: { findMany: h.findMany } } }));

import { exportManuscript, ExportConversionError } from "@/lib/import-export/export-pipeline";
import type { StorageAdapter } from "@/lib/storage/types";

function memoryStorage() {
  const files = new Map<string, Buffer>();
  const writes: string[] = [];
  const storage = {
    read: async (p: string) => files.get(p)?.toString() ?? null,
    readBuffer: async (p: string) => files.get(p) ?? null,
    write: async (p: string, c: string) => void files.set(p, Buffer.from(c)),
    writeBuffer: async (p: string, c: Buffer) => {
      writes.push(p);
      files.set(p, c);
    },
    delete: async () => {},
    exists: async (p: string) => files.has(p),
    list: async () => [...files.keys()],
    listDetailed: async () => [],
    mkdir: async () => {},
  } as unknown as StorageAdapter;
  return { storage, writes };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findFirst.mockResolvedValue({ id: "b1", name: "The Salt Letters", language: "en", coverUrl: null, backCoverUrl: null });
  h.findMany.mockResolvedValue([]);
});

describe("a failed conversion", () => {
  it.each(["docx", "epub", "pdf"] as const)("%s: the pipeline throws ExportConversionError and uploads nothing", async (format) => {
    const { storage, writes } = memoryStorage();
    const failure = await exportManuscript(
      { bookId: "b1", userId: "u1", format, omnibusFrontMatter: "", omnibusChapters: "# One\n\nText." } as never,
      storage,
      "The Salt Letters"
    ).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ExportConversionError);
    expect((failure as ExportConversionError).message).toBe("Export conversion failed");
    expect((failure as ExportConversionError).detail).toContain("YAML");
    expect(writes).toEqual([]);
  });

  it("the route answers 502 CONVERSION_FAILED and never the temp path or pandoc's message", async () => {
    // The pipeline half is proven above; here the route's mapping runs for real
    // on the real error class the pipeline throws.
    vi.doMock("@/lib/storage", () => ({ getBookStorage: () => memoryStorage().storage }));
    vi.resetModules();
    const pipeline = await import("@/lib/import-export/export-pipeline");
    vi.doMock("@/lib/import-export/export-pipeline", () => ({
      ...pipeline,
      exportManuscript: async () => {
        throw new pipeline.ExportConversionError(String(h.pandocError.message));
      },
    }));
    const { POST } = await import("@/app/api/books/[id]/export/route");
    const res = await POST(
      new NextRequest("http://t/api/books/b1/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "epub" }),
      }),
      { params: Promise.resolve({ id: "b1" }) }
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: "Export failed", code: "CONVERSION_FAILED" });
    expect(JSON.stringify(body)).not.toMatch(/tmp|YAML|pandoc/);
  });
});
