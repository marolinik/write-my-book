/**
 * Central registry of all supported LLM models across providers.
 * Provides model definitions, cost data, and resolution helpers.
 */

export type LLMProvider = "anthropic" | "openrouter" | "openai" | "gemini" | "grok" | "local";

export type ModelTier = "opus" | "sonnet" | "haiku";

export type CostTier = "$" | "$$" | "$$$";

export interface ModelDefinition {
  /** Unique registry ID, e.g. "anthropic/sonnet" or "openai/gpt-4o" */
  id: string;
  /** Provider that serves the model */
  provider: LLMProvider;
  /** Full model ID sent to the API, e.g. "claude-sonnet-4-5-20250929" */
  modelId: string;
  /** Human-readable name for UI display */
  displayName: string;
  /** Performance tier for backward compatibility */
  tier: ModelTier;
  /** Input cost per 1M tokens (USD) */
  inputCostPer1M: number;
  /** Output cost per 1M tokens (USD) */
  outputCostPer1M: number;
  /** Cost tier: $ (budget), $$ (standard), $$$ (premium) */
  costTier: CostTier;
  /** Whether the model supports tool use */
  supportsTools: boolean;
  /** Whether the model supports streaming */
  supportsStreaming: boolean;
  /** Optional minimum tier required for workflow compatibility */
  minimumTier?: ModelTier;
  /**
   * Hard upper bound on output tokens the model/provider will accept in a
   * single request. When set, requested `max_tokens` MUST be clamped to this
   * value (see {@link clampMaxTokens}) — providers 400-fail fast (no retry)
   * when the request exceeds the model's output ceiling. Omit when the model
   * accepts our default request size; a missing value means "no known cap".
   */
  maxOutputTokens?: number;
  /**
   * Proven unusable for quick-assist (ghost-text + inline-edit): at those
   * surfaces' tiny output budgets the model spends the ENTIRE budget on
   * thinking / redacted_thinking blocks and returns no usable text, and its
   * reasoning cannot be reliably disabled (D-100: `reasoning:{enabled:false}`
   * proved ineffective on qwen/qwen3.6-27b — 6/6 thinking-only). Quick-assist
   * MUST route around any model carrying this flag (see
   * {@link resolveQuickAssistModelFor}); the honest MODEL_NO_QUICK_SUGGEST 422
   * stays the backstop for UNFLAGGED models we haven't proven. Flag ONLY models
   * observed to fail this way — never speculatively.
   */
  unfitForQuickAssist?: boolean;
}

/** Compute cost tier from output cost per 1M tokens */
function computeCostTier(outputCostPer1M: number): CostTier {
  if (outputCostPer1M < 2) return "$";
  if (outputCostPer1M <= 20) return "$$";
  return "$$$";
}

/**
 * All available models across all 5 providers.
 * Anthropic direct models use Anthropic pricing.
 * OpenRouter models use OpenRouter's pricing.
 * OpenAI, Gemini, and Grok use their respective pricing.
 */
