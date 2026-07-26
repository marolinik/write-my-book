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

/**
 * D5 — bounded stream/request timeouts. The server `timeout` turns an infinite
 * upstream hang into a deterministic 502-retryable instead of a silent spinner
 * (the no-silent-hang watchdog, spec §7). Ghost is the 60-token autocomplete
 * surface (short); inline-edit produces a 4096-token JSON array (longer).
 */
export const QUICK_ASSIST_TIMEOUT_MS = 12_000;
export const QUICK_ASSIST_TIMEOUT_INLINE_MS = 20_000;

/** Machine-readable code the editor UI keys off to deep-link to model settings. */
export const MODEL_NO_QUICK_SUGGEST_CODE = "MODEL_NO_QUICK_SUGGEST";

/** The two quick-assist surfaces that can hit the honest MODEL_NO_QUICK_SUGGEST 422. */
export type QuickAssistSurface = "ghost-text" | "inline-edit";

/**
 * Writer-facing copy for the honest MODEL_NO_QUICK_SUGGEST fallback, scoped to
 * the surface that actually failed (D-118).
 *
 * The old single message blamed "inline assist" on BOTH surfaces — misleading,
 * because inline edit works on this model (only ghost text, at its 60-token
 * budget, is starved by the model's non-disableable thinking). Ghost copy names
 * autocomplete as the broken surface AND reassures that inline edit still works;
 * inline copy is scoped to inline suggestions only. Both keep pointing at the
 * Settings model picker (the editor deep-links off {@link
 * MODEL_NO_QUICK_SUGGEST_CODE}, not this string).
 */
export function modelNoQuickSuggestMessage(surface: QuickAssistSurface): string {
  if (surface === "ghost-text") {
    return "This model returns only internal reasoning at ghost-text's tiny budget, so it can't produce autocomplete suggestions. Inline edit still works on this model — to use ghost text, pick a different model in Settings.";
  }
  return "This model returns only internal reasoning at this budget, so it can't produce inline rewrite suggestions. Pick a different model for inline suggestions in Settings.";
}

/**
 * @deprecated Use {@link modelNoQuickSuggestMessage} — this single, surface-blind
 * string mislabels the failing surface (D-118). Retained only for legacy callers.
 */
export const MODEL_NO_QUICK_SUGGEST_MESSAGE = modelNoQuickSuggestMessage("inline-edit");

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

/** The settled outcome of a quick-assist generation. */
export type QuickAssistSettlement =
  | { kind: "ok"; text: string }
  | { kind: "reasoning-only" }
  | { kind: "empty"; truncated: boolean };

/**
 * D5 — the single source of truth for the 422/502/ok decision, folded out of
 * both routes (ghost `route.ts` L140-163, inline `route.ts` L181-…) so routes,
 * the fallback path, and the stream engine can never drift.
 *
 * Pure, immutable (reads `content`/`stopReason`, returns a fresh object). It is
 * evaluated post-`finalMessage()` for the stream and post-`create()` for the
 * non-streaming fallback — identical semantics to the historical inline guard:
 *  - non-empty trimmed text  → ok (billable, deliverable)
 *  - thinking-only           → reasoning-only (honest 422 MODEL_NO_QUICK_SUGGEST)
 *  - otherwise (no text)     → empty, `truncated` iff stop_reason === "max_tokens"
 */
export function settleQuickAssist(
  content: readonly ContentBlockLike[] | null | undefined,
  stopReason: string | null
): QuickAssistSettlement {
  const text = extractQuickAssistText(content).trim();
  if (text.length > 0) return { kind: "ok", text };
  if (isReasoningOnly(content)) return { kind: "reasoning-only" };
  return { kind: "empty", truncated: stopReason === "max_tokens" };
}
