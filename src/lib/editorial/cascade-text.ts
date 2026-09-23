/**
 * The words of a cascade warning, in the book's language.
 *
 * They were an English template on every book: "[Cascade] Ch.3 finding may
 * affect this chapter: Pismo koje M…", a Serbian finding wrapped in English
 * on a Serbian novel. The kind of note is carried by agentType
 * "cascade-warning", so the text needs no bracketed tag.
 */

import { getAgentStrings } from "@/lib/i18n/agent-strings";

export function cascadeWarningText(
  language: string,
  fromChapter: number,
  finding: string
): { description: string; suggestion: string } {
  const strings = getAgentStrings(language);
  const n = String(fromChapter);
  return {
    description: strings.cascadeWarning.replace("{n}", n).replace("{finding}", finding),
    suggestion: strings.cascadeWarningSuggestion.replace("{n}", n),
  };
}

const LEGACY = /^\[Cascade\] Ch\.(\d+) finding may affect this chapter: ([\s\S]*)$/;

/** Read a warning written by the old English template, to rewrite it. */
export function legacyCascadeWarning(
  description: string
): { fromChapter: number; original: string } | null {
  const m = LEGACY.exec(description);
  return m ? { fromChapter: Number(m[1]), original: m[2] } : null;
}
