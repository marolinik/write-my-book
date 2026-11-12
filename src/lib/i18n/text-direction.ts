/**
 * P2-58: Arabic is an offered book language, and nothing set `dir` anywhere,
 * so an Arabic manuscript was edited, shared and exported left to right.
 * Hebrew, Persian and Urdu are listed for when they are offered.
 */
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

export type TextDirection = "ltr" | "rtl";

export function textDirection(language?: string | null): TextDirection {
  if (!language) return "ltr";
  return RTL_LANGUAGES.has(language.split("-")[0].toLowerCase()) ? "rtl" : "ltr";
}
