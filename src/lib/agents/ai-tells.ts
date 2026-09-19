/**
 * A-23 — AI-tell detection for the language the book is actually written in.
 *
 * The whole apparatus was hardcoded English: "delve", "tapestry", "testament
 * to", "couldn't help but". On the owner's Serbian novel the line editor ran
 * 23 checks, one of which was AI tells, and that check could not fire once —
 * the phrases it hunts do not occur in Serbian prose. The ghostwriter's
 * FORBIDDEN PHRASES list had the same blind spot from the other side: it
 * forbade English phrases it was never going to write.
 *
 * Machine prose fails in two different ways, and they need different lists:
 *
 *  - PHRASES are language-specific. In a non-English language the tells are
 *    usually calques — the English cliché translated literally — because that
 *    is how a model trained mostly on English writes another language.
 *  - PATTERNS are not. Uniform paragraph length, systematic sensory sweeps,
 *    characters who are unfailingly articulate about their feelings: these
 *    survive translation and belong in every language's guidance.
 *
 * A language with no curated phrase list gets the patterns plus an instruction
 * to find its own calques, which is honest. It does not get the English list
 * to hunt for, which would be theatre.
 */

/** Phrase-level tells, per language. */
const PHRASE_TELLS: Record<string, readonly string[]> = {
  en: [
    "delve into", "tapestry of", "testament to", "a dance of",
    "sending shivers", "palpable tension", "in the realm of",
    "it's worth noting", "couldn't help but", "a sense of wonder",
    "navigating the complexities", "rich tapestry", "profound impact",
    "beacon of hope", "unbeknownst to", "interplay between",
    "multifaceted", "underscored by", "a symphony of",
    "cascading", "myriad of", "plethora of",
    "the weight of", "a mixture of", "eyes widened",
    "heart pounded in chest", "let out a breath",
  ],
  // These are the English tells as machine Serbian actually writes them —
  // calques, not idiom. A Serbian novelist does not write "svedočanstvo o" in
  // narration; a model translating its own English habits does.
  sr: [
    "zaroniti u", "splet niti", "svedočanstvo o", "ples svetlosti i senke",
    "slala je žmarce", "opipljiva tenzija", "u carstvu",
    "vredno je pomena", "nije mogao da odoli", "osećaj strahopoštovanja",
    "snažan uticaj", "svetionik nade", "nepoznato njemu",
    "međusobna igra", "višeslojan", "podvučeno", "simfonija",
    "kaskadni", "bezbroj", "mnoštvo",
    "težina tišine", "mešavina osećanja", "oči su joj se raširile",
    "srce mu je tuklo u grudima", "ispustio je dah",
  ],
};

/** Structural tells that survive translation. */
const PATTERN_TELLS = `- Paragraphs that all run the same length (three or four sentences, every time)
- Emotional responses always in the same order: physical sensation, then thought, then action
- Descriptions that sweep all five senses in a systematic order
- Dialogue where each reply neatly answers every point the other character made
- Characters who are unfailingly articulate about what they feel
- Essay rhythm inside fiction: topic sentence, explanation, example, transition
- Three-item lists that escalate ("X, Y, and even Z")
- A paragraph that opens by restating the previous paragraph's last idea`;

/** True when a curated phrase list exists for this language. */
export function hasPhraseTells(language: string | undefined): boolean {
  return Boolean(PHRASE_TELLS[(language ?? "en").split("-")[0]]);
}

/** The phrase tells for a language, or an empty list when none are curated. */
export function phraseTellsFor(language: string | undefined): readonly string[] {
  return PHRASE_TELLS[(language ?? "en").split("-")[0]] ?? [];
}

/**
 * The AI-tell guidance block for a book in this language.
 *
 * Written as instructions to the agent, not as prose about the problem: it is
 * injected into the line editor's and the ghostwriter's prompts.
 */
export function getAiTellGuidance(language: string | undefined): string {
  const lang = (language ?? "en").split("-")[0];
  const phrases = phraseTellsFor(lang);

  const phraseSection =
    phrases.length > 0
      ? `### Phrases to flag (and never to write)
${phrases.map((p) => `"${p}"`).join(", ")}

These are the exact phrases in THIS book's language. Flag the phrase where it appears, not a translation of it.`
      : `### Phrases to flag (and never to write)
No curated list exists for this book's language, and the English list would be useless here — a model writing this language does not write "delve" or "tapestry". Look instead for CALQUES: an English cliché translated literally into this language, in a register no novelist in it would use. A phrase that reads like a translation of something rather than a thing someone wrote is the tell.`;

  return `## AI Tell Detection

${phraseSection}

### Patterns to flag (these hold in every language)
${PATTERN_TELLS}

### When rewriting to fix a tell
1. Preserve the author's sentence-length distribution
2. Stay in the author's vocabulary register — do not upgrade or downgrade it
3. Keep their punctuation habits (em dashes, semicolons, ellipses)
4. Draw metaphors from the domains they already use
5. Keep the paragraph rhythm

A phrase the author uses deliberately and repeatedly is their voice, not a tell. Check <style_fingerprint> before flagging one.`;
}
