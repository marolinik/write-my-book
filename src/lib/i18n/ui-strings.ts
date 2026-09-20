/**
 * Translated UI strings for the full application interface.
 * Keyed by language code (ISO 639-1). Falls back to English.
 *
 * The dictionaries themselves live one-per-language under ./ui-strings/;
 * this module is the public entry point and keeps every existing import
 * path working.
 */

import type { UIStrings } from "./ui-strings/types";
import { EN } from "./ui-strings/en";
import { SR } from "./ui-strings/sr";
import { DE } from "./ui-strings/de";
import { ES } from "./ui-strings/es";
import { FR } from "./ui-strings/fr";
import { RU } from "./ui-strings/ru";
import { ZH } from "./ui-strings/zh";

export type { UIStrings } from "./ui-strings/types";
export { SUPPORTED_LANGUAGES } from "./ui-strings/types";
import { SUPPORTED_LANGUAGES } from "./ui-strings/types";

const UI_STRINGS: Record<string, UIStrings> = {
  en: EN,
  sr: SR,
  de: DE,
  es: ES,
  fr: FR,
  ru: RU,
  zh: ZH,
};

/** Own-property dictionary lookup — never resolve prototype-chain keys
 * (e.g. "toString") to a "dictionary". */
function ownDict(code: string): UIStrings | undefined {
  return Object.prototype.hasOwnProperty.call(UI_STRINGS, code)
    ? UI_STRINGS[code]
    : undefined;
}

/**
 * Get translated UI strings for a language code.
 * Falls back to English for unsupported languages.
 */
export function getUIStrings(language: string): UIStrings {
  return ownDict(language) ?? ownDict(language.split("-")[0]) ?? EN;
}

/**
 * Languages with a complete UI translation dictionary (D-12). Only these are
 * offered and accepted as the app-interface language. Every other code in
 * SUPPORTED_LANGUAGES remains a valid BOOK/prose language (agents write in
 * it), but the UI chrome would silently fall back to English — so the
 * settings picker and PATCH /api/settings/language must not pretend
 * otherwise.
 */
export const UI_SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES.filter((lang) =>
  Object.prototype.hasOwnProperty.call(UI_STRINGS, lang.code)
);

/** True when the code (or its base tag, e.g. "fr-CA" → "fr") has a UI dictionary. */
export function isUiLanguageSupported(language: string): boolean {
  return (
    ownDict(language) !== undefined ||
    ownDict(language.split("-")[0]) !== undefined
  );
}

/**
 * BCP-47 locale tags for each supported UI language code.
 * Used for number/date formatting (toLocaleString, Intl.*) so output does
 * NOT leak the server/system locale (e.g. Serbian day names or "500.000").
 */
const LOCALE_TAGS: Record<string, string> = {
  en: "en-US",
  // Latin, not the `sr-RS` default: this product writes Serbian in Latin
  // script everywhere else, and Intl was formatting dates in Cyrillic (S3-11).
  sr: "sr-Latn-RS",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  ru: "ru-RU",
  zh: "zh-CN",
};

/**
 * Map a UI language code to a BCP-47 locale tag for number/date formatting.
 * Falls back to "en-US" for unsupported codes. Also handles tags with a
 * region suffix (e.g. "en-GB" -> "en" -> "en-US").
 */
export function localeFor(language: string): string {
  return (
    LOCALE_TAGS[language] ??
    LOCALE_TAGS[language.split("-")[0]] ??
    "en-US"
  );
}

/**
 * Get a writer-friendly label for a chapter status code.
 * Single source of truth — all components should use this.
 */
export function getStatusLabel(status: string, language: string): string {
  const t = getUIStrings(language);
  return (t.chapterStatuses as Record<string, string>)[status] ?? status;
}