export const MODEL_REGISTRY: ModelDefinition[] = [
  // ── Anthropic Direct ──────────────────────────────────────────
  {
    id: "anthropic/opus",
    provider: "anthropic",
    modelId: "claude-opus-4-6",
    displayName: "Claude Opus 4.6 (Direct)",
    tier: "opus",
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    costTier: "$$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "anthropic/sonnet",
    provider: "anthropic",
    modelId: "claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5 (Direct)",
    tier: "sonnet",
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "anthropic/haiku",
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5 (Direct)",
    tier: "haiku",
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── OpenRouter ────────────────────────────────────────────────
  {
    id: "openrouter/opus",
    provider: "openrouter",
    modelId: "anthropic/claude-opus-4-6",
    displayName: "Claude Opus 4.6 (OpenRouter)",
    tier: "opus",
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    costTier: "$$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter/sonnet",
    provider: "openrouter",
    modelId: "anthropic/claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5 (OpenRouter)",
    tier: "sonnet",
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter/haiku",
    provider: "openrouter",
    modelId: "anthropic/claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5 (OpenRouter)",
    tier: "haiku",
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── MiniMax via OpenRouter ──────────────────────────────────
  // Single model mapped to all tiers so the Coach + specialists
  // both route through MiniMax M2.5 when selected.
  {
    id: "openrouter-minimax/opus",
    provider: "openrouter",
    modelId: "minimax/minimax-m2.5",
    displayName: "MiniMax M2.5 (OpenRouter)",
    tier: "opus",
    inputCostPer1M: 0.3,
    outputCostPer1M: 1.1,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-minimax/sonnet",
    provider: "openrouter",
    modelId: "minimax/minimax-m2.5",
    displayName: "MiniMax M2.5 (OpenRouter)",
    tier: "sonnet",
    inputCostPer1M: 0.3,
    outputCostPer1M: 1.1,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-minimax/haiku",
    provider: "openrouter",
    modelId: "minimax/minimax-m2.5",
    displayName: "MiniMax M2.5 (OpenRouter)",
    tier: "haiku",
    inputCostPer1M: 0.3,
    outputCostPer1M: 1.1,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── Qwen 3.5 397B via OpenRouter ──────────────────────────────
  {
    id: "openrouter-qwen/opus",
    provider: "openrouter",
    modelId: "qwen/qwen3.5-397b-a17b",
    displayName: "Qwen 3.5 397B (OpenRouter)",
    tier: "opus",
    inputCostPer1M: 0.55,
    outputCostPer1M: 3.5,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-qwen/sonnet",
    provider: "openrouter",
    modelId: "qwen/qwen3.5-397b-a17b",
    displayName: "Qwen 3.5 397B (OpenRouter)",
    tier: "sonnet",
    inputCostPer1M: 0.55,
    outputCostPer1M: 3.5,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-qwen/haiku",
    provider: "openrouter",
    modelId: "qwen/qwen3.5-397b-a17b",
    displayName: "Qwen 3.5 397B (OpenRouter)",
    tier: "haiku",
    inputCostPer1M: 0.55,
    outputCostPer1M: 3.5,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── Qwen 3.6 27B via OpenRouter ───────────────────────────────
  // Compact, fast generalist — strong prose quality at budget cost.
  {
    id: "openrouter-qwen36/opus",
    provider: "openrouter",
    modelId: "qwen/qwen3.6-27b",
    displayName: "Qwen 3.6 27B (OpenRouter)",
    tier: "opus",
    inputCostPer1M: 0.285,
    outputCostPer1M: 2.4,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
    // D-116/D-117: reasoning model — burns quick-assist budgets on thinking.
    unfitForQuickAssist: true,
  },
  {
    id: "openrouter-qwen36/sonnet",
    provider: "openrouter",
    modelId: "qwen/qwen3.6-27b",
    displayName: "Qwen 3.6 27B (OpenRouter)",
    tier: "sonnet",
    inputCostPer1M: 0.285,
    outputCostPer1M: 2.4,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
    // D-116/D-117: reasoning model — burns quick-assist budgets on thinking.
    unfitForQuickAssist: true,
  },
  {
    id: "openrouter-qwen36/haiku",
    provider: "openrouter",
    modelId: "qwen/qwen3.6-27b",
    displayName: "Qwen 3.6 27B (OpenRouter)",
    tier: "haiku",
    inputCostPer1M: 0.285,
    outputCostPer1M: 2.4,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
    // D-116/D-117: reasoning model — burns quick-assist budgets on thinking.
    unfitForQuickAssist: true,
  },
  // ── Qwen Max Thinking via OpenRouter ──────────────────────────
  {
    id: "openrouter-qwen-max/opus",
    provider: "openrouter",
    modelId: "qwen/qwen3-max-thinking",
    displayName: "Qwen Max Thinking (OpenRouter)",
    tier: "opus",
    inputCostPer1M: 1.2,
    outputCostPer1M: 6.0,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
    // qwen3-max-thinking caps output at 32768; requesting more 400-fails.
    maxOutputTokens: 32768,
  },
  {
    id: "openrouter-qwen-max/sonnet",
    provider: "openrouter",
    modelId: "qwen/qwen3-max-thinking",
    displayName: "Qwen Max Thinking (OpenRouter)",
    tier: "sonnet",
    inputCostPer1M: 1.2,
    outputCostPer1M: 6.0,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
    // qwen3-max-thinking caps output at 32768; requesting more 400-fails.
    maxOutputTokens: 32768,
  },
  {
    id: "openrouter-qwen-max/haiku",
    provider: "openrouter",
    modelId: "qwen/qwen3-max-thinking",
    displayName: "Qwen Max Thinking (OpenRouter)",
    tier: "haiku",
    inputCostPer1M: 1.2,
    outputCostPer1M: 6.0,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
    // qwen3-max-thinking caps output at 32768; requesting more 400-fails.
    maxOutputTokens: 32768,
  },
  // ── Kimi K2.5 via OpenRouter ──────────────────────────────────
  {
    id: "openrouter-kimi/opus",
    provider: "openrouter",
    modelId: "moonshotai/kimi-k2.5",
    displayName: "Kimi K2.5 (OpenRouter)",
    tier: "opus",
    inputCostPer1M: 0.5,
    outputCostPer1M: 2.8,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-kimi/sonnet",
    provider: "openrouter",
    modelId: "moonshotai/kimi-k2.5",
    displayName: "Kimi K2.5 (OpenRouter)",
    tier: "sonnet",
    inputCostPer1M: 0.5,
    outputCostPer1M: 2.8,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-kimi/haiku",
    provider: "openrouter",
    modelId: "moonshotai/kimi-k2.5",
    displayName: "Kimi K2.5 (OpenRouter)",
    tier: "haiku",
    inputCostPer1M: 0.5,
    outputCostPer1M: 2.8,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── GLM-5 via OpenRouter ──────────────────────────────────────
  {
    id: "openrouter-glm/opus",
    provider: "openrouter",
    modelId: "z-ai/glm-5",
    displayName: "GLM-5 (OpenRouter)",
    tier: "opus",
    inputCostPer1M: 0.95,
    outputCostPer1M: 2.55,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-glm/sonnet",
    provider: "openrouter",
    modelId: "z-ai/glm-5",
    displayName: "GLM-5 (OpenRouter)",
    tier: "sonnet",
    inputCostPer1M: 0.95,
    outputCostPer1M: 2.55,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-glm/haiku",
    provider: "openrouter",
    modelId: "z-ai/glm-5",
    displayName: "GLM-5 (OpenRouter)",
    tier: "haiku",
    inputCostPer1M: 0.95,
    outputCostPer1M: 2.55,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── DeepSeek V3.2 via OpenRouter ──────────────────────────────
  {
    id: "openrouter-deepseek/opus",
    provider: "openrouter",
    modelId: "deepseek/deepseek-v3.2",
    displayName: "DeepSeek V3.2 (OpenRouter)",
    tier: "opus",
    inputCostPer1M: 0.25,
    outputCostPer1M: 0.4,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-deepseek/sonnet",
    provider: "openrouter",
    modelId: "deepseek/deepseek-v3.2",
    displayName: "DeepSeek V3.2 (OpenRouter)",
    tier: "sonnet",
    inputCostPer1M: 0.25,
    outputCostPer1M: 0.4,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openrouter-deepseek/haiku",
    provider: "openrouter",
    modelId: "deepseek/deepseek-v3.2",
    displayName: "DeepSeek V3.2 (OpenRouter)",
    tier: "haiku",
    inputCostPer1M: 0.25,
    outputCostPer1M: 0.4,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── OpenAI ──────────────────────────────────────────────────
  {
    id: "openai/gpt-4o",
    provider: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    tier: "opus",
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openai/gpt-4o-mini",
    provider: "openai",
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    tier: "haiku",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openai/o3",
    provider: "openai",
    modelId: "o3",
    displayName: "OpenAI o3",
    tier: "opus",
    inputCostPer1M: 10.0,
    outputCostPer1M: 40.0,
    costTier: "$$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "openai/o4-mini",
    provider: "openai",
    modelId: "o4-mini",
    displayName: "OpenAI o4-mini",
    tier: "sonnet",
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── Google Gemini ─────────────────────────────────────────────
  {
    id: "gemini/2.5-pro",
    provider: "gemini",
    modelId: "gemini-2.5-pro-preview-05-06",
    displayName: "Gemini 2.5 Pro",
    tier: "opus",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "gemini/2.5-flash",
    provider: "gemini",
    modelId: "gemini-2.5-flash-preview-05-20",
    displayName: "Gemini 2.5 Flash",
    tier: "sonnet",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "gemini/2.0-flash",
    provider: "gemini",
    modelId: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    tier: "haiku",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── xAI Grok ──────────────────────────────────────────────────
  {
    id: "grok/grok-4",
    provider: "grok",
    modelId: "grok-4",
    displayName: "Grok-4",
    tier: "opus",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "grok/grok-3",
    provider: "grok",
    modelId: "grok-3",
    displayName: "Grok-3",
    tier: "sonnet",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    costTier: "$$",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "grok/grok-3-mini",
    provider: "grok",
    modelId: "grok-3-mini",
    displayName: "Grok-3 Mini",
    tier: "haiku",
    inputCostPer1M: 0.3,
    outputCostPer1M: 0.5,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // ── Local (LAN vLLM) via Anthropic->OpenAI proxy ──────────────
  // Single self-hosted model on the LAN (vLLM, OpenAI-compatible). Reached
  // through the local-llm-proxy which translates the Anthropic Messages API
  // the app speaks into /v1/chat/completions. Free to run (no token cost),
  // so it doubles as the zero-cost default for local testing.
  {
    id: "local/qwen38",
    provider: "local",
    modelId: "local/qwen38",
    displayName: "Qwen3.8 27B (Local LAN)",
    tier: "sonnet",
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
  // Cheap-tier slot for the LAN model: without a "/haiku" sibling,
  // resolveCheapModelFor("local/…") falls through to anthropic/haiku — a
  // guaranteed key-missing failure for a local-only user (D-119 pattern).
  // Same displayName so the picker collapses the pair into one item.
  {
    id: "local/qwen38-haiku",
    provider: "local",
    modelId: "local/qwen38",
    displayName: "Qwen3.8 27B (Local LAN)",
    tier: "haiku",
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
  },
];

/** Look up a model definition by its registry ID. */
export function getModelDef(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/**
 * Clamp a requested `max_tokens` value to the model's output ceiling.
 * Returns `min(requested, model.maxOutputTokens)` when the model declares a
 * cap, otherwise the requested value unchanged. Callers MUST route every
 * hardcoded `max_tokens` through this so models with lower output caps (e.g.
 * qwen3-max-thinking at 32768) don't 400-fail fast on an oversized request.
 */
export function clampMaxTokens(
  requested: number,
  model: ModelDefinition,
): number {
  return Math.min(requested, model.maxOutputTokens ?? requested);
}

/**
 * Resolve a legacy tier string ("opus", "sonnet", "haiku") to a registry ID.
 * Defaults to the Anthropic direct variant.
 */
export function resolveFromTier(tier: string): ModelDefinition {
  const id = `anthropic/${tier}`;
  const def = getModelDef(id);
  if (def) return def;
  // Fallback to anthropic/sonnet
  return getModelDef("anthropic/sonnet")!;
}

/**
 * Resolve the cheapest ("haiku"-tier) model for the provider implied by a
 * user's default model ID. String-building `${prefix}/haiku` misses for
 * providers whose registry uses different naming (openai/gpt-4o-mini,
 * gemini/grok variants) — and a registry miss silently resolves to
 * anthropic/sonnet, which is the wrong cost AND, for single-key users of
 * another provider, a guaranteed key-missing failure.
 */
export function resolveCheapModelFor(defaultModelId: string): ModelDefinition {
  const prefix = defaultModelId.split("/")[0];
  const byPrefix = getModelDef(`${prefix}/haiku`);
  if (byPrefix) return byPrefix; // anthropic, openrouter, openrouter-* variants

  const def = getModelDef(defaultModelId);
  const provider = def?.provider ?? "anthropic";
  return (
    MODEL_REGISTRY.find((m) => m.provider === provider && m.tier === "haiku") ??
    getModelDef("anthropic/haiku")!
  );
}

/**
 * Resolve the model to use for the quick-assist surfaces (ghost-text +
 * inline-edit), routing AROUND any model that is {@link
 * ModelDefinition.unfitForQuickAssist}.
 *
 * The cheap-tier resolution ({@link resolveCheapModelFor}) is prefix-based, so a
 * user whose default is a reasoning model whose OWN "/haiku" slot aliases the
 * SAME reasoning model (the seeded `openrouter-qwen36/*` → qwen/qwen3.6-27b)
 * never escapes reasoning — every quick-assist call burns its tiny budget on
 * thinking and returns no text (D-116/D-117). When the cheap candidate is
 * flagged unfit, we substitute the cheapest non-reasoning "haiku"-tier model
 * from the SAME provider (so a single-key BYOK user keeps working) — for
 * OpenRouter that is DeepSeek V3.2 (outputCost 0.4, capture-proven fast text).
 *
 * Pure and non-mutating. `registry` is injectable purely for unit-testing the
 * no-alternative passthrough branch; production callers pass a single argument
 * and get the full registry.
 */
export function resolveQuickAssistModelFor(
  defaultModelId: string,
  registry: readonly ModelDefinition[] = MODEL_REGISTRY,
): ModelDefinition {
  const candidate = resolveCheapModelFor(defaultModelId);
  if (!candidate.unfitForQuickAssist) return candidate;

  // Same-provider fallbacks keep single-key BYOK users working; cheapest wins,
  // with a deterministic id tiebreak. If none exists the honest 422 net stays
  // the backstop, so return the (flagged) candidate unchanged.
  const alternatives = registry.filter(
    (m) =>
      m.provider === candidate.provider &&
      m.tier === "haiku" &&
      !m.unfitForQuickAssist,
  );
  if (alternatives.length === 0) return candidate;

  return [...alternatives].sort(
    (a, b) =>
      a.outputCostPer1M - b.outputCostPer1M || a.id.localeCompare(b.id),
  )[0];
}

/** Get all models for a given provider. */
export function getModelsByProvider(provider: LLMProvider): ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider);
}

/** Get all model definitions grouped by provider. */
export function getModelsGrouped(): Record<LLMProvider, ModelDefinition[]> {
  return {
    anthropic: getModelsByProvider("anthropic"),
    openrouter: getModelsByProvider("openrouter"),
    openai: getModelsByProvider("openai"),
    gemini: getModelsByProvider("gemini"),
    grok: getModelsByProvider("grok"),
    local: getModelsByProvider("local"),
  };
}

/**
 * Get all models from the given providers.
 * Used to filter model picker by providers where user has keys.
 */
export function getModelsForProviders(providers: LLMProvider[]): ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => providers.includes(m.provider));
}

/**
 * Get numeric value for a model tier for comparison.
 * Higher value = more capable tier.
 */
export function getModelTierValue(tier: ModelTier): number {
  switch (tier) {
    case "haiku": return 1;
    case "sonnet": return 2;
    case "opus": return 3;
  }
}
