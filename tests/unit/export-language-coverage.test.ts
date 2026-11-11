// P1-25 / P2-58: 10 of the 17 book languages a writer can pick (it, pt, ja,
// ko, nl, pl, sv, tr, ar, hi) fell back to English export boilerplate ("All
// rights reserved.", "Chapter 7") on US letter paper, while the landing page
// promises the export stays in the writer's language. Arabic was offered with
// nothing setting `dir` or `lang` anywhere. Every offered language now has its
// own tables, and Arabic reads right to left in the editor, the share page and
// the export.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BOOK_LANGUAGES } from "@/lib/i18n/book-languages";
import { getExportStrings } from "@/lib/import-export/export-strings";
import { getExportFormatConfig } from "@/lib/import-export/language-config";
import { getDocumentTypeLabels } from "@/lib/agents/tool-labels";
import { textDirection } from "@/lib/i18n/text-direction";
import { buildYamlMetadata } from "@/lib/import-export/export-pipeline";
import { getEditorContentAttributes } from "@/components/editor/editor-utils";
import { localeFor } from "@/lib/i18n/ui-strings";

const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");
const OTHERS = BOOK_LANGUAGES.filter((l) => l.code !== "en").map((l) => [l.code]);

describe("every offered book language", () => {
  it.each(OTHERS)("%s has its own export boilerplate", (code) => {
    const strings = getExportStrings(code);
    const en = getExportStrings("en");
    expect(strings).not.toBe(en);
    expect(strings.allRightsReserved).not.toBe(en.allRightsReserved);
    expect(strings.reproductionNotice).not.toBe(en.reproductionNotice);
    for (const key of ["chapter", "act", "bookNumber"] as const) expect(strings[key]).toContain("{n}");
  });

  it.each(OTHERS)("%s has its own typography on A4", (code) => {
    const config = getExportFormatConfig(code);
    expect(config).not.toBe(getExportFormatConfig("en"));
    expect(config.pageSize).toBe("a4");
  });

  it.each(OTHERS)("%s has every document-type label", (code) => {
    const labels = getDocumentTypeLabels(code);
    expect(labels).not.toBe(getDocumentTypeLabels("en"));
    expect(Object.keys(labels).sort()).toEqual(Object.keys(getDocumentTypeLabels("en")).sort());
  });

  it.each(OTHERS)("%s formats dates in its own locale", (code) => {
    expect(localeFor(code)).not.toBe("en-US");
  });
});

describe("right-to-left books", () => {
  it("Arabic is right to left; the others are not", () => {
    expect(textDirection("ar")).toBe("rtl");
    for (const { code } of BOOK_LANGUAGES.filter((l) => l.code !== "ar")) expect(textDirection(code)).toBe("ltr");
  });

  it("the export carries the direction to pandoc", () => {
    expect(getExportFormatConfig("ar").direction).toBe("rtl");
    const yaml = buildYamlMetadata({
      title: "x", lang: "ar", sceneBreak: "*", paperSize: "a4", mainFont: "f", lineStretch: 1.5, draft: false, dir: "rtl",
    });
    expect(yaml).toContain('dir: "rtl"');
    expect(read("src", "lib", "import-export", "export-pipeline.ts")).toContain("dir: langConfig.direction");
  });

  it("the editor surface carries the book's lang and dir", () => {
    expect(getEditorContentAttributes(false, "Manuscript", "ar")).toMatchObject({ lang: "ar", dir: "rtl" });
    expect(getEditorContentAttributes(false, "Manuscript", "de")).toMatchObject({ lang: "de", dir: "ltr" });
    expect(getEditorContentAttributes(false, "Manuscript")).not.toHaveProperty("dir");
    expect(read("src", "components", "editor", "manuscript-editor.tsx")).toMatch(
      /getEditorContentAttributes\(focusMode, editorAriaLabel, bookLanguage\)/
    );
  });

  it("immersive mode and the share page set lang and dir from the book", () => {
    const immersive = read("src", "components", "editor", "immersive-focus-mode.tsx");
    expect(immersive).toMatch(/dir=\{textDirection\(bookLanguage\)\}/);
    expect(immersive).toMatch(/lang=\{bookLanguage\}/);
    const share = read("src", "app", "share", "[token]", "page.tsx");
    expect(share).toMatch(/dir=\{textDirection\(data\.bookLanguage\)\}/);
  });
});
