/**
 * ISO language code to a full language name the model understands.
 *
 * Its own module so the quick-assist routes — AI Rewrite, ghost text, the
 * finding-discussion loop — can name the book's language without importing the
 * whole prompt assembler. They used to send the bare code, which reaches the
 * model as "the same language as the original text (sv)".
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  sr: "Serbian Latin (srpski, latinica)",
  de: "German (Deutsch)",
  es: "Spanish (español)",
  fr: "French (français)",
  ru: "Russian (русский)",
  zh: "Chinese (中文)",
  it: "Italian (italiano)",
  pt: "Portuguese (português)",
  ja: "Japanese (日本語)",
  ko: "Korean (한국어)",
  nl: "Dutch (Nederlands)",
  pl: "Polish (polski)",
  // L-2: these four are offered by the book-language picker, and without a name
  // here the prompt told the model "This book's language is: sv (code: sv)."
  sv: "Swedish (svenska)",
  tr: "Turkish (Türkçe)",
  ar: "Arabic (العربية)",
  hi: "Hindi (हिन्दी)",
  // Not creatable any more, but books created before the pickers agreed still
  // carry these codes and their prompts must still name the language.
  cs: "Czech (čeština)",
  hr: "Croatian (hrvatski)",
  bs: "Bosnian (bosanski)",
};
