import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StorageAdapter } from "@/lib/storage/types";

/**
 * P3-S22 (UAT 2026-09-25): a draft EPUB carried no draft marking at all, and
 * every default-config export printed "diamond-suite" where the scene-break
 * ornament belongs.
 *
 * 1. The pipeline wrote `draft: true` into the manuscript's YAML, but the Lua
 *    filters that mark a draft (draft-watermark.lua) and skip recto starts
 *    (recto-start.lua) read `draft-mode`. Nothing wrote that key, so the
 *    watermark filter the pipeline added for every draft was a no-op for EPUB
 *    and DOCX. Only the Typst template read `draft`, and it stamped page 1.
 * 2. The default export config names its ornament "diamond-suite", and
 *    scene-break.lua prints whatever string it is given.
 *
 * pandoc is stubbed; these read the manuscript and argv the pipeline builds.
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
    db: { chapter: { findMany: vi.fn() } },
    findByType: vi.fn(),
    readPinned: vi.fn(),
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

import { exportManuscript } from "@/lib/import-export/export-pipeline";
import {
  getDefaultExportConfig,
  resolveSceneBreakGlyph,
} from "@/lib/import-export/export-config";

const TEMPLATES = join(process.cwd(), "export-templates");
const template = (name: string) => readFileSync(join(TEMPLATES, name), "utf-8");

function storageWith(config: string | null): StorageAdapter {
  return {
    read: vi.fn(async (p: string) => (p.endsWith("EXPORT-CONFIG.json") ? config : null)),
    readBuffer: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    writeBuffer: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    list: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageAdapter;
}

/** The YAML metadata block the pipeline wrote for pandoc to read. */
function yamlBlock(): string {
  const call = h.writeFile.mock.calls.find(([p]) => String(p).endsWith("manuscript.md"));
  expect(call, "the pipeline wrote a manuscript").toBeDefined();
  const md = String(call![1]);
  return md.slice(0, md.indexOf("\n---", 4) + 4);
}

function pandocArgv(): string[] {
  expect(h.execFileAsyncSpy).toHaveBeenCalledTimes(1);
  return h.execFileAsyncSpy.mock.calls[0][1] as string[];
}

async function exportBook(opts: { isDraft?: boolean; config?: string | null; format?: "epub" | "docx" | "pdf" }) {
  await exportManuscript(
    { bookId: "b1", userId: "u1", format: opts.format ?? "epub", isDraft: opts.isDraft ?? false },
    storageWith(opts.config ?? null),
    "The Ashen Throne",
    "en"
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.execAsyncSpy.mockResolvedValue({ stdout: "pandoc", stderr: "" });
  h.execFileAsyncSpy.mockResolvedValue({ stdout: "", stderr: "" });
  h.readFile.mockImplementation(async (p: string) => {
    if (String(p).includes("export-templates")) throw new Error("ENOENT");
    return Buffer.from("PANDOC_OUTPUT");
  });
  h.db.chapter.findMany.mockResolvedValue([{ chapterNumber: 1, actNumber: 1 }]);
  h.findByType.mockResolvedValue({ id: "doc-1" });
  h.readPinned.mockResolvedValue({ content: "# One\n\nFirst scene.\n\n***\n\nSecond scene." });
});

describe("a draft export (P3-S22)", () => {
  /** Every draft flag a bundled filter or template reads from the metadata. */
  function draftKeysRead(): string[] {
    const keys = new Set<string>();
    for (const lua of ["draft-watermark.lua", "recto-start.lua"]) {
      for (const m of template(lua).matchAll(/meta\["(draft[^"]*)"\]/g)) keys.add(m[1]);
    }
    for (const m of template("typst-book.typ").matchAll(/\$if\((draft[^)]*)\)\$/g)) keys.add(m[1]);
    return [...keys];
  }

  it("writes the draft flag under the key the watermark filter reads", async () => {
    await exportBook({ isDraft: true });

    expect(pandocArgv().some((a) => a.endsWith("draft-watermark.lua"))).toBe(true);
    const keys = draftKeysRead();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(yamlBlock(), `a bundled template reads '${key}'`).toMatch(
        new RegExp(`^${key}: true$`, "m")
      );
    }
  });

  it("leaves a final export unmarked", async () => {
    await exportBook({ isDraft: false });

    expect(yamlBlock()).not.toMatch(/^draft/m);
    expect(pandocArgv().some((a) => a.endsWith("draft-watermark.lua"))).toBe(false);
  });

  it("marks every page of a draft PDF, not only the first", () => {
    // The Typst template's own watermark was a place() before the body — page
    // 1 only. The filter sets it as the page background, which repeats.
    expect(template("draft-watermark.lua")).toMatch(/#set page\(\s*background:/);
    expect(template("typst-book.typ")).not.toMatch(/place\([\s\S]*"DRAFT"/);
  });
});

describe("the scene-break ornament (P3-S22)", () => {
  it("is a glyph by default, not the name of one", () => {
    const glyph = getDefaultExportConfig("x").sceneBreakGlyph;
    expect(glyph).not.toMatch(/[a-z]{2,}/i);
    expect(resolveSceneBreakGlyph(glyph)).toBe(glyph);
  });

  it("resolves the name an older saved config still carries", () => {
    expect(resolveSceneBreakGlyph("diamond-suite")).toBe("♦");
    // A writer's own glyph is theirs to keep.
    expect(resolveSceneBreakGlyph("* * *")).toBe("* * *");
    expect(resolveSceneBreakGlyph("❦")).toBe("❦");
  });

  it("never reaches the manuscript as 'diamond-suite'", async () => {
    const saved = { ...getDefaultExportConfig("The Ashen Throne"), sceneBreakGlyph: "diamond-suite" };
    await exportBook({ config: JSON.stringify(saved) });

    expect(yamlBlock()).toContain('scene-break-ornament: "♦"');
    expect(yamlBlock()).not.toContain("diamond-suite");
    expect(pandocArgv()).toContain("--variable=scene-break-glyph:♦");
  });
});
