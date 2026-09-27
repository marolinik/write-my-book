import { exportConfigSchema } from "@/lib/validation";
import type { ExportConfig } from "./types";

/** Get default export configuration for a book. */
export function getDefaultExportConfig(bookName: string): ExportConfig {
  return {
    metadata: {
      title: bookName,
      subtitle: "",
      author: "",
      seriesName: "",
      seriesNumber: "",
      isbn: "",
      publisher: "",
      copyrightYear: new Date().getFullYear().toString(),
    },
    format: {
      defaultFormats: { docx: true, pdf: true, epub: true },
      trimSize: "6x9",
      customWidth: "",
      customHeight: "",
      genreTemplate: "genre",
    },
    // The glyph itself: scene-break.lua prints whatever string it is given, and
    // this default used to be the NAME "diamond-suite" (P3-S22).
    sceneBreakGlyph: "♦",
    frontMatter: {
      coverPage: false,
      halfTitle: true,
      titlePage: true,
      copyrightPage: true,
      dedication: false,
      tableOfContents: true,
      coverImagePath: "",
      dedicationPath: "",
    },
    backMatter: {
      aboutAuthor: false,
      alsoBy: false,
      acknowledgments: false,
      aboutAuthorPath: "",
      alsoByPath: "",
      acknowledgmentsPath: "",
    },
    styleGuide: {
      oxfordComma: true,
      spellOutNumbers: true,
      closedEmDashes: true,
      thinSpaceEllipsis: true,
      sentenceCaseHeadings: true,
    },
    customTemplates: {
      docxReference: "",
      epubCss: "",
      typstTemplate: "",
    },
    typography: {
      autoHyphenation: true,
      widowOrphanControl: "strict",
      justifiedText: true,
    },
    // UDG-8 (Igor): last quick-export selections are remembered per book.
    quickExport: {
      lastFormat: "docx",
      lastIsDraft: false,
    },
  };
}

/**
 * Ornament names the product itself once saved as a book's scene-break glyph.
 * P3-S22: the default config was "diamond-suite", every config saved from the
 * dialog kept it, and the ornament printed as that word on the page.
 */
const NAMED_SCENE_BREAK_GLYPHS: Record<string, string> = {
  "diamond-suite": "♦",
  "diamond-suit": "♦",
};

/** The glyph to print for a configured scene break; a writer's own glyph is kept. */
export function resolveSceneBreakGlyph(glyph: string): string {
  return NAMED_SCENE_BREAK_GLYPHS[glyph.trim().toLowerCase()] ?? glyph;
}

/** Parse JSON string into validated ExportConfig. */
export function parseExportConfigJson(json: string): ExportConfig {
  const raw = JSON.parse(json);
  return exportConfigSchema.parse(raw);
}

/** Serialize ExportConfig to formatted JSON string. */
export function serializeExportConfig(config: ExportConfig): string {
  return JSON.stringify(config, null, 2);
}
