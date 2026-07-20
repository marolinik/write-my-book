import { describe, it, expect } from "vitest";
import {
  stripModelSelfTalk,
  stripFabricatedFingerprintQuotes,
  stampReportMetadata,
} from "@/lib/agents/editorial-text-hygiene";

/**
 * D-50 (P6 Owen func #4): the writer-facing LINE_EDIT_REPORT — and finding
 * rationales — sometimes carry the model's raw self-talk, e.g. the verbatim
 * "— wait, no, those are short)" the judge grep-found. These are thinking
 * artifacts, never editorial guidance; they must be stripped before the writer
 * sees them.
 *
 * D-49 (P6 Owen func #3): finding rationales fabricate quotations of the style
 * FINGERPRINT — phrases presented as verbatim doc quotes ("clipped, procedural,
 * emotionally controlled") that are grep-verified ABSENT from the fingerprint.
 * We validate any quoted span the rationale attributes to the fingerprint
 * against the actual doc and drop the citation (its quotation marks) for the
 * ones that cannot be verified, leaving genuine quotes and non-fingerprint
 * quotes untouched.
 */

describe("stripModelSelfTalk (D-50)", () => {
  it("removes a fully self-talk parenthetical (the judge's verbatim artifact)", () => {
    const input =
      "These lines run long (— wait, no, those are short) and slow the pace.";
    expect(stripModelSelfTalk(input)).toBe(
      "These lines run long and slow the pace."
    );
  });

  it("removes a mid-parenthetical self-correction, keeping the real aside", () => {
    const input =
      "The sentences here run long (these three especially — wait, no, those are short) which drags.";
    expect(stripModelSelfTalk(input)).toBe(
      "The sentences here run long (these three especially) which drags."
    );
  });

  it("strips a leading thinking opener and re-capitalizes", () => {
    expect(stripModelSelfTalk("Hmm, the pacing sags in paragraph three.")).toBe(
      "The pacing sags in paragraph three."
    );
  });

  it("leaves clean editorial prose unchanged", () => {
    const clean =
      "The dialogue tag slows the exchange; consider cutting it for momentum.";
    expect(stripModelSelfTalk(clean)).toBe(clean);
  });

  it("leaves a legitimate (non-self-talk) parenthetical unchanged", () => {
    const clean = "The metaphor (introduced in chapter 2) returns here.";
    expect(stripModelSelfTalk(clean)).toBe(clean);
  });

  it("is a no-op for empty / non-string input", () => {
    expect(stripModelSelfTalk("")).toBe("");
    expect(stripModelSelfTalk(undefined as unknown as string)).toBe(
      undefined as unknown as string
    );
  });

  // ── Round-2 over-strip guards (Fable BLOCKER + MEDIUMs) ──────────────────────

  it("BLOCKER: never touches self-talk-shaped text INSIDE double quotes (byte-identical)", () => {
    const input =
      'The strongest beat is the line "She grabbed his sleeve — wait, she said, wait — don\'t." Keep it verbatim.';
    // The writer's own quoted dialogue must survive byte-for-byte — rewriting it
    // and handing it back as a "verbatim" quote is the exact D-49 lie.
    expect(stripModelSelfTalk(input)).toBe(input);
  });

  it("MEDIUM: leaves the craft imperative 'Wait for the reader…' unchanged (bare wait is not a cue)", () => {
    const input = "Wait for the reader to catch up before the reveal.";
    expect(stripModelSelfTalk(input)).toBe(input);
  });

  it("MEDIUM: leaves a dash-set 'hold on to the image' aside unchanged", () => {
    const input = "Keep the tension — hold on to the image — through the scene.";
    expect(stripModelSelfTalk(input)).toBe(input);
  });

  it("MEDIUM: leaves '— or is it restraint?' rhetorical turn unchanged", () => {
    const input = "The restraint reads as detachment — or is it restraint?";
    expect(stripModelSelfTalk(input)).toBe(input);
  });

  it("MEDIUM: leaves 'never mind the comma splice' (no retraction comma) unchanged", () => {
    const input = "Fix the run-on — never mind the comma splice — for now.";
    expect(stripModelSelfTalk(input)).toBe(input);
  });

  it("LEADING: leaves imperative 'Wait until…' unchanged (only 'Wait, no —' is the retraction shape)", () => {
    const input = "Wait until the funeral scene to pay this off.";
    expect(stripModelSelfTalk(input)).toBe(input);
  });

  it("PAREN bound: a self-talk paren spanning a sentence terminator is left intact (no blast radius)", () => {
    const input =
      "The middle sags (wait, no. The whole thing needs restructuring.) Consider it.";
    // Under-strip is strictly safer than eating the real sentence inside the paren.
    expect(stripModelSelfTalk(input)).toBe(input);
  });

  it("INLINE lead: an ASCII hyphen never leads a self-correction ('can't-wait' survives)", () => {
    const input = "The reveal is a can't-wait moment; keep the momentum.";
    expect(stripModelSelfTalk(input)).toBe(input);
  });

  it("TRUE POSITIVE still fires: the literal '(— wait, no, those are short)' artifact is stripped from an UNQUOTED region", () => {
    const input =
      "The clauses are balanced (— wait, no, those are short) and controlled.";
    expect(stripModelSelfTalk(input)).toBe(
      "The clauses are balanced and controlled."
    );
  });

  // ── R1 residual (D-49/D-50): a "reads:" / "Original:" line echoes the writer's
  // OWN prose back into the report. An em-dash retraction there is a legitimate
  // craft device (deep-POV self-correction), NOT the model's self-talk, so the
  // strip must skip the whole echo span and preserve it byte-for-byte — while
  // still firing on genuine model self-talk elsewhere in the same report. ───────
  it("R1: preserves an em-dash retraction inside an 'Original:' writer echo while still stripping model self-talk elsewhere in the report", () => {
    const input =
      "Line 12 runs long (— wait, no, those are short) and needs tightening.\n" +
      "Original: She reached for the latch — wait, no, she had already locked it.";
    const expected =
      "Line 12 runs long and needs tightening.\n" +
      "Original: She reached for the latch — wait, no, she had already locked it.";
    expect(stripModelSelfTalk(input)).toBe(expected);
  });

  it("R1: preserves an em-dash retraction inside a 'reads:' writer echo byte-for-byte", () => {
    const input =
      "Paragraph 3 reads: The door was open — wait, no, it only looked ajar in the dark.";
    // Everything after the echo label is the writer's verbatim prose — untouched.
    expect(stripModelSelfTalk(input)).toBe(input);
  });
});

