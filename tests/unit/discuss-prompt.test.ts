import { describe, it, expect, vi } from "vitest";
import { buildDiscussPrompt, parseDiscussResponse } from "@/lib/editorial/discuss-prompt";

const finding = {
  category: "dialogue",
  severity: "important",
  description: "Milan's line reads as evasive/unclear.",
  rationale: "Readers may miss the stakes.",
  anchorQuote: "\"Maybe,\" Milan said.",
  alternatives: [{ label: "Clarify", originalText: "\"Maybe,\" Milan said.", newText: "\"I won't say,\" Milan said." }],
};

describe("buildDiscussPrompt", () => {
  it("embeds finding, prior turns, and writer memory into the prompt", () => {
    const { system, user } = buildDiscussPrompt({
      finding,
      priorTurns: [{ role: "user", content: "He's evasive on purpose." }],
      writerMessage: "Keep it ambiguous.",
      writerMemoryBlock: "<writer_memory>prefers terse dialogue</writer_memory>",
    });
    expect(system).toContain("dialogue");
    expect(system).toContain("prefers terse dialogue");
    expect(user).toContain("Keep it ambiguous.");
    expect(user).toContain("He's evasive on purpose.");
  });
});

describe("parseDiscussResponse", () => {
  it("(a) plain reply → whole text is assistantMessage, no blocks", () => {
    const r = parseDiscussResponse("You're right, keep it.");
    expect(r.assistantMessage).toBe("You're right, keep it.");
    expect(r.revisedSuggestion).toBeUndefined();
    expect(r.suggestedConstraint).toBeUndefined();
  });

  it("(b) reply + REVISION block", () => {
    const r = parseDiscussResponse(
      ["Try this instead.", "<<<REVISION>>>", "suggestion: \"I won't say,\" Milan said.", "why: keeps intent, adds clarity", "<<<END>>>"].join("\n")
    );
    expect(r.assistantMessage).toBe("Try this instead.");
    expect(r.revisedSuggestion).toBe("\"I won't say,\" Milan said.");
    expect(r.revisedReasoning).toBe("keeps intent, adds clarity");
  });

  it("(c) reply + REVISION + REMEMBER", () => {
    const r = parseDiscussResponse(
      ["Understood.", "<<<REMEMBER category=\"preference\">>>", "Keep Milan's dialogue terse and evasive.", "<<<END>>>"].join("\n")
    );
    expect(r.suggestedConstraint).toEqual({ category: "preference", content: "Keep Milan's dialogue terse and evasive." });
  });

  it("(d) malformed/unclosed block → safe fallback, fields undefined, text preserved", () => {
    const raw = "Here is a thought.\n<<<REVISION>>>\nsuggestion: partial";
    const r = parseDiscussResponse(raw);
    expect(r.revisedSuggestion).toBeUndefined();
    expect(r.assistantMessage).toContain("Here is a thought.");
  });

  it("(e) inline delimiter in prose is preserved, not parsed as a block", () => {
    const r = parseDiscussResponse("I could add a <<<REVISION>>> marker but won't.");
    expect(r.assistantMessage).toBe("I could add a <<<REVISION>>> marker but won't.");
    expect(r.revisedSuggestion).toBeUndefined();
  });

  it("(f) invalid category coerces to constraint", () => {
    const r = parseDiscussResponse(
      ["ok", "<<<REMEMBER category=\"executable_code\">>>", "no dialogue tags", "<<<END>>>"].join("\n")
    );
    expect(r.suggestedConstraint?.category).toBe("constraint");
  });
});

/**
 * D-157 — the model intermittently drifts on the delimiter's bracket count
 * (`<<<REMEMBER category="preference">>` with TWO closing brackets). The old
 * exact-`>>>` regex let the whole block bypass the parser, so (a) raw machine
 * syntax rendered verbatim in the writer's bubble and (b) the stated preference
 * was never persisted to writer memory — while the prose said "I'll remember".
 */
