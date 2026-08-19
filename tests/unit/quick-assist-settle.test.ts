import { describe, it, expect } from "vitest";
import {
  settleQuickAssist,
  QUICK_ASSIST_TIMEOUT_MS,
  QUICK_ASSIST_TIMEOUT_INLINE_MS,
} from "@/lib/llm/quick-assist";

/**
 * D5 — `settleQuickAssist` folds the duplicated 422/502 empty-guard branch out
 * of both quick-assist routes (ghost `route.ts` L140-163, inline
 * `route.ts` L181-…) into ONE pure decision reused by routes + the stream
 * engine. Its three outcomes drive the billing decision table:
 *   ok            → deliverable text (bill at settle)
 *   reasoning-only → thinking-only, no text (real 422 MODEL_NO_QUICK_SUGGEST)
 *   empty         → cut-off/whitespace, no text (real 502 retryable)
 */
describe("settleQuickAssist (D5) — the shared 422/502/ok decision", () => {
  it("returns ok with the trimmed text for a genuine continuation", () => {
    const out = settleQuickAssist(
      [{ type: "text", text: "  the wind rose off the water.  " }],
      "end_turn"
    );
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.text).toBe("the wind rose off the water.");
    }
  });

  it("skips leading thinking blocks and settles ok on the text (mixed)", () => {
    const out = settleQuickAssist(
      [
        { type: "thinking", text: undefined },
        { type: "text", text: "a real line." },
      ],
      "end_turn"
    );
    expect(out).toEqual({ kind: "ok", text: "a real line." });
  });

  it("classifies a thinking-only reply as reasoning-only (→ 422)", () => {
    const out = settleQuickAssist(
      [{ type: "thinking" }, { type: "redacted_thinking" }],
      "max_tokens"
    );
    expect(out).toEqual({ kind: "reasoning-only" });
  });

  it("classifies a whitespace-only reply with no thinking as empty (not truncated)", () => {
    const out = settleQuickAssist([{ type: "text", text: "   \n" }], "end_turn");
    expect(out).toEqual({ kind: "empty", truncated: false });
  });

  it("classifies an empty/cut-off reply as empty + truncated on max_tokens", () => {
    const out = settleQuickAssist([], "max_tokens");
    expect(out).toEqual({ kind: "empty", truncated: true });
  });

  it("exposes bounded per-surface stream timeouts (ghost < inline)", () => {
    expect(QUICK_ASSIST_TIMEOUT_MS).toBe(12_000);
    expect(QUICK_ASSIST_TIMEOUT_INLINE_MS).toBe(20_000);
    expect(QUICK_ASSIST_TIMEOUT_MS).toBeLessThan(QUICK_ASSIST_TIMEOUT_INLINE_MS);
  });
});
