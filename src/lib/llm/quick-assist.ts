/**
 * Quick-assist (ghost-text + inline-edit) LLM helpers — D-100.
 *
 * The seeded free-tier default model (qwen/qwen3.6-27b via OpenRouter) is a
 * reasoning model: at the small token budgets these two "quick suggestion"
 * surfaces use, it spends the ENTIRE budget on thinking / redacted_thinking
 * blocks and returns no text at all. The old empty-result guard then answered a
 * generic, retryable "cut off" 502 forever — a free user's first AI taste was
 * an empty retry loop.
 *
 * Fix (quick-assist call sites ONLY — never the line-edit / dev-edit / discuss /
 * continuity builders):
 *  1. Ask OpenRouter to disable reasoning for the call so the tiny budget goes
 *     to actual text. `reasoning` is an OpenRouter parameter, so it is attached
 *     ONLY on the OpenRouter route (the direct Anthropic API would reject the
 *     unknown field; Anthropic controls thinking via `thinking`, not here).
 *  2. If the model STILL returns no usable text (thinking-only), answer an
 *     honest, machine-readable MODEL_NO_QUICK_SUGGEST error the editor can
 *     deep-link to model settings — instead of the misleading cut-off retry.
 *  3. Skip any leading thinking / redacted_thinking blocks and use the text.
 */

/** OpenRouter reasoning-disable directive (the strongest disable it supports). */
export const QUICK_ASSIST_REASONING = { enabled: false } as const;

/** Machine-readable code the editor UI keys off to deep-link to model settings. */
export const MODEL_NO_QUICK_SUGGEST_CODE = "MODEL_NO_QUICK_SUGGEST";

/** Plain-language, writer-facing copy for the honest fallback. */
export const MODEL_NO_QUICK_SUGGEST_MESSAGE =
  "This model only returns internal reasoning, so it can't produce quick inline suggestions. Choose a different model for inline assist in Settings.";

/** Minimal shape of an Anthropic-style content block we inspect. */
interface ContentBlockLike {
  type: string;
  text?: unknown;
}

/**
 * Attach the OpenRouter reasoning-disable directive to a request-params object.
 * Additive: every existing field is preserved untouched.
 */
export function withQuickAssistReasoning<T extends object>(
  params: T
): T & { reasoning: typeof QUICK_ASSIST_REASONING } {
  return { ...params, reasoning: QUICK_ASSIST_REASONING };
}

/**
 * First usable assistant text, skipping any leading thinking / redacted_thinking
 * blocks (thinking+text mixed → the text is used). Returns "" when no text block
 * is present.
 */
export function extractQuickAssistText(
  content: readonly ContentBlockLike[] | null | undefined
): string {
  if (!content) return "";
  const textBlock = content.find(
    (b) => b.type === "text" && typeof b.text === "string"
  );
  return textBlock && typeof textBlock.text === "string" ? textBlock.text : "";
}

/**
 * True when the response carried ONLY reasoning (thinking / redacted_thinking)
 * and no usable text — the D-100 signature of a reasoning model that cannot
 * produce quick suggestions at these budgets.
 */
export function isReasoningOnly(
  content: readonly ContentBlockLike[] | null | undefined
): boolean {
  if (!content || content.length === 0) return false;
  const hasThinking = content.some(
    (b) => b.type === "thinking" || b.type === "redacted_thinking"
  );
  const hasText = content.some(
    (b) =>
      b.type === "text" &&
      typeof b.text === "string" &&
      b.text.trim().length > 0
  );
  return hasThinking && !hasText;
}
