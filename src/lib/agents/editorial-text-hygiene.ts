/**
 * Writer-facing editorial text hygiene — two pure, immutable string transforms
 * the tool executors apply at the write boundary so raw model artifacts never
 * reach the writer.
 *
 * DESIGN PRINCIPLE (round-2, Fable over-strip review): the defect is cosmetic
 * (S3 — a leaked "(— wait, no)"), but every FALSE POSITIVE is an S1-class trust
 * violation: rewriting the writer's own words and handing them back. So both
 * transforms strip ONLY an unambiguous artifact shape and, when in any doubt,
 * LEAVE THE TEXT UNCHANGED. Under-stripping is strictly safer than over-stripping.
 *
 * D-50 ({@link stripModelSelfTalk}): removes the model's self-CORRECTION /
 * thinking artifacts (e.g. the verbatim "(— wait, no, those are short)" the
 * judge grep-found in a LINE_EDIT_REPORT). Quote-safe: text inside double
 * quotes is NEVER touched (a writer's quoted dialogue must survive byte-for-
 * byte). Only the retraction shape (a cue immediately in its negation sense)
 * is a cue — bare `wait` / `hold on` / `or is it` / `never mind X` are
 * legitimate craft imperatives and are left alone.
 *
 * D-49 ({@link stripFabricatedFingerprintQuotes}): finding rationales fabricate
 * verbatim quotations OF the style fingerprint. A quote is de-quoted only when a
 * directional attribution frame GOVERNS it (fingerprint/voice SAYS/CALLS/NAMES
 * "…") AND it is absent from BOTH the fingerprint doc and the writer's
 * manuscript. Mere proximity of a cue word is not enough; a chapter quote is the
 * writer's words and is never a fabrication.
 *
 * Both are deterministic and unit-tested in isolation; neither mutates input.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared: double-quoted spans (straight or curly), used to protect a writer's
// quoted words. Single quotes are apostrophes in prose and are NOT protected.
// ─────────────────────────────────────────────────────────────────────────────
const DOUBLE_QUOTED_SPAN = /"[^"\n]*"|“[^”\n]*”/g;

// The artifact self-CORRECTION shape: a cue in its retraction / thinking sense —
// a cue immediately followed by a comma'd negation, or an inherently-retracting
// phrase. Bare `wait`, `hold on`, `or is it`, `never mind X` are deliberately
// EXCLUDED: they are legitimate craft imperatives ("wait for the reader to…",
// "hold on to the image", "— or is it restraint?", "never mind the comma splice").
const SELF_CORRECTION =
  "(?:wait,\\s*no|no,\\s*wait|actually,\\s*no|scratch that|never\\s?mind,|hmm+,)";

// A parenthetical whose content IS the retraction shape → drop the whole
// parenthetical, e.g. " (— wait, no, those are short)". The inner tail is bound
// to a SINGLE clause: it may not cross a sentence terminator or newline, so an
// unbalanced or multi-sentence "(wait…" never triggers an unbounded blast radius
// (it simply fails to match and is left intact — under-strip is safer).
const PAREN_SELFTALK = new RegExp(
  `\\s*\\(\\s*[—–-]?\\s*${SELF_CORRECTION}[^).!?\\n]*\\)`,
  "gi"
);

// A dash-led self-correction clause inside other text → drop from the dash+cue
// to the clause boundary. Only an EM or EN dash may lead it (an ASCII hyphen is
// part of words like "can't-wait" / "wait-and-see", never a self-correction).
const INLINE_SELFCORRECTION = new RegExp(
  `\\s*[—–]+\\s*${SELF_CORRECTION}[^.;!?)—–\\n]*`,
  "gi"
);

// One or more retraction / thinking openers at the very start of the field, e.g.
// "Hmm, " or "Wait, no — ". Imperative openers ("Wait until…", "Wait for…") are
// NOT stripped — only the retraction shape is.
const LEADING_THINKING = new RegExp(
  "^\\s*(?:hmm+,|wait,\\s*no|no,\\s*wait|actually,\\s*no|on second thought,|scratch that,?|okay,\\s*so|ok,\\s*so)[\\s—–,-]*",
  "i"
);

/**
 * Sanitize a single UNQUOTED region. Returns the region byte-identical when no
 * artifact was removed (so quoted regions stitched around it stay byte-exact);
 * only repairs whitespace the removal itself left behind.
 */
function sanitizeUnquotedRegion(region: string, isLeading: boolean): string {
  let out = region.replace(PAREN_SELFTALK, "");
  out = out.replace(INLINE_SELFCORRECTION, "");

  let strippedLeading = false;
  if (isLeading) {
    const before = out;
    out = out.replace(LEADING_THINKING, "");
    strippedLeading = out !== before;
  }

  // Nothing removed → return byte-identical (critical for quote-safe stitching).
  if (out === region) return region;

  // A removal happened → repair only the artifacts the removal left behind.
  out = out
    .replace(/\(\s*\)/g, "") // empty parens left by a removed aside
    .replace(/\s+([,.;:!?])/g, "$1") // space before punctuation
    .replace(/\(\s+/g, "(") // space just inside an opening paren
    .replace(/\s+\)/g, ")") // space just inside a closing paren
    .replace(/[ \t]{2,}/g, " "); // collapse runs of spaces/tabs

  if (strippedLeading) {
    out = out.replace(/^[ \t]+/, ""); // drop leading ws the opener left
    if (out.length > 0) out = out[0].toUpperCase() + out.slice(1);
  }
  return out;
}

