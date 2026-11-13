// Wave 4 review M-4 (Wave 5 Task 9): "a failed conversion is a 502, never a
// fallback" was pinned only by reading the source. These run the code: pandoc
// is made to fail, the pipeline throws ExportConversionError and uploads
// nothing, and the route answers 502 CONVERSION_FAILED without the detail.
import { describe, it, expect, vi, beforeEach } from "vitest";

// runConverter spawns the real process; these tests drive the pipeline through
// their child_process.execFile mock, so route it there (P2-76).
vi.mock("@/lib/import-export/export-limits", async (orig) => {
  const actual = await orig<typeof import("@/lib/import-export/export-limits")>();
  const cp = await import("child_process");
  const { promisify } = await import("util");
  return {
    ...actual,
    runConverter: (command: string, args: readonly string[], options: { cwd: string; timeoutMs: number }) =>
      promisify(cp.execFile)(command, [...args], { cwd: options.cwd, timeout: options.timeoutMs }),
  };
});
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

  it("the export worker reports CONVERSION_FAILED and never the temp path or pandoc's message (Wave 7)", async () => {
    // The pipeline half is proven above; here the worker's mapping runs for
    // real on the real error class the pipeline throws.
    vi.resetModules();
    const pipeline = await import("@/lib/import-export/export-pipeline");
    vi.doMock("@/lib/import-export/run-export", () => ({
      runBookExport: async () => {
        throw new pipeline.ExportConversionError(String(h.pandocError.message));
      },
      runSeriesExport: vi.fn(),
    }));
    const released: string[] = [];
    vi.doMock("@/lib/queue/export-queue", () => ({ releaseExportSlot: async (u: string) => void released.push(u) }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { processExportJob } = await import("@/lib/queue/export-worker");
    const failure = await processExportJob({
      id: "j1",
      data: { kind: "book", userId: "u1", targetId: "b1", request: { format: "epub" } },
    } as never).catch((e: unknown) => e);
    expect((failure as Error).name).toBe("UnrecoverableError");
    expect((failure as Error).message).toBe("CONVERSION_FAILED");
    expect((failure as Error).message).not.toMatch(/tmp|YAML|pandoc/);
    expect(released).toEqual(["u1"]);
  });
});
