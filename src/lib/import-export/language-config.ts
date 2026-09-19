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
  // H-7: everything below fell through to the English entry, so a German book
  // exported on US letter with en-US hyphenation and English curly quotes, and
  // a French one got the same instead of guillemets. Serbian was configured;
  // nothing else was.
  de: {
    pageSize: "a4",
    bodyFont: "Times New Roman",
    hyphenationLang: "de-DE",
    lineSpacing: 1.5,
    paragraphIndent: 1.25,
    // German uses low-high quotes: \u201Eso\u201C
    openQuote: "\u201E",
    closeQuote: "\u201C",
  },
  es: {
    pageSize: "a4",
    bodyFont: "Times New Roman",
    hyphenationLang: "es-ES",
    lineSpacing: 1.5,
    paragraphIndent: 1.25,
    // Spanish dialogue conventionally takes angular quotes: \u00ABas\u00ED\u00BB
    openQuote: "\u00AB",
    closeQuote: "\u00BB",
  },
  fr: {
    pageSize: "a4",
    bodyFont: "Times New Roman",
    hyphenationLang: "fr-FR",
    lineSpacing: 1.5,
    paragraphIndent: 1.25,
    // French guillemets carry their own inner spacing in the template.
    openQuote: "\u00AB",
    closeQuote: "\u00BB",
  },
  ru: {
    pageSize: "a4",
    bodyFont: "Times New Roman",
    hyphenationLang: "ru-RU",
    lineSpacing: 1.5,
    paragraphIndent: 1.25,
    openQuote: "\u00AB",
    closeQuote: "\u00BB",
  },
  zh: {
    pageSize: "a4",
    // A Latin serif cannot set Chinese; the template falls back to a system CJK
    // face, which is still closer than asking for Times New Roman.
    bodyFont: "Noto Serif CJK SC",
    hyphenationLang: "zh-CN",
    lineSpacing: 1.5,
    paragraphIndent: 1.25,
    openQuote: "\u201C",
    closeQuote: "\u201D",
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
