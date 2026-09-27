import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StorageAdapter } from "@/lib/storage/types";

/**
 * P3-S18 (UAT 2026-09-25): every final PDF carried a table-of-contents page
 * that held nothing but its running head, and its chapters started on
 * whichever page came next — twelve of twenty-four on a verso.
 *
 * - The front matter marked the TOC with raw LaTeX `\tableofcontents`. The PDF
 *   goes pandoc -> Typst, and the Typst writer drops raw LaTeX, so the page
 *   rendered empty. A filter now turns the marker into Typst's #outline(),
 *   titled in the book's language; the half-title and title page headings are
 *   `unlisted`, so the book's own name is not listed as a chapter.
 * - recto-start.lua returned early for everything but DOCX, on the claim that
 *   the Typst template handled recto starts. It did not. The filter now puts an
 *   odd-page break before every chapter-level page in Typst, outside the block
 *   Typst wraps a div in (a page break inside a container is an error there).
 *
 * pandoc and typst are not part of the unit suite, so these pin the markdown,
 * the filters and the argv the pipeline builds. The real conversion was checked
 * by hand against pandoc 3.9 + typst 0.14.
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

import { exportManuscript } from "@/lib/import-export/export-pipeline";
import { assembleFrontMatter, assembleSeriesFrontMatter } from "@/lib/import-export/front-matter";
import { getDefaultExportConfig } from "@/lib/import-export/export-config";
import { getExportStrings } from "@/lib/import-export/export-strings";
import { BOOK_LANGUAGES } from "@/lib/i18n/book-languages";

const TEMPLATES = join(process.cwd(), "export-templates");
const template = (name: string) => readFileSync(join(TEMPLATES, name), "utf-8");

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

const config = { ...getDefaultExportConfig("Šapat ćutanja"), metadata: { ...getDefaultExportConfig("Šapat ćutanja").metadata, author: "Ana" } };

beforeEach(() => {
  vi.clearAllMocks();
  h.execAsyncSpy.mockResolvedValue({ stdout: "pandoc", stderr: "" });
  h.execFileAsyncSpy.mockResolvedValue({ stdout: "", stderr: "" });
  h.readFile.mockImplementation(async () => Buffer.from("OK"));
  h.db.chapter.findMany.mockResolvedValue([{ chapterNumber: 1, actNumber: 1 }]);
  h.findByType.mockResolvedValue({ id: "doc-1" });
  h.readPinned.mockResolvedValue({ content: "# One\n\nText." });
});

describe("the table of contents marker (P3-S18)", () => {
  it("carries its heading in the book's language", async () => {
    const fm = await assembleFrontMatter(config, storage, "pdf", null, "sr");
    expect(fm).toContain('::: {.toc title="Sadržaj"}');

    const series = await assembleSeriesFrontMatter(config, "Legat", [], "pdf", null, "sr");
    expect(series).toContain('::: {.toc title="Sadržaj"}');
  });

  it("has that heading in every language a book can be written in", () => {
    for (const { code } of BOOK_LANGUAGES) {
      expect(getExportStrings(code).contents, code).toBeTruthy();
    }
    expect(getExportStrings("en").contents).toBe("Contents");
  });

  it("keeps the book's own title pages out of the contents", async () => {
    const fm = await assembleFrontMatter(config, storage, "pdf", null, "sr");
    expect(fm).toContain("::: {.half-title}\n\n# Šapat ćutanja {.unlisted}");
    expect(fm).toContain("::: {.title-page}\n\n# Šapat ćutanja {.unlisted}");

    const series = await assembleSeriesFrontMatter(config, "Legat", [], "pdf", null, "sr");
    expect(series).toContain("# Legat {.unlisted}");
  });
});

describe("toc.lua", () => {
  it("turns the marker into a Typst outline of the chapters, titled from the marker", () => {
    const toc = template("toc.lua");
    expect(toc).toMatch(/classes:includes\(\s*'toc'\s*\)/);
    expect(toc).toMatch(/FORMAT:match\s*'typst'/);
    expect(toc).toContain("#outline(title: ");
    expect(toc).toContain("depth: 1");
    expect(toc).toMatch(/attributes\[\s*'title'\s*\]/);
  });

  it("is applied to every export", async () => {
    await exportManuscript({ bookId: "b1", userId: "u1", format: "pdf" }, storage, "B", "en");
    const argv = h.execFileAsyncSpy.mock.calls[0][1] as string[];
    expect(argv.some((a) => a.startsWith("--lua-filter=") && a.endsWith("toc.lua"))).toBe(true);
  });
});

describe("recto chapter starts in a final PDF (P3-S18)", () => {
  it("are placed for Typst, not only DOCX", () => {
    const recto = template("recto-start.lua");
    expect(recto).toMatch(/FORMAT:match\s*'typst'/);
    expect(recto).toContain('#pagebreak(to: "odd", weak: true)');
    // The break goes between top-level blocks: Typst wraps a div in a block,
    // and a page break inside a container is a compile error.
    expect(recto).toMatch(/for _, block in ipairs\(doc\.blocks\)/);
  });

  it("put nothing before a first page nothing precedes", () => {
    // A DOCX section break there opened the document on an empty section: two
    // blank pages before the half-title, once pandoc's title block was gone.
    const recto = template("recto-start.lua");
    expect(recto).toMatch(/opens_recto_page\(block\) and content_before/);
  });

  it("skip a draft", async () => {
    await exportManuscript({ bookId: "b1", userId: "u1", format: "pdf", isDraft: true }, storage, "B", "en");
    const argv = h.execFileAsyncSpy.mock.calls[0][1] as string[];
    expect(argv.some((a) => a.endsWith("recto-start.lua"))).toBe(false);
  });

  it("run on a final PDF", async () => {
    await exportManuscript({ bookId: "b1", userId: "u1", format: "pdf" }, storage, "B", "en");
    const argv = h.execFileAsyncSpy.mock.calls[0][1] as string[];
    expect(argv.some((a) => a.endsWith("recto-start.lua"))).toBe(true);
  });
});
