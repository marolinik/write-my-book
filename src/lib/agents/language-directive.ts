/**
 * The language rule, in one place.
 *
 * M-7: the ekavian/Latin rule for Serbian lived only inside the agent prompt
 * assembler, reached only through a full agent session. Five model surfaces
 * that write straight into the manuscript — AI Rewrite, ghost text, the
 * finding-discussion loop, character chat and the marketing kit — carried at
 * most a bare `(${lang})` code, and one carried nothing at all. A local model
 * given "sr" and no script rule answers in Cyrillic, and that text goes into
 * the chapter.
 *
 * `enforceBookScript` is the guarantee that does not depend on model behaviour;
 * this is what stops the model producing the wrong thing in the first place.
 */

import { LANGUAGE_NAMES } from "./language-names";

/** Latin script and ekavian Serbian, the same wording the agent prompt uses. */
const SERBIAN_RULE =
  `\nSCRIPT: Use ONLY Latin script (latinica), NEVER Cyrillic (ćirilica). ` +
  `Correct: č, ć, š, ž, đ, lj, nj, dž — Wrong: ч, ћ, ш, ж, ђ, љ, њ, џ.` +
  `\nDIALECT: Serbian EKAVIAN, not Croatian and not ijekavian. ` +
  `Write vreme, gde, ko, uvek, posle, deo, lep — never vrijeme, gdje, tko, uvijek, poslije, dio, lijep. ` +
  `Serbian vocabulary: hiljada (not tisuća), hleb (not kruh), voz (not vlak), tačno (not točno), ` +
  `pozorište (not kazalište), opšte (not opće).`;

/**
 * A short language directive for the quick-assist surfaces: the language by
 * name rather than by bare code, plus the script and dialect rules where the
 * language has them. Returns "" for English, which needs no instruction.
 */
export function buildLanguageDirective(language: string | undefined | null): string {
  const code = language || "en";
  if (code === "en") return "";
  const name = LANGUAGE_NAMES[code] ?? code;
  return (
    `\nLANGUAGE: Write in ${name}. Match the language of the surrounding prose exactly — do NOT translate it.` +
    (code === "sr" ? SERBIAN_RULE : "")
  );
}