describe("parseDiscussResponse — D-157 control-delimiter drift", () => {
  const expectNoMachineSyntax = (prose: string) => {
    expect(prose).not.toMatch(/<{2,}\s*[A-Z]/);
    expect(prose).not.toMatch(/END\s*>{1,}/);
  };

  it("(D-157.1) two-bracket REMEMBER open parses instead of leaking", () => {
    const r = parseDiscussResponse(
      [
        "You're right — I'll withdraw the flag.",
        '<<<REMEMBER category="preference">>',
        "Preserve her dry taxonomy at emotional peaks.",
        "<<<END>>>",
      ].join("\n")
    );
    expect(r.suggestedConstraint).toEqual({
      category: "preference",
      content: "Preserve her dry taxonomy at emotional peaks.",
    });
    expect(r.assistantMessage).toBe("You're right — I'll withdraw the flag.");
    expectNoMachineSyntax(r.assistantMessage);
  });

  it("(D-157.2) two-bracket END terminator still closes the block", () => {
    const r = parseDiscussResponse(
      ["Noted.", '<<<REMEMBER category="style">>>', "Keep register shifts intentional.", "<<<END>>"].join("\n")
    );
    expect(r.suggestedConstraint).toEqual({ category: "style", content: "Keep register shifts intentional." });
    expect(r.assistantMessage).toBe("Noted.");
  });

  it("(D-157.3) two-bracket open AND two-bracket END together", () => {
    const r = parseDiscussResponse(
      ["Noted.", '<<<REMEMBER category="constraint">>', "No dialogue tags beyond 'said'.", "<<<END>>"].join("\n")
    );
    expect(r.suggestedConstraint).toEqual({ category: "constraint", content: "No dialogue tags beyond 'said'." });
    expectNoMachineSyntax(r.assistantMessage);
  });

  it("(D-157.4) drifted REVISION delimiters parse the same way", () => {
    const r = parseDiscussResponse(
      ["Try this.", "<<<REVISION>>", "suggestion: \"I won't say,\" Milan said.", "why: keeps the evasion", "<<<END>>"].join("\n")
    );
    expect(r.revisedSuggestion).toBe("\"I won't say,\" Milan said.");
    expect(r.revisedReasoning).toBe("keeps the evasion");
    expect(r.assistantMessage).toBe("Try this.");
  });

  it("(D-157.5) REVISION and a drifted REMEMBER in the same reply both survive", () => {
    const r = parseDiscussResponse(
      [
        "Here's a compromise.",
        "<<<REVISION>>>",
        "suggestion: tightened line",
        "why: keeps intent",
        "<<<END>>>",
        '<<<REMEMBER category="preference">>',
        "Trust the narrator's understatement.",
        "<<<END>>>",
      ].join("\n")
    );
    expect(r.revisedSuggestion).toBe("tightened line");
    expect(r.suggestedConstraint?.content).toBe("Trust the narrator's understatement.");
    expect(r.assistantMessage).toBe("Here's a compromise.");
    expectNoMachineSyntax(r.assistantMessage);
  });

  it("(D-157.6) sweep recovers a single-closing-bracket REMEMBER", () => {
    const r = parseDiscussResponse(
      ["Understood.", '<<<REMEMBER category="preference">', "Let the silence stand.", "<<<END>>>"].join("\n")
    );
    expect(r.suggestedConstraint).toEqual({ category: "preference", content: "Let the silence stand." });
    expectNoMachineSyntax(r.assistantMessage);
  });

  it("(D-157.7) sweep recovers an unquoted category attribute", () => {
    const r = parseDiscussResponse(
      ["Understood.", "<<<REMEMBER category=style>>", "Short paragraphs at peaks.", "<<<END>>>"].join("\n")
    );
    expect(r.suggestedConstraint).toEqual({ category: "style", content: "Short paragraphs at peaks." });
    expectNoMachineSyntax(r.assistantMessage);
  });

  it("(D-157.8) an unrecognized control verb is stripped from prose and logged, never silent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = parseDiscussResponse(
        ["Keeping it.", "<<<NOTE>>>", "internal scratchpad", "<<<END>>>"].join("\n")
      );
      expect(r.assistantMessage).toBe("Keeping it.");
      expectNoMachineSyntax(r.assistantMessage);
      expect(r.strippedControlBlocks).toEqual(["NOTE"]);
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls.some((c) => String(c[0]).includes("NOTE"))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("(D-157.9) an empty REMEMBER block is stripped and logged, yielding no constraint", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = parseDiscussResponse(["Agreed.", '<<<REMEMBER category="preference">>>', "<<<END>>>"].join("\n"));
      expect(r.suggestedConstraint).toBeUndefined();
      expect(r.assistantMessage).toBe("Agreed.");
      expect(r.strippedControlBlocks).toEqual(["REMEMBER"]);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("(D-157.10) a well-formed reply is untouched — no sweep, no warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = parseDiscussResponse(
        [
          "Understood.",
          "<<<REVISION>>>",
          "suggestion: new text",
          "why: better",
          "<<<END>>>",
          '<<<REMEMBER category="preference">>>',
          "Keep Milan's dialogue terse.",
          "<<<END>>>",
        ].join("\n")
      );
      expect(r.assistantMessage).toBe("Understood.");
      expect(r.revisedSuggestion).toBe("new text");
      expect(r.suggestedConstraint).toEqual({ category: "preference", content: "Keep Milan's dialogue terse." });
      expect(r.strippedControlBlocks).toBeUndefined();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("(D-157.11) an unclosed drifted block is left in prose, not swallowed", () => {
    const r = parseDiscussResponse(['Here is a thought.', '<<<REMEMBER category="preference">>', "half a block"].join("\n"));
    expect(r.suggestedConstraint).toBeUndefined();
    expect(r.assistantMessage).toContain("Here is a thought.");
    expect(r.assistantMessage).toContain("half a block");
  });

  it("(D-157.12) live-captured leak shape (42a) now parses clean", () => {
    const captured =
      "You're right. If the abstraction enacts her defensive intellectualization, the register shift is character-driven.\n" +
      "\n" +
      '<<<REMEMBER category="style">>\n' +
      "Treat register shifts that mirror a character's psychological defense mechanisms as intentional.\n" +
      "<<<END>>>";
    const r = parseDiscussResponse(captured);
    expect(r.suggestedConstraint?.category).toBe("style");
    expect(r.suggestedConstraint?.content).toContain("psychological defense mechanisms");
    expect(r.assistantMessage).not.toContain("REMEMBER");
    expectNoMachineSyntax(r.assistantMessage);
  });
});