/**
 * Strip the model's self-talk / thinking artifacts from a writer-facing string.
 * Quote-safe: double-quoted spans are preserved verbatim. Pure — returns a new
 * string; non-string / empty input is returned unchanged.
 */
export function stripModelSelfTalk(text: string): string {
  if (typeof text !== "string" || text.length === 0) return text;

  // Split into double-quoted (preserved verbatim) and unquoted (sanitized)
  // regions. Only the region that begins at offset 0 is eligible for the
  // leading-opener strip.
  DOUBLE_QUOTED_SPAN.lastIndex = 0;
  let result = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DOUBLE_QUOTED_SPAN.exec(text)) !== null) {
    const regionStart = lastIndex;
    const unquoted = text.slice(lastIndex, m.index);
    if (unquoted.length > 0) {
      result += sanitizeUnquotedRegion(unquoted, regionStart === 0);
    }
    result += m[0]; // quoted region — verbatim, never touched
    lastIndex = m.index + m[0].length;
  }
  const tail = text.slice(lastIndex);
  if (tail.length > 0) {
    result += sanitizeUnquotedRegion(tail, lastIndex === 0);
  }
  return result;
}

// Fingerprint / voice / style nouns that can own an attributive frame.
const FINGERPRINT_NOUN =
  "(?:finger\\s?print|voice(?:\\s+(?:profile|dna|print))?|style(?:\\s+(?:profile|guide|sheet|dna|bible|doc(?:ument)?))?|the profile|signature(?:\\s+(?:style|voice|rhythm|move|device))?|your\\s+(?:voice|style))";

// Attributive verbs that make a nearby quote a CLAIMED verbatim citation. Kept
// deliberately narrow (the explicit says/calls/names/describes/asks-for set) so
// a mere descriptive sentence near a quote is not treated as attribution.
const ATTRIB_VERB =
  "(?:says?|calls?|names?|describes?|labels?|terms?|asks?\\s+for|calls?\\s+for)";

// A DIRECTIONAL attribution frame that governs the quote: a fingerprint noun,
// then (within a short span) an attributive verb, then an optional object / "as",
// ending exactly where the quote opens. Proximity of a cue word alone is NOT
// enough — "Your voice favors compression, but "…" sprawls" has the noun but no
// governing attributive verb, so its quote is left untouched.
const ATTRIBUTION_FRAME = new RegExp(
  `${FINGERPRINT_NOUN}\\b[^"“]{0,48}?\\b${ATTRIB_VERB}\\b(?:\\s+it|\\s+this|\\s+that|\\s+the\\s+\\w+|\\s+its\\s+\\w+)?(?:\\s+as)?[\\s:,]*$`,
  "i"
);

// Straight or curly double-quoted spans (single line, bounded length).
const QUOTED_SPAN = /"([^"\n]{1,240})"|“([^”\n]{1,240})”/g;

/**
 * NFC + glyph-fold (apostrophe / quote / dash variants) + ellipsis-tolerant +
 * whitespace-collapse + lowercase, so glyph variance in a genuine quote does not
 * masquerade as a fabrication.
 */
function normalizeForQuoteMatch(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[’‘＇ʼ`]/g, "'") // apostrophe / single-quote glyphs → '
    .replace(/[“”„‟]/g, '"') // curly double quotes → "
    .replace(/[—–]/g, "-") // em / en dash → hyphen
    .replace(/…|\.\.\./g, "") // tolerate a citation ellipsis
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Drop the quotation marks around any quoted span that a DIRECTIONAL fingerprint-
 * attribution frame governs but that is ABSENT from BOTH the fingerprint doc and
 * the writer's manuscript — a fabricated verbatim citation. Genuine fingerprint
 * quotes, manuscript (writer's own) quotes, non-attributed quotes, and short
 * (1–2 word) terms are left untouched. Fail-safe: with no fingerprint content to
 * check against, nothing is changed.
 * Pure — returns a new string.
 */
export function stripFabricatedFingerprintQuotes(
  text: string,
  fingerprintContent: string | null | undefined,
  manuscriptContent?: string | null
): string {
  if (typeof text !== "string" || text.length === 0) return text;
  if (!fingerprintContent || fingerprintContent.trim().length === 0) return text;

  const fpHaystack = normalizeForQuoteMatch(fingerprintContent);
  const msHaystack =
    manuscriptContent && manuscriptContent.trim().length > 0
      ? normalizeForQuoteMatch(manuscriptContent)
      : null;

  return text.replace(
    QUOTED_SPAN,
    (
      full,
      straight: string | undefined,
      curly: string | undefined,
      offset: number,
      whole: string
    ) => {
      const inner = straight ?? curly ?? "";

      // A one- or two-word term in quotes is emphasis, not a fabricated citation.
      if (inner.trim().split(/\s+/).length < 3) return full;

      // Only a quote GOVERNED by a directional attribution frame is a candidate.
      const preceding = whole.slice(Math.max(0, offset - 160), offset);
      if (!ATTRIBUTION_FRAME.test(preceding)) return full;

      const needle = normalizeForQuoteMatch(inner);

      // Verifiable against the fingerprint → a genuine quote; keep it verbatim.
      if (fpHaystack.includes(needle)) return full;
      // The writer's own manuscript words are NEVER a fingerprint fabrication.
      if (msHaystack && msHaystack.includes(needle)) return full;

      // Fabricated attributed citation → strip only the quotation marks so the
      // surface no longer presents invented text as a verbatim quote.
      return inner;
    }
  );
}
