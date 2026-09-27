import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StorageAdapter } from "@/lib/storage/types";

/**
 * P6-S17 (UAT 2026-09-25): a Serbian book exported with "Chapter 12" and
 * "Act 2" in its table of contents and body.
 *
 * H-6 taught applyChapterHeading and actHeading the book's language, and the
 * export route hands that language to exportManuscript — which used it for the
 * YAML `lang`, the front matter and the back matter, and then called
 * assembleChapterSections WITHOUT it. Every untitled chapter and every act
 * divider fell back to English. The omnibus path dropped it the same way, and
 * the legacy storage-listing fallback hardcoded "Act N" outright.
 *
 * These drive the real pipeline with pandoc stubbed out and read the manuscript
 * it would have handed to pandoc.
 */

const h = vi.hoisted(() => {
  const CUSTOM = Symbol.for("nodejs.util.promisify.custom");
  const execFileAsyncSpy = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
  const execAsyncSpy = vi.fn().mockResolvedValue({ stdout: "pandoc", stderr: "" });
  return {
    execMock: Object.assign(function () {}, { [CUSTOM]: execAsyncSpy }),
    execFileMock: Object.assign(function () {}, { [CUSTOM]: execFileAsyncSpy }),
    execAsyncSpy,
    execFileAsyncSpy,
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    db: {
      chapter: { findMany: vi.fn() },
      series: { findFirst: vi.fn() },
    },
    findByType: vi.fn(),
    readPinned: vi.fn(),
    storage: {} as Record<string, ReturnType<typeof vi.fn>>,
  };
});

vi.mock("child_process", () => ({ exec: h.execMock, execFile: h.execFileMock }));
vi.mock("fs/promises", () => ({
  writeFile: h.writeFile,
  readFile: h.readFile,
  mkdir: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
  },
}));
vi.mock("@/lib/storage", () => ({
  getBookStorage: () => h.storage,
  getSeriesStorage: () => h.storage,
}));

import {
  exportManuscript,
  exportSeriesOmnibus,
  assembleChapterSections,
} from "@/lib/import-export/export-pipeline";

function stubStorage() {
  h.storage = {
    read: vi.fn().mockResolvedValue(null), // no EXPORT-CONFIG → defaults
    readBuffer: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    writeBuffer: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    list: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
}

/** The markdown the pipeline wrote for pandoc to read. */
function manuscript(): string {
  const call = h.writeFile.mock.calls.find(([p]) => String(p).endsWith("manuscript.md"));
  expect(call, "the pipeline wrote a manuscript").toBeDefined();
  return String(call![1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubStorage();
  h.execAsyncSpy.mockResolvedValue({ stdout: "pandoc", stderr: "" });
  h.execFileAsyncSpy.mockResolvedValue({ stdout: "", stderr: "" });
  h.readFile.mockImplementation(async (p: string) => {
    if (String(p).includes("export-templates")) throw new Error("ENOENT");
    return Buffer.from("PANDOC_OUTPUT");
  });
  // Two untitled chapters, the second opening act 2.
  h.db.chapter.findMany.mockResolvedValue([
    { chapterNumber: 1, actNumber: 1, title: null },
    { chapterNumber: 2, actNumber: 2, title: null },
  ]);
  h.findByType.mockImplementation(async (_t: unknown, n: number) => ({ id: `doc-${n}` }));
  h.readPinned.mockImplementation(async (id: string) => ({ content: `Tekst ${id}.` }));
});

describe("a Serbian book's export (P6-S17)", () => {
  it("heads its untitled chapters and its acts in Serbian", async () => {
    await exportManuscript(
      { bookId: "b1", userId: "u1", format: "epub" },
      h.storage as unknown as StorageAdapter,
      "Šapat ćutanja",
      "sr"
    );

    const md = manuscript();
    expect(md).toContain("# Poglavlje 1");
    expect(md).toContain("# Poglavlje 2");
    expect(md).toContain("## Čin 2");
    expect(md).not.toMatch(/# Chapter \d/);
    expect(md).not.toMatch(/## Act \d/);
  });

  it("does the same inside an omnibus of Serbian books", async () => {
    h.db.series.findFirst.mockResolvedValue({
      id: "s1",
      title: "Legat",
      coverUrl: null,
      books: [
        { id: "b1", bookNumber: 1, name: "Zakletva", language: "sr", coverUrl: null },
        { id: "b2", bookNumber: 2, name: "Povratak", language: "sr", coverUrl: null },
      ],
    });

    await exportSeriesOmnibus({ userId: "u1", seriesId: "s1", format: "epub" });

    const md = manuscript();
    expect(md).toContain("# Poglavlje 1");
    expect(md).toContain("## Čin 2");
    expect(md).not.toMatch(/# Chapter \d/);
    expect(md).not.toMatch(/## Act \d/);
  });

  it("keeps the language on the legacy path that reads chapters from storage", async () => {
    // A pre-DB book: no chapter rows, chapters found by listing storage paths.
    h.db.chapter.findMany.mockResolvedValue([]);
    h.storage.list.mockResolvedValue([
      "manuscript/act-1/chapter-01.md",
      "manuscript/act-2/chapter-02.md",
    ]);
    h.storage.read.mockImplementation(async (p: string) =>
      p.startsWith("manuscript/") ? "Tekst." : null
    );

    const { chapterContent } = await assembleChapterSections({
      bookId: "b1",
      userId: "u1",
      storage: h.storage as unknown as StorageAdapter,
      language: "sr",
    });

    expect(chapterContent).toContain("# Poglavlje 2");
    expect(chapterContent).toContain("## Čin 2");
    expect(chapterContent).not.toContain("Act 2");
  });
});
