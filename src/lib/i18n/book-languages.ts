/**
 * Languages a book can be written in — the single source of truth for every
 * picker that sets `Book.language` / `Series.language`.
 *
 * This value is not cosmetic: every agent prompt enforces it (CRITICAL LANGUAGE
 * REQUIREMENT in prompt-assembler), so the whole manuscript, every generated
 * document and every finding comes back in this language. A second hardcoded
 * copy of this list would silently drift from the one the prompts understand.
 */

export interface BookLanguageOption {
  /** ISO code stored on the book. */
  code: string;
  /** Label shown in pickers — endonym in parentheses where it helps. */
  label: string;
}

export const BOOK_LANGUAGES: ReadonlyArray<BookLanguageOption> = [
  { code: "en", label: "English" },
  { code: "sr", label: "Serbian (srpski, latinica)" },
  { code: "de", label: "German (Deutsch)" },
  { code: "es", label: "Spanish (Espanol)" },
  { code: "fr", label: "French (Francais)" },
  { code: "it", label: "Italian (Italiano)" },
  { code: "pt", label: "Portuguese (Portugues)" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "nl", label: "Dutch (Nederlands)" },
  { code: "pl", label: "Polish (Polski)" },
  { code: "sv", label: "Swedish (Svenska)" },
  { code: "tr", label: "Turkish (Turkce)" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
];

/** Label for a stored code, falling back to the code itself. */
export function bookLanguageLabel(code: string): string {
  return BOOK_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
