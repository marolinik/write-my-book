import { describe, it, expect } from "vitest";
import {
  computeConversationView,
  assistantBubbleText,
  REVISION_FALLBACK_TEXT,
  CONSTRAINT_FALLBACK_TEXT,
  STRIPPED_BLOCK_FALLBACK_TEXT,
} from "@/lib/editorial/finding-conversation";
import { parseDiscussResponse } from "@/lib/editorial/discuss-prompt";

const u = (content: string) => ({ role: "user" as const, content });
const a = (content: string) => ({ role: "assistant" as const, content });

describe("computeConversationView", () => {
  it("counts user turns and allows discussion under cap for pending finding", () => {
    const v = computeConversationView({ replies: [u("a"), a("b")], findingStatus: "pending" });
    expect(v.userTurns).toBe(1);
    expect(v.canDiscuss).toBe(true);
    expect(v.resolution).toBe("pending");
  });

  it("caps at 3 user turns", () => {
    const v = computeConversationView({ replies: [u("1"), a("x"), u("2"), a("y"), u("3")], findingStatus: "pending" });
    expect(v.userTurns).toBe(3);
    expect(v.canDiscuss).toBe(false);
    expect(v.resolution).toBe("capped");
  });

  it("latestRevision is preserved when a later plain turn carries no revision (guarded like constraint) — D-104", () => {
    const withRev = a(["ok", "<<<REVISION>>>", "suggestion: new text", "why: better", "<<<END>>>"].join("\n"));
    const plain = a("I agree, keep it.");
    const v = computeConversationView({ replies: [u("i"), withRev, u("ii"), plain], findingStatus: "pending" });
    expect(v.latestRevision).toBe("new text");
    expect(v.latestReasoning).toBe("better");
    const v2 = computeConversationView({ replies: [u("i"), plain, u("ii"), withRev], findingStatus: "pending" });
    expect(v2.latestRevision).toBe("new text");
  });

  it("a later structured-only constraint turn does not drop an earlier mid-thread revision — D-104", () => {
    const withRev = a(["<<<REVISION>>>", "suggestion: grounded new text", "why: it anchors her", "<<<END>>>"].join("\n"));
    const constraintOnly = a(
      ['<<<REMEMBER category="preference">>>', "Preserve her dry taxonomy at emotional peaks.", "<<<END>>>"].join("\n")
    );
    const v = computeConversationView({
      replies: [u("i"), withRev, u("ii"), constraintOnly],
      findingStatus: "pending",
    });
    expect(v.latestRevision).toBe("grounded new text");
    expect(v.latestReasoning).toBe("it anchors her");
    expect(v.latestConstraint?.content).toContain("dry taxonomy");
  });

  it("applied/dismissed are read-only resolutions", () => {
    expect(computeConversationView({ replies: [], findingStatus: "applied" }).resolution).toBe("applied");
    expect(computeConversationView({ replies: [], findingStatus: "dismissed" }).canDiscuss).toBe(false);
  });

  it("surfaces the constraint chip for a drifted (two-bracket) REMEMBER turn — D-157", () => {
    const drifted = a(
      ["Understood.", '<<<REMEMBER category="preference">>', "Preserve her dry taxonomy at emotional peaks.", "<<<END>>>"].join("\n")
    );
    const v = computeConversationView({ replies: [u("i"), drifted], findingStatus: "pending" });
    expect(v.latestConstraint).toEqual({
      category: "preference",
      content: "Preserve her dry taxonomy at emotional peaks.",
    });
  });

  it("is crash-safe on a corrupted assistant row", () => {
    const bad = a("prose\n<<<REVISION>>>\nsuggestion:"); // unclosed
    expect(() => computeConversationView({ replies: [u("x"), bad], findingStatus: "pending" })).not.toThrow();
  });
});

describe("assistantBubbleText", () => {
  it("returns the prose message unchanged for a normal assistant turn", () => {
    expect(assistantBubbleText("I agree, keep it.")).toBe("I agree, keep it.");
  });

  it("returns the prose (not a fallback) when a turn has both prose and a revision", () => {
    const content = ["Here's a tighter beat.", "<<<REVISION>>>", "suggestion: new text", "why: better", "<<<END>>>"].join("\n");
    expect(assistantBubbleText(content)).toBe("Here's a tighter beat.");
  });

  it("falls back to honest copy for a structured-only revision turn (was a blank bubble) — D-104", () => {
    const content = ["<<<REVISION>>>", "suggestion: grounded new text", "why: it anchors her", "<<<END>>>"].join("\n");
    // pre-condition: the parsed prose really is empty for a structured-only turn
    expect(parseDiscussResponse(content).assistantMessage).toBe("");
    const shown = assistantBubbleText(content);
    expect(shown).toBe(REVISION_FALLBACK_TEXT);
    expect(shown.trim().length).toBeGreaterThan(0);
  });

  it("falls back to honest copy for a structured-only constraint turn (was a blank bubble) — D-104", () => {
    const content = ['<<<REMEMBER category="preference">>>', "Preserve her dry taxonomy at emotional peaks.", "<<<END>>>"].join("\n");
    expect(parseDiscussResponse(content).assistantMessage).toBe("");
    expect(assistantBubbleText(content)).toBe(CONSTRAINT_FALLBACK_TEXT);
  });

  it("never renders a drifted (two-bracket) REMEMBER block as prose — D-157", () => {
    const content = ['<<<REMEMBER category="preference">>', "Preserve her dry taxonomy at emotional peaks.", "<<<END>>>"].join("\n");
    const shown = assistantBubbleText(content);
    expect(shown).toBe(CONSTRAINT_FALLBACK_TEXT);
    expect(shown).not.toContain("REMEMBER");
  });

  it("never renders a stripped unrecognized control block as prose — D-157", () => {
    const content = ["<<<NOTE>>>", "internal scratchpad", "<<<END>>>"].join("\n");
    const shown = assistantBubbleText(content);
    expect(shown).toBe(STRIPPED_BLOCK_FALLBACK_TEXT);
    expect(shown).not.toContain("<<<");
  });
});
