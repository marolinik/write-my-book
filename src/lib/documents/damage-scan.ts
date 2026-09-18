/**
 * O3 — find documents that carry damage from before the encoding and language
 * fixes.
 *
 * Two kinds of damage, with different consequences:
 *   - U+FFFD replacement characters are UNRECOVERABLE. The proxy decoded the
 *     upstream stream byte by byte, so every multi-byte character became one
 *     U+FFFD per byte and the original bytes are gone. Such a document can only
 *     be regenerated.
 *   - Double-encoded Latin-1 runs and wrong-language documents are wrong but
 *     legible, so the writer may prefer to fix them by hand.
 *
 * Detection is pure and conservative: a false "your document is broken" costs
 * the writer a regeneration he did not need, so every rule here is one he could
 * confirm by looking.
 */

export type DamageReason =
  | "replacement_chars"
  | "double_encoded"
  | "wrong_language"
  | "empty";

export interface DamageReport {
  damaged: boolean;
  reasons: DamageReason[];
  /** False when the original text cannot be reconstructed - regeneration only. */
  recoverable: boolean;
  replacementChars: number;
  mojibakeRuns: number;
}

/** Function words that identify a language in a document-length sample. */
const LANGUAGE_MARKERS: Record<string, RegExp> = {
  en: /\b(the|and|of|that|with|chapter|characters|should|must|story)\b/gi,
  sr: /\b(je|su|koji|koja|nije|ali|kroz|prema|zbog|poglavlje|likovi|pri[čc]a|treba|da|se)\b/gi,
  de: /\b(der|die|das|und|nicht|kapitel|figuren|muss|eine|mit)\b/gi,
  es: /\b(el|la|los|las|que|con|cap[íi]tulo|personajes|debe|una)\b/gi,
  fr: /\b(le|la|les|des|que|avec|chapitre|personnages|doit|une)\b/gi,
  ru: /\b(и|не|что|это|глава|персонажи|должен|как)\b/gi,
};

/** Below this many words, function-word counting says nothing reliable. A real
 *  book document runs to thousands; this only guards against judging a stub. */
const MIN_WORDS_FOR_LANGUAGE = 15;

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** Latin-1 runs that decode as UTF-8 — the double-encoding signature. */
function countMojibakeRuns(text: string): number {
  let hits = 0;
  for (const match of text.matchAll(/[-ÿ]+/g)) {
    const bytes = Uint8Array.from([...match[0]].map((c) => c.charCodeAt(0)));
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded !== match[0]) hits++;
    } catch {
      // Genuine Latin-1 text — not mojibake.
    }
  }
  return hits;
}

/**
 * Is this document written in a language other than the book's? Only decided
 * when another language scores clearly higher than the expected one, and only
 * for languages this app can actually judge.
 */
function looksWrongLanguage(text: string, expected: string): boolean {
  const expectedRe = LANGUAGE_MARKERS[expected];
  if (!expectedRe) return false;

  const words = text.trim().split(/\s+/).length;
  if (words < MIN_WORDS_FOR_LANGUAGE) return false;

  const expectedHits = count(text, expectedRe);
  let bestOther = 0;
  for (const [code, re] of Object.entries(LANGUAGE_MARKERS)) {
    if (code === expected) continue;
    bestOther = Math.max(bestOther, count(text, re));
  }

  // Twice as many markers from another language, and a real count, not noise.
  return bestOther >= 5 && bestOther > expectedHits * 2;
}

export function scanDocumentContent(
  content: string,
  expectedLanguage: string
): DamageReport {
  const reasons: DamageReason[] = [];
  const replacementChars = count(content, /�/g);
  const mojibake = countMojibakeRuns(content);

  if (content.trim().length === 0) reasons.push("empty");
  if (replacementChars > 0) reasons.push("replacement_chars");
  if (mojibake > 0) reasons.push("double_encoded");
  if (looksWrongLanguage(content, expectedLanguage)) reasons.push("wrong_language");

  return {
    damaged: reasons.length > 0,
    reasons,
    recoverable: replacementChars === 0,
    replacementChars,
    mojibakeRuns: mojibake,
  };
}

/**
 * The workflow that rebuilds a document type, or null when the document is the
 * writer's own work. Nothing may offer to regenerate prose a human wrote.
 */
const REGENERATION: Record<string, string> = {
  CONCEPT: "new-novel",
  SYNOPSIS: "write-synopsis",
  STORY_BIBLE: "create-story-bible",
  ARCHITECTURE: "build-architecture",
  FINGERPRINT: "capture-style",
  ANALYSIS_REPORT: "analyze",
  MARKET_REPORT: "market-analysis",
  CONTINUITY_REPORT: "check-continuity",
  STRUCTURE_PROPOSAL: "restructure",
  SERIES_BIBLE: "create-series-bible",
  SERIES_ARCHITECTURE: "create-series-architecture",
  SERIES_CONTINUITY: "check-series-continuity",
};

export function regenerationWorkflowFor(documentType: string): string | null {
  return REGENERATION[documentType] ?? null;
}
