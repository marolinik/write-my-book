// P2-73: no reference DOCX shipped, so every custom style the Lua filters ask
// for was synthesized from "Normal" and DOCX exports came out unstyled. The
// reference now ships, and every style a filter names must exist in it.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";

const TEMPLATES = join(__dirname, "..", "..", "export-templates");

function stylesNamedByFilters(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(TEMPLATES).filter((f) => f.endsWith(".lua"))) {
    const lua = readFileSync(join(TEMPLATES, file), "utf8");
    for (const m of lua.matchAll(/'custom-style',\s*'([^']+)'/g)) names.add(m[1]);
    const table = lua.match(/DOCX_STYLES\s*=\s*\{([\s\S]*?)\}/);
    if (table) for (const m of table[1].matchAll(/=\s*'([^']+)'/g)) names.add(m[1]);
  }
  return [...names].sort();
}

async function styleNamesIn(docx: Buffer): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(docx);
  const xml = await zip.file("word/styles.xml")!.async("string");
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<w:style\b[^>]*w:type="(\w+)"[^>]*>[\s\S]*?<w:name w:val="([^"]+)"/g)) out.set(m[2], m[1]);
  return out;
}

describe("reference-genre.docx", () => {
  it("defines, as paragraph styles, every custom style the Lua filters use", async () => {
    const wanted = stylesNamedByFilters();
    expect(wanted).toEqual(expect.arrayContaining(["Scene Break", "First Paragraph", "Epigraph", "Letter", "Text Message"]));
    const have = await styleNamesIn(readFileSync(join(TEMPLATES, "reference-genre.docx")));
    const missing = wanted.filter((name) => have.get(name) !== "paragraph");
    expect(missing).toEqual([]);
  });

  it("the scene-break filter emits a Div (paragraph style), not a Span", () => {
    const lua = readFileSync(join(TEMPLATES, "scene-break.lua"), "utf8");
    expect(lua).toMatch(/pandoc\.Div\(\{pandoc\.Para\(\{pandoc\.Str\(ornament\)\}\)\}, pandoc\.Attr\('', \{\}, \{\{'custom-style', 'Scene Break'\}\}\)\)/);
  });
});

let pandoc = false;
try {
  execFileSync("pandoc", ["--version"], { stdio: "ignore" });
  pandoc = true;
} catch {
  pandoc = false;
}

describe.skipIf(!pandoc)("a real DOCX export (pandoc present)", () => {
  it("puts a scene break in the centered Scene Break paragraph style", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wmb-refdoc-"));
    const md = join(dir, "in.md");
    const out = join(dir, "out.docx");
    writeFileSync(md, "First scene.\n\n---\n\nSecond scene.\n");
    execFileSync("pandoc", [
      md,
      "-o",
      out,
      `--lua-filter=${join(TEMPLATES, "scene-break.lua")}`,
      `--lua-filter=${join(TEMPLATES, "first-para.lua")}`,
      `--reference-doc=${join(TEMPLATES, "reference-genre.docx")}`,
    ]);
    const zip = await JSZip.loadAsync(readFileSync(out));
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toMatch(/<w:pStyle w:val="SceneBreak"\s*\/>/);
    const styles = await zip.file("word/styles.xml")!.async("string");
    const scene = styles.slice(styles.indexOf('w:styleId="SceneBreak"'));
    expect(scene.slice(0, 600)).toMatch(/<w:jc w:val="center"\s*\/>/);
  });
});
