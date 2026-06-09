import type { ExportFormatConfig } from "./types";

const EXPORT_CONFIGS: Record<string, ExportFormatConfig> = {
  en: {
    pageSize: "letter",
    bodyFont: "Times New Roman",
    hyphenationLang: "en-US",
    lineSpacing: 1.5,
    paragraphIndent: 1.27,
    openQuote: "\u201C",
    closeQuote: "\u201D",
  },
  "sr-Cyrl": {
    pageSize: "a4",
    bodyFont: "Times New Roman",
    hyphenationLang: "sr-Cyrl",
    lineSpacing: 1.5,
    paragraphIndent: 1.25,
    openQuote: "\u201E",
    closeQuote: "\u201C",
  },
  "sr-Latn": {
    pageSize: "a4",
    bodyFont: "Times New Roman",
    hyphenationLang: "sr-Latn",
    lineSpacing: 1.5,
    paragraphIndent: 1.25,
    openQuote: "\u201E",
    closeQuote: "\u201C",
  },
};

/** Normalize language codes — e.g. plain "sr" → "sr-Latn" */
const LANGUAGE_ALIASES: Record<string, string> = {
  sr: "sr-Latn",
};

/** Get per-language export formatting config. Falls back to English. */
export function getExportFormatConfig(
  languageCode: string
): ExportFormatConfig {
  const resolved = LANGUAGE_ALIASES[languageCode] ?? languageCode;
  return EXPORT_CONFIGS[resolved] ?? EXPORT_CONFIGS.en;
}
