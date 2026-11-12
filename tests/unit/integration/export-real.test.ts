// P2-66 (Wave 5 Task 9): no test ever produced an export and opened it. Every
// export unit test mocked execFile or tested a helper, and the e2e step
// accepted a 500, so the 09-19 "EPUB returns a .md" defect would pass the
// suite again. This runs the REAL pipeline (pandoc + Typst) on a 3-chapter
// manuscript and opens each file.
//
// Runs where pandoc and typst are on PATH. CI's "Export integration" job sets
// REQUIRE_EXPORT_TOOLS=1, so there a missing tool fails instead of skipping.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { exportManuscript } from "@/lib/import-export/export-pipeline";
import type { StorageAdapter } from "@/lib/storage/types";

function onPath(tool: string): boolean {
  try {
    execFileSync(tool, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const TOOLS = onPath("pandoc") && onPath("typst");
const REQUIRED = process.env.REQUIRE_EXPORT_TOOLS === "1";

class MemoryStorage implements StorageAdapter {
  readonly files = new Map<string, Buffer>();
  async read(path: string) {
    return this.files.get(path)?.toString("utf8") ?? null;
  }
  async readBuffer(path: string) {
    return this.files.get(path) ?? null;
  }
  async write(path: string, content: string) {
    this.files.set(path, Buffer.from(content, "utf8"));
  }
  async writeBuffer(path: string, content: Buffer) {
    this.files.set(path, content);
  }
  async delete(path: string) {
    this.files.delete(path);
  }
  async exists(path: string) {
    return this.files.has(path);
  }
  async list() {
    return [...this.files.keys()];
  }
  async listDetailed() {
    return [...this.files.keys()].map((key) => ({ key, lastModified: null }));
  }
  async mkdir() {}
}

const TITLES = ["The Harbor", "Pismo iz Beograda", "The Return"];
const paragraph = (n: number) =>
  Array.from({ length: 12 }, (_, i) => `Line ${n}.${i}: the tide kept the letters where the harbor wall met the sea, and nobody asked.`).join(" ");
const CHAPTERS = TITLES.map(
  (title, i) => `# ${title}\n\n${paragraph(i)}\n\n${i === 1 ? "Ћирилица остаје ћирилица: шум мора и писма.\n\n" : ""}${paragraph(i + 10)}`
).join("\n\n");

async function run(format: "docx" | "epub" | "pdf") {
  const storage = new MemoryStorage();
  const result = await exportManuscript(
    {
      bookId: "b1",
      userId: "u1",
      format,
      omnibusFrontMatter: "",
      omnibusChapters: CHAPTERS,
      bookList: TITLES.map((title, i) => ({ bookNumber: i + 1, title })),
    } as never,
    storage,
    "The Salt Letters"
  );
  const file = storage.files.get(result.storageKey);
  if (!file) throw new Error(`no file at ${result.storageKey}`);
  return { result, file };
}

function inOrder(text: string, needles: string[]): boolean {
  let at = -1;
  for (const needle of needles) {
    const next = text.indexOf(needle, at + 1);
    if (next < 0) return false;
    at = next;
  }
  return true;
}

describe.skipIf(!TOOLS && !REQUIRED)("a real export, opened (pandoc + Typst)", () => {
  it("has the tools it needs", () => {
    expect(TOOLS, "pandoc and typst must be on PATH (REQUIRE_EXPORT_TOOLS=1)").toBe(true);
  });

  it("DOCX: a Word document holding the chapter titles in order, Cyrillic intact", async () => {
    const { result, file } = await run("docx");
    expect(result.format).toBe("docx");
    expect(result.filename).toMatch(/\.docx$/);
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(inOrder(xml, TITLES)).toBe(true);
    expect(xml).toContain("Ћирилица остаје ћирилица");
  }, 120_000);

  it("EPUB: mimetype first, a navigation document, and the book title", async () => {
    const { result, file } = await run("epub");
    expect(result.filename).toMatch(/\.epub$/);
    // The OCF rule: the first entry is an uncompressed "mimetype".
    expect(file.subarray(30, 38).toString("ascii")).toBe("mimetype");
    const zip = await JSZip.loadAsync(file);
    expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
    const names = Object.keys(zip.files);
    expect(names.some((n) => /nav\.xhtml$/.test(n))).toBe(true);
    const opfName = names.find((n) => n.endsWith(".opf"))!;
    expect(await zip.file(opfName)!.async("string")).toMatch(/<dc:title[^>]*>The Salt Letters<\/dc:title>/);
    const xhtml = await Promise.all(names.filter((n) => n.endsWith(".xhtml")).map((n) => zip.file(n)!.async("string")));
    expect(inOrder(xhtml.join("\n"), TITLES)).toBe(true);
  }, 120_000);

  it("PDF: a real PDF of more than one page", async () => {
    const { result, file } = await run("pdf");
    expect(result.filename).toMatch(/\.pdf$/);
    expect(file.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const text = file.toString("latin1");
    const pages = Number(text.match(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/)?.[1] ?? text.match(/\/Count\s+(\d+)/)?.[1] ?? 0);
    expect(pages).toBeGreaterThan(1);
  }, 120_000);
});
