import { describe, it, expect } from "vitest";
import {
  withQuickAssistReasoning,
  extractQuickAssistText,
  isReasoningOnly,
  QUICK_ASSIST_REASONING,
  MODEL_NO_QUICK_SUGGEST_CODE,
  MODEL_NO_QUICK_SUGGEST_MESSAGE,
  modelNoQuickSuggestMessage,
} from "@/lib/llm/quick-assist";

/**
 * D-100 — quick-assist (ghost-text + inline-edit) reasoning-model robustness.
 * Pure helper contract: reasoning-disable is additive, thinking blocks are
 * skipped in favour of text, and a thinking-only response is detectable so the
 * routes can answer the honest MODEL_NO_QUICK_SUGGEST error.
 */
describe("quick-assist helpers (D-100)", () => {
  it("withQuickAssistReasoning adds reasoning:{enabled:false}, preserving other fields", () => {
    const out = withQuickAssistReasoning({ model: "m", max_tokens: 60, system: "s" });
    expect(out.reasoning).toEqual({ enabled: false });
    expect(out.model).toBe("m");
    expect(out.max_tokens).toBe(60);
    expect(out.system).toBe("s");
    expect(QUICK_ASSIST_REASONING).toEqual({ enabled: false });
  });

  it("extractQuickAssistText skips leading thinking blocks and uses the text (mixed)", () => {
    const content = [
      { type: "thinking", thinking: "hmm" },
      { type: "redacted_thinking" },
      { type: "text", text: "the wind rose off the water." },
    ];
    expect(extractQuickAssistText(content)).toBe("the wind rose off the water.");
  });

  it("extractQuickAssistText returns '' for a thinking-only response", () => {
    expect(
      extractQuickAssistText([{ type: "thinking" }, { type: "redacted_thinking" }])
    ).toBe("");
  });

  it("extractQuickAssistText returns the text unchanged for a normal reply", () => {
    expect(extractQuickAssistText([{ type: "text", text: "hello" }])).toBe("hello");
    expect(extractQuickAssistText([])).toBe("");
    expect(extractQuickAssistText(undefined)).toBe("");
  });

  it("isReasoningOnly is true ONLY when thinking is present with no usable text", () => {
    expect(isReasoningOnly([{ type: "thinking" }, { type: "redacted_thinking" }])).toBe(true);
    expect(isReasoningOnly([{ type: "redacted_thinking" }])).toBe(true);
    // whitespace-only text still counts as no usable text
    expect(isReasoningOnly([{ type: "thinking" }, { type: "text", text: "   \n" }])).toBe(true);
    // has real text → not reasoning-only
    expect(isReasoningOnly([{ type: "thinking" }, { type: "text", text: "hi" }])).toBe(false);
    // no thinking at all → not reasoning-only (a normal empty/truncation)
    expect(isReasoningOnly([{ type: "text", text: "hi" }])).toBe(false);
    expect(isReasoningOnly([])).toBe(false);
    expect(isReasoningOnly(undefined)).toBe(false);
  });

  it("exposes a machine-readable code and a non-empty message for the editor UI", () => {
    expect(MODEL_NO_QUICK_SUGGEST_CODE).toBe("MODEL_NO_QUICK_SUGGEST");
    expect(MODEL_NO_QUICK_SUGGEST_MESSAGE.length).toBeGreaterThan(0);
  });

  it("scopes the honest 422 copy to the surface that actually failed (D-118)", () => {
    const ghost = modelNoQuickSuggestMessage("ghost-text");
    const inline = modelNoQuickSuggestMessage("inline-edit");

    // Ghost copy names the broken surface (ghost text / autocomplete)…
    expect(ghost).toMatch(/ghost|autocomplete/i);
    // …and — the D-118 correction — explicitly says inline edit still works,
    // rather than the old copy that told users to "pick a different model for
    // inline assist" even though inline edit works on this model.
    expect(ghost).toMatch(/inline edit still works/i);
    expect(ghost).toMatch(/settings/i);

    // Inline copy is scoped to inline suggestions only and never blames ghost.
    expect(inline).toMatch(/inline/i);
    expect(inline).not.toMatch(/ghost|autocomplete/i);
    expect(inline).toMatch(/settings/i);

    // The two surfaces get distinct copy.
    expect(ghost).not.toBe(inline);
  });
});
