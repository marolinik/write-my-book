import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StorageAdapter } from "@/lib/storage/types";

/**
 * P3-S19 (UAT 2026-09-25): a DOCX opened on pandoc's own title block — Title
 * "The Ember Crown", Author "Helen Brandt" — and only then reached the
 * half-title the export config asked for. An EPUB carried pandoc's
 * title_page.xhtml between the cover and the configured front matter.
 *
 * The pipeline puts `title`/`author` in the metadata on purpose: that is where
 * the files' dc:title and dc:creator come from. But with that metadata pandoc's
 * docx template prints a visible title block and the EPUB writer adds a title
 * page. The front matter already has its own half-title and title page, so the
 * DOCX now uses a template without the block, and the EPUB is told not to add
 * its page. The metadata stays.
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
    readFile: vi.fn(),
    db: { chapter: { findMany: vi.fn() } },
    findByType: vi.fn(),
    readPinned: vi.fn(),
  };
});

vi.mock("child_process", () => ({ exec: h.execMock, execFile: h.execFileMock }));
vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
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

import { buildPandocArgs, exportManuscript } from "@/lib/import-export/export-pipeline";

const TEMPLATES = join(process.cwd(), "export-templates");

const storage = {
  read: vi.fn().mockResolvedValue(null),
  readBuffer: vi.fn().mockResolvedValue(null),
  write: vi.fn().mockResolvedValue(undefined),
  writeBuffer: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
  list: vi.fn().mockResolvedValue([]),
  mkdir: vi.fn().mockResolvedValue(undefined),
} as unknown as StorageAdapter;

const base = {
  pandocCmd: "pandoc",
  inputPath: "/tmp/x/manuscript.md",
  outputPath: "/tmp/x/out",
  luaFilterPaths: [],
  title: "The Ember Crown",
  sceneBreakGlyph: "♦",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.execAsyncSpy.mockResolvedValue({ stdout: "pandoc", stderr: "" });
  h.execFileAsyncSpy.mockResolvedValue({ stdout: "", stderr: "" });
  // Every bundled template exists.
  h.readFile.mockImplementation(async () => Buffer.from("OK"));
  h.db.chapter.findMany.mockResolvedValue([{ chapterNumber: 1, actNumber: 1 }]);
  h.findByType.mockResolvedValue({ id: "doc-1" });
  h.readPinned.mockResolvedValue({ content: "# One\n\nText." });
});

describe("an EPUB (P3-S19)", () => {
  it("does not get pandoc's own title page", () => {
    const args = buildPandocArgs({ ...base, format: "epub" });
    expect(args).toContain("--epub-title-page=false");
  });

  it("still carries the title as metadata, for dc:title", () => {
    const args = buildPandocArgs({ ...base, format: "epub" });
    expect(args).toContain("--metadata=title:The Ember Crown");
  });
});

describe("a DOCX (P3-S19)", () => {
  const template = () => readFileSync(join(TEMPLATES, "docx-book.openxml"), "utf-8");

  it("is written with a template that has no title block", () => {
    const t = template();
    for (const block of ["$if(title)$", "$if(subtitle)$", "$for(author)$", "$if(date)$", "$if(abstract)$"]) {
      expect(t, block).not.toContain(block);
    }
    // Everything else pandoc's docx template does is still there.
    expect(t).toContain("$body$");
    expect(t).toContain("$sectpr$");
    expect(t).toContain("<w:body>");
  });

  it("passes that template to pandoc", () => {
    const args = buildPandocArgs({ ...base, format: "docx", docxTemplate: "/t/docx-book.openxml" });
    expect(args).toContain("--template=/t/docx-book.openxml");
    // The metadata stays: it is what fills the file's core properties.
    expect(args).toContain("--metadata=title:The Ember Crown");
  });

  it("is the template the pipeline resolves for a DOCX export", async () => {
    await exportManuscript({ bookId: "b1", userId: "u1", format: "docx" }, storage, "The Ember Crown", "en");
    const argv = h.execFileAsyncSpy.mock.calls[0][1] as string[];
    expect(argv).toContain(`--template=${join(TEMPLATES, "docx-book.openxml")}`);
  });
});
