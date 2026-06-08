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
    sceneBreakGlyph: "diamond-suite",
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
  };
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