describe("stripFabricatedFingerprintQuotes (D-49)", () => {
  const FINGERPRINT =
    "Voice: long, accretive sentences with and-stacked clauses. Register is " +
    "coastal and sensory. The narrator infers rather than states. Compressed " +
    "paradox is a protected device.";

  it("de-quotes a fingerprint-attributed quote that is ABSENT from the doc", () => {
    const input =
      'This reads flat because the fingerprint calls the voice "clipped, procedural, emotionally controlled" and this line is none of those.';
    // The fabricated verbatim citation loses its quotation marks; the sentence
    // survives, but it no longer claims the doc says those exact words.
    expect(stripFabricatedFingerprintQuotes(input, FINGERPRINT)).toBe(
      "This reads flat because the fingerprint calls the voice clipped, procedural, emotionally controlled and this line is none of those."
    );
  });

  it("keeps a fingerprint-attributed quote that IS present in the doc", () => {
    const input =
      'The fingerprint names "compressed paradox is a protected device" — honor it here.';
    expect(stripFabricatedFingerprintQuotes(input, FINGERPRINT)).toBe(input);
  });

  it("leaves a quoted span with NO fingerprint attribution untouched (e.g. a chapter quote)", () => {
    const input =
      'The line "the rain started at eight" is doing real work and should stay.';
    expect(stripFabricatedFingerprintQuotes(input, FINGERPRINT)).toBe(input);
  });

  it("is a fail-safe no-op when the fingerprint content is empty/unavailable", () => {
    const input =
      'The fingerprint calls this "clipped, procedural, emotionally controlled".';
    expect(stripFabricatedFingerprintQuotes(input, "")).toBe(input);
    expect(stripFabricatedFingerprintQuotes(input, null)).toBe(input);
  });

  it("does not touch a short (1-2 word) quoted term even if fingerprint-attributed", () => {
    const input = 'The fingerprint says "procedural" but the doc is richer.';
    expect(stripFabricatedFingerprintQuotes(input, FINGERPRINT)).toBe(input);
  });

  // ── Round-2 over-strip guards (Fable HIGH + LOW) ────────────────────────────

  it("HIGH: a fingerprint NOUN near a quote is NOT enough — a comparative with no attributive verb is untouched", () => {
    const input =
      'Your voice favors compression, but "the rain had been falling for three days without stopping" sprawls.';
    // "voice" is present but nothing SAYS/CALLS/NAMES the quote — it is a
    // counter-example, not a claimed verbatim citation. Leave it verbatim.
    expect(stripFabricatedFingerprintQuotes(input, FINGERPRINT)).toBe(input);
  });

  it("HIGH: exempts an attributed quote that verbatim-matches the manuscript (the writer's own words)", () => {
    const manuscript =
      "She counted the tide-marks on the seawall and waited for the tide.";
    const input =
      'The fingerprint says "she counted the tide-marks on the seawall" reads flat.';
    // A chapter line is the writer's own prose — never a fingerprint fabrication,
    // even when the rationale wrongly attributes it to the style doc.
    expect(
      stripFabricatedFingerprintQuotes(input, FINGERPRINT, manuscript)
    ).toBe(input);
  });

  it("LOW: keeps a genuine fingerprint quote despite apostrophe / dash glyph variance", () => {
    const fp =
      "The rule of the voice: don't stop—keep going until the beat lands.";
    const input =
      'The fingerprint says "don’t stop–keep going" and this line stalls.';
    // Glyph variance (curly apostrophe, en-dash) must not turn a genuine quote
    // into a false fabrication.
    expect(stripFabricatedFingerprintQuotes(input, fp)).toBe(input);
  });
});

