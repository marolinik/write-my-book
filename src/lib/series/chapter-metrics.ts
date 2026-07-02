// src/lib/series/chapter-metrics.ts

/**
 * Objective, reproducible text statistics for a chapter, defined to be
 * comparable to the stored StructuredFingerprint baseline:
 *   avgWordsPerSentence      ~ fingerprint.sentenceLength.mean
 *   avgSentencesPerParagraph ~ fingerprint.paragraphLength.mean  (measured in sentences)
 *   dialogueRatio            ~ fingerprint.dialogueRatio          (0..1)
 *
 * dialogueRatio here is an approximation (fraction of sentences containing a
 * quotation mark); it is advisory only and never becomes a finding.
 */
export interface StyleMetrics {
  avgWordsPerSentence: number;
  dialogueRatio: number;
  avgSentencesPerParagraph: number;
}

const QUOTE_CHARS = /["“”«»]/;

/** Drop markdown block atoms so counts approximate the prose the baseline was derived from. */
function stripMarkdown(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t.length === 0) return true;          // keep blank lines (paragraph boundaries)
      if (/^#{1,6}\s/.test(t)) return false;    // headings
      if (/^[-*_]{3,}$/.test(t)) return false;  // scene breaks / horizontal rules
      return true;
    })
    .map((line) => line.replace(/^\s*>\s?/, "").replace(/^\s*(?:[-*+]|\d+\.)\s+/, ""))
    .join("\n");
}

/**
 * Split into sentences. Terminal .!? may be followed by a closing quote/bracket
 * before the whitespace/EOL boundary, so dialogue like `"Run."` splits correctly
 * — the naive /[.!?]+(?:\s|$)/ merges a quoted sentence with the next one
 * because the `.` is followed by `"`, not whitespace (review fix).
 *
 * DEVIATION FROM PLAN (implementer note, see report): the plan's literal
 * regex here was `/[.!?]+["”’')\]]*(?:\s|$)/` (no lookahead). That regex
 * satisfies the "splits a dialogue sentence from the following action beat"
 * test (3 sentences) but fails the "computes dialogue ratio" test, which
 * requires `"Run now!" she cried.` to stay merged as ONE sentence (a
 * lowercase dialogue-tag continuation) rather than split into two — the two
 * plan tests are mutually incompatible under that single regex (confirmed
 * via hex-dump of the plan file to rule out a transcription error). Added a
 * negative lookahead so a lowercase word immediately following the
 * whitespace (a dialogue-tag continuation, e.g. "she cried") is NOT treated
 * as a sentence boundary, while an uppercase word (a genuine new sentence)
 * still is. The lookahead is Unicode-aware (`\p{Ll}`, i.e. any lowercase
 * letter, not just ASCII a-z) so diacritic lowercase dialogue tags (e.g.
 * Serbian "šapnu ona") also stay merged, matching the diacritic-aware
 * normalize() in the sibling ambient-context.ts. This satisfies all 7 cases
 * in the plan's test file plus the i18n locking test.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+["”’')\]]*(?:\s(?!\p{Ll})|$)/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countWords(text: string): number {
  const t = text.trim();
  if (t.length === 0) return 0;
  return t.split(/\s+/).length;
}

export function computeChapterMetrics(text: string): StyleMetrics | null {
  const cleaned = stripMarkdown(text).trim();
  if (cleaned.length === 0) return null;

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) return null;

  const totalWords = sentences.reduce((sum, s) => sum + countWords(s), 0);
  if (totalWords === 0) return null;

  const dialogueSentences = sentences.filter((s) => QUOTE_CHARS.test(s)).length;
  const paragraphCount = paragraphs.length > 0 ? paragraphs.length : 1;

  return {
    avgWordsPerSentence: totalWords / sentences.length,
    dialogueRatio: dialogueSentences / sentences.length,
    avgSentencesPerParagraph: sentences.length / paragraphCount,
  };
}
