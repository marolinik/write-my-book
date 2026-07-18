import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StorageAdapter } from "@/lib/storage/types";

/**
 * D-18 transport lock — exportManuscript must run pandoc via execFile with an
 * ARGV ARRAY, NEVER via exec(joinedShellString). The command-injection fix is
 * only real if the pipeline actually reaches the no-shell transport, so this
 * spies the two child_process entry points and asserts pandoc is invoked
 * through execFile("pandoc", [argv…]) while exec is used ONLY for tool
 * detection (`where`/`which pandoc`).
 */

const PROMISIFY_CUSTOM = Symbol.for("nodejs.util.promisify.custom");

const h = vi.hoisted(() => {
  const execFileAsyncSpy = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
  const execAsyncSpy = vi.fn().mockResolvedValue({ stdout: "pandoc", stderr: "" });
  const CUSTOM = Symbol.for("nodejs.util.promisify.custom");
  return {
    execFileAsyncSpy,
    execAsyncSpy,
    // promisify(execMock) returns the spy via the well-known custom symbol.
    execMock: Object.assign(function () {}, { [CUSTOM]: execAsyncSpy }),
    execFileMock: Object.assign(function () {}, { [CUSTOM]: execFileAsyncSpy }),
    readFile: vi.fn(),
    db: { chapter: { findMany: vi.fn() } },
    findByType: vi.fn(),
    readPinned: vi.fn(),
  };
});

vi.mock("child_process", () => ({
  exec: h.execMock,
  execFile: h.execFileMock,
}));

vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: h.readFile,
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rmdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
  },
}));

import { exportManuscript } from "@/lib/import-export/export-pipeline";

const storage = {
  read: vi.fn().mockResolvedValue(null), // no EXPORT-CONFIG → defaults
  readBuffer: vi.fn().mockResolvedValue(null),
  write: vi.fn().mockResolvedValue(undefined),
  writeBuffer: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
  list: vi.fn().mockResolvedValue([]),
  mkdir: vi.fn().mockResolvedValue(undefined),
} as unknown as StorageAdapter;

beforeEach(() => {
  vi.clearAllMocks();
  h.execAsyncSpy.mockResolvedValue({ stdout: "pandoc", stderr: "" });
  h.execFileAsyncSpy.mockResolvedValue({ stdout: "", stderr: "" });
  // Template lookups (under export-templates) miss; the produced output reads back.
  h.readFile.mockImplementation(async (p: string) => {
    if (String(p).includes("export-templates")) throw new Error("ENOENT");
    return Buffer.from("PANDOC_DOCX_OUTPUT");
  });
  h.db.chapter.findMany.mockResolvedValue([{ chapterNumber: 1, actNumber: 1 }]);
  h.findByType.mockResolvedValue({ id: "doc-1" });
  h.readPinned.mockResolvedValue({ content: "# Chapter One\n\nThe body." });
});

describe("exportManuscript transport (D-18)", () => {
  it("invokes pandoc via execFile(argv[]), not via a joined shell string", async () => {
    const result = await exportManuscript(
      { bookId: "b1", userId: "u1", format: "docx" },
      storage,
      "My Book",
      "en"
    );

    // Success path used the real (non-fallback) format.
    expect(result.format).toBe("docx");

    // Pandoc ran exactly once, through execFile.
    expect(h.execFileAsyncSpy).toHaveBeenCalledTimes(1);
    const [file, args, opts] = h.execFileAsyncSpy.mock.calls[0];
    expect(file).toBe("pandoc");
    expect(Array.isArray(args)).toBe(true);
    expect(args).toContain("--from=markdown");
    expect(args).toContain("--to=docx");
    expect(args).toContain("--standalone");
    expect(args).toContain("--metadata=title:My Book");
    expect(opts).toMatchObject({ timeout: 120000 });

    // exec (shell) was used ONLY for tool detection, never to run pandoc itself.
    for (const call of h.execAsyncSpy.mock.calls) {
      const cmd = String(call[0]);
      expect(cmd).toMatch(/\b(where|which)\b/);
      expect(cmd).not.toContain("--from=markdown");
      expect(cmd).not.toContain("manuscript.md");
    }
  });
});
