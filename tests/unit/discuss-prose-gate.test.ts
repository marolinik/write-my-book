import { describe, it, expect } from "vitest";
import { createDiscussProseGate } from "@/lib/editorial/discuss-prose-gate";
import { controlDelimiterKind, parseDiscussResponse } from "@/lib/editorial/discuss-prompt";

/**
 * D5 (discuss streaming) — the prose gate is the leak-proofing device.
 *
 * A discuss reply is NOT pure prose: the model is instructed to append machine
 * control blocks (`<<<REVISION>>>` / `<<<REMEMBER category="…">>>` … `<<<END>>>`)
 * that the settled view strips (D-104) and, when the model drifts to TWO closing
 * brackets, the D-157 belt-and-braces sweep still strips. Streaming raw provider
 * deltas straight to the writer would put that machine syntax on screen for the
 * seconds it takes the block to finish — the settled sanitizer CANNOT help there,
 * because it only strips a COMPLETE span (opener + terminator) and deliberately
 * leaves an unterminated delimiter alone.
 *
 * So the server gates deltas: it emits only text it can PROVE the settled parser
 * would keep, and withholds everything else until the parse at settle. The gate
 * therefore has one hard invariant, asserted many ways below:
 *
 *   no emitted text ever contains a control delimiter, at any chunk boundary.
 */

/** Feed a delta sequence through one gate; return the concatenated emissions. */
function run(deltas: readonly string[]): { out: string; steps: string[] } {
  const gate = createDiscussProseGate();
  const steps = deltas.map((d) => gate.push(d));
  return { out: steps.join(""), steps };
}

/** Split a whole reply into `size`-char deltas (worst-case chunk boundaries). */
function chop(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

const DRIFTED_TURN = [
  "That's fair — the taxonomy is the character.",
  "",
  '<<<REMEMBER category="preference">>',
  "Milan's plant names stay Latin; do not simplify them.",
  "<<<END>>>",
].join("\n");

const REVISION_TURN = [
  "Agreed, the beat can land harder.",
  "<<<REVISION>>>",
  "suggestion: She bolted for the door.",
  "why: punchier",
  "<<<END>>>",
].join("\n");

describe("controlDelimiterKind — ONE recognizer shared by sweep and gate", () => {
  it("classifies exact and drifted delimiters as control lines", () => {
    expect(controlDelimiterKind("<<<REVISION>>>")).toBe("open");
    expect(controlDelimiterKind('<<<REMEMBER category="preference">>>')).toBe("open");
    // D-157 drift: two closing brackets.
    expect(controlDelimiterKind('<<<REMEMBER category="preference">>')).toBe("open");
    expect(controlDelimiterKind("  <<REMEMBER>>  ")).toBe("open");
    expect(controlDelimiterKind("<<<END>>>")).toBe("end");
    expect(controlDelimiterKind("<END>")).toBe("end");
  });

  it("leaves prose alone — including prose that merely contains brackets", () => {
    expect(controlDelimiterKind("She bolted for the door.")).toBeNull();
    expect(controlDelimiterKind("<sigh> he said, and meant it")).toBeNull();
    expect(controlDelimiterKind("suggestion: She bolted for the door.")).toBeNull();
    expect(controlDelimiterKind("")).toBeNull();
  });
});

describe("createDiscussProseGate — prose passes, control syntax never does", () => {
  it("streams plain prose through unchanged, delta by delta", () => {
    const deltas = ["That's ", "fair — the ", "taxonomy is ", "the character."];
    const { out, steps } = run(deltas);
    expect(out).toBe(deltas.join(""));
    // Typing feel: every delta produced output immediately (nothing buffered).
    expect(steps.every((s) => s.length > 0)).toBe(true);
  });

  it("never emits a REMEMBER block, its body, or its terminator", () => {
    const { out } = run(chop(DRIFTED_TURN, 7));
    expect(out).not.toMatch(/REMEMBER/);
    expect(out).not.toMatch(/<</);
    expect(out).not.toMatch(/>>/);
    expect(out).not.toContain("<<<END>>>");
    expect(out).not.toContain("Milan's plant names stay Latin");
    expect(out.trim()).toBe("That's fair — the taxonomy is the character.");
  });

  it("holds the drifted 2-bracket header even when it is split across chunks", () => {
    // The delimiter arrives one or two characters at a time — the classic
    // "buffer boundary let it through" failure.
    const { out, steps } = run(chop(DRIFTED_TURN, 2));
    expect(out).not.toMatch(/<|>/);
    // Nothing was emitted for any delta that carried a piece of the delimiter.
    const delimiterSteps = steps.filter((s) => s.includes("<") || s.includes(">"));
    expect(delimiterSteps).toEqual([]);
  });

  it("never emits a REVISION block or its suggestion/why body lines", () => {
    const { out } = run(chop(REVISION_TURN, 5));
    expect(out).not.toMatch(/REVISION/);
    expect(out).not.toMatch(/suggestion:/);
    expect(out).not.toMatch(/why:/);
    expect(out.trim()).toBe("Agreed, the beat can land harder.");
  });

  it("emits nothing at all for a structured-only turn (no prose to show yet)", () => {
    const structuredOnly = ["<<<REVISION>>>", "suggestion: Tighter.", "<<<END>>>"].join("\n");
    const { out } = run(chop(structuredOnly, 4));
    expect(out.trim()).toBe("");
  });

  it("resumes emitting prose that follows a closed block", () => {
    const turn = [
      "First, the short answer.",
      "<<<REVISION>>>",
      "suggestion: Tighter.",
      "<<<END>>>",
      "And one more thought after it.",
    ].join("\n");
    const { out } = run(chop(turn, 6));
    expect(out).toContain("First, the short answer.");
    expect(out).toContain("And one more thought after it.");
    expect(out).not.toMatch(/REVISION|suggestion:|<</);
  });

  it("withholds a stray terminator with no opener", () => {
    const { out } = run(["Sure.\n", "<<<END>>>\n", "Done.\n"]);
    expect(out).not.toContain("END");
    expect(out).toContain("Sure.");
    expect(out).toContain("Done.");
  });

  it("holds a '<'-leading partial line until it is proven prose, then emits it whole", () => {
    const gate = createDiscussProseGate();
    // A line that *starts* like a delimiter but turns out to be prose.
    expect(gate.push("<sig")).toBe("");
    expect(gate.push("h> he said")).toBe("");
    // Only once the line terminates can it be classified — then it flows.
    expect(gate.push("\n")).toBe("<sigh> he said\n");
  });

  it("holds a whitespace-only partial (it could still become a delimiter)", () => {
    const gate = createDiscussProseGate();
    expect(gate.push("   ")).toBe("");
    expect(gate.push("<<<REMEMBER>>>")).toBe("");
    expect(gate.push("\nkeep it\n")).toBe("");
    expect(gate.push("<<<END>>>\nback to prose")).toBe("back to prose");
  });

  it("is a no-op on empty deltas", () => {
    const gate = createDiscussProseGate();
    expect(gate.push("")).toBe("");
    expect(gate.push("ok")).toBe("ok");
  });

  it("emits a SUBSET of the settled prose — never a superset (the honest direction)", () => {
    for (const turn of [DRIFTED_TURN, REVISION_TURN]) {
      const streamed = run(chop(turn, 3)).out.trim();
      const settled = parseDiscussResponse(turn).assistantMessage.trim();
      // Every non-empty streamed line must appear in the settled prose, so the
      // swap on `done` can only ADD text, never retract machine syntax.
      for (const line of streamed.split("\n").filter((l) => l.trim())) {
        expect(settled).toContain(line.trim());
      }
    }
  });
});