/**
 * D-113 (P1 Maya func, S3): the dev/line-edit report agent invents metadata the
 * system knows deterministically — session 5574be0f's DEV_EDIT_REPORT stated
 * "**Chapter Word Count:** ~570 words" (real 704, byte-verified) and "**Edit
 * Date:** 2025" (real 2026). stampReportMetadata overwrites those header fields
 * with the authoritative values at the write boundary, leaving body prose alone.
 */
describe("stampReportMetadata (D-113)", () => {
  const NOW = new Date("2026-07-20T11:38:00.000Z");

  it("corrects the exact failing report header (word count + edit date) to real values", () => {
    const input =
      "# Developmental Edit Report — Chapter 1 — The Salt Letters\n\n" +
      "**Edit Date:** 2025\n" +
      "**Chapter Word Count:** ~570 words\n" +
      "**Finding Count:** 1 total\n";
    const expected =
      "# Developmental Edit Report — Chapter 1 — The Salt Letters\n\n" +
      "**Edit Date:** 2026-07-20\n" +
      "**Chapter Word Count:** 704 words\n" +
      "**Finding Count:** 1 total\n";
    expect(stampReportMetadata(input, { wordCount: 704, now: NOW })).toBe(
      expected
    );
  });

  it("leaves body prose byte-identical (only header fields are stamped)", () => {
    const body =
      "## Overall Chapter Assessment\n\n" +
      "The chapter is lean by design; the 570-word draft rewards close reading, " +
      "and by that date the pattern is set. Word count matters: keep it tight.\n";
    const input = "**Word Count:** 999 words\n\n" + body;
    const out = stampReportMetadata(input, { wordCount: 704, now: NOW });
    // The prose sentence mentioning "570-word", "by that date" and
    // "Word count matters:" is NOT a metadata field and must survive verbatim.
    expect(out).toContain(body);
    expect(out.startsWith("**Word Count:** 704 words\n")).toBe(true);
  });

  it("handles plain (non-bold) and bulleted metadata field forms", () => {
    expect(
      stampReportMetadata("Word Count: 570", { wordCount: 704, now: NOW })
    ).toBe("Word Count: 704 words");
    expect(
      stampReportMetadata("- Word Count: 570 words", {
        wordCount: 704,
        now: NOW,
      })
    ).toBe("- Word Count: 704 words");
    expect(
      stampReportMetadata("**Word Count**: 570", { wordCount: 704, now: NOW })
    ).toBe("**Word Count**: 704 words");
  });

  it("stamps the date even when no word count is provided (book-scoped report)", () => {
    const input = "**Report Date:** 2025\n\nSome analysis prose.";
    expect(stampReportMetadata(input, { now: NOW })).toBe(
      "**Report Date:** 2026-07-20\n\nSome analysis prose."
    );
  });

  it("does not add or invent a word-count field when none is present", () => {
    const input =
      "# Report\n\nNo metadata header here — just an assessment paragraph.";
    expect(
      stampReportMetadata(input, { wordCount: 704, now: NOW })
    ).toBe(input);
  });

  it("leaves a word-count field alone when no authoritative count is supplied", () => {
    const input = "**Chapter Word Count:** ~570 words";
    // Date-only stamp: with no wordCount, the count field is untouched (safe).
    expect(stampReportMetadata(input, { now: NOW })).toBe(input);
  });

  it("is a no-op for empty / non-string input", () => {
    expect(stampReportMetadata("", { wordCount: 704, now: NOW })).toBe("");
    expect(
      stampReportMetadata(undefined as unknown as string, {
        wordCount: 704,
        now: NOW,
      })
    ).toBe(undefined as unknown as string);
  });
});
