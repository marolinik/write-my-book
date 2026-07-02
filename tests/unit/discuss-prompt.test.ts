import { describe, it, expect } from "vitest";
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
