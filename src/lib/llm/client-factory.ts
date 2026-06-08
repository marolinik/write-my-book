/**
 * Creates Anthropic SDK client instances for different providers.
 *
 * Routing strategy:
 * - Anthropic direct: api.anthropic.com (when user has Anthropic API key)
 * - OpenRouter: openrouter.ai/api/v1 (Anthropic-compatible endpoint, supports Claude + all providers)
 * - LiteLLM proxy: localhost proxy for direct OpenAI/Gemini/Grok keys (translates Anthropic format)
 *
 * Fallback chain for non-Anthropic providers:
 *   1. Direct provider key -> LiteLLM proxy (lowest latency, direct pricing)
 *   2. OpenRouter key -> OpenRouter baseURL swap (one key for all providers)
 *   3. No key -> explicit error (never silently falls back to platform keys)
 *
 * LiteLLM acts as a universal translator: our Anthropic SDK sends messages format,
 * LiteLLM converts to OpenAI chat/completions format for non-Anthropic models.
 * Per-request API keys are passed via x-provider-key header.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getModelDef, resolveFromTier, type LLMProvider, type ModelDefinition } from "./model-registry";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || "http://localhost:30400";

export interface LLMClientOptions {
  /** Registry model ID (e.g. "anthropic/sonnet") or legacy tier ("sonnet"). */
  modelId: string;
  /** Anthropic API key -- required for anthropic provider models. */
  anthropicApiKey?: string;
  /** OpenRouter API key -- used for openrouter models and as fallback for all providers. */
  openrouterApiKey?: string;
  /** OpenAI API key -- for direct GPT-4o/o3/o4-mini routing via LiteLLM proxy. */
  openaiApiKey?: string;
  /** Google Gemini API key -- for direct Gemini routing via LiteLLM proxy. */
  geminiApiKey?: string;
  /** xAI Grok API key -- for direct Grok routing via LiteLLM proxy. */
  grokApiKey?: string;
}

export interface LLMClient {
  /** Pre-configured Anthropic SDK client. */
  client: Anthropic;
  /** Resolved model definition from the registry. */
  model: ModelDefinition;
  /** The model ID to actually send to the API (may differ from registry modelId for OpenRouter fallback). */
  effectiveModelId: string;
}

/** Available keys map for resolveProviderRoute. */
type AvailableKeys = {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  grokApiKey?: string;
};

/** Successful route resolution. */
interface RouteResolved {
  route: "direct" | "openrouter" | "litellm-proxy";
  apiKey: string;
  baseURL: string;
  headers?: Record<string, string>;
  /** Model ID to use when sending to the API (may differ for OpenRouter fallback). */
  effectiveModelId?: string;
}

/** Failed route resolution. */
interface RouteNone {
  route: "none";
  error: string;
}

export type ProviderRouteResult = RouteResolved | RouteNone;

// ── OpenRouter model ID translation ──────────────────────────────────────

/**
 * Maps from registry modelId (used by LiteLLM/direct providers) to OpenRouter's model naming.
 * OpenRouter uses different prefixes for some providers:
 * - OpenAI: openai/ (same as LiteLLM)
 * - Gemini: google/ (LiteLLM uses gemini/)
 * - Grok: x-ai/ (LiteLLM uses xai/)
 */
const OPENROUTER_MODEL_MAP: Record<string, string> = {
  // OpenAI models (same prefix on OpenRouter)
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "o3": "openai/o3",
  "o4-mini": "openai/o4-mini",
  // Gemini models (google/ prefix on OpenRouter)
  "gemini-2.5-pro-preview-05-06": "google/gemini-2.5-pro-preview-05-06",
  "gemini-2.5-flash-preview-05-20": "google/gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash": "google/gemini-2.0-flash",
  // Grok models (x-ai/ prefix on OpenRouter)
  "grok-4": "x-ai/grok-4",
  "grok-3": "x-ai/grok-3",
  "grok-3-mini": "x-ai/grok-3-mini",
};

/**
 * Registry ID to OpenRouter model mapping for fallback routing.
 * Maps from our registry IDs like "openai/gpt-4o" or "gemini/2.5-pro"
 * to the OpenRouter model IDs like "openai/gpt-4o" or "google/gemini-2.5-pro-preview-05-06".
 */
const REGISTRY_TO_OPENROUTER: Record<string, string> = {
  // OpenAI
  "openai/gpt-4o": "openai/gpt-4o",
  "openai/gpt-4o-mini": "openai/gpt-4o-mini",
  "openai/o3": "openai/o3",
  "openai/o4-mini": "openai/o4-mini",
  // Gemini
  "gemini/2.5-pro": "google/gemini-2.5-pro-preview-05-06",
  "gemini/2.5-flash": "google/gemini-2.5-flash-preview-05-20",
  "gemini/2.0-flash": "google/gemini-2.0-flash",
  // Grok
  "grok/grok-4": "x-ai/grok-4",
  "grok/grok-3": "x-ai/grok-3",
  "grok/grok-3-mini": "x-ai/grok-3-mini",
};

/**
 * Translate a model ID (either registry ID or raw model ID) to OpenRouter's naming.
 * Used when falling back to OpenRouter for non-Anthropic models.
 *
 * @example
 * toOpenRouterModelId("gemini/2.5-pro") // "google/gemini-2.5-pro-preview-05-06"
 * toOpenRouterModelId("gpt-4o") // "openai/gpt-4o"
 * toOpenRouterModelId("grok-4") // "x-ai/grok-4"
 */
export function toOpenRouterModelId(modelIdOrRegistryId: string): string {
  // Try registry ID mapping first (e.g. "gemini/2.5-pro")
  if (REGISTRY_TO_OPENROUTER[modelIdOrRegistryId]) {
    return REGISTRY_TO_OPENROUTER[modelIdOrRegistryId];
  }
  // Try raw model ID mapping (e.g. "gpt-4o")
  if (OPENROUTER_MODEL_MAP[modelIdOrRegistryId]) {
    return OPENROUTER_MODEL_MAP[modelIdOrRegistryId];
  }
  // If already in OpenRouter format or unknown, return as-is
  return modelIdOrRegistryId;
}

// ── Provider routing ─────────────────────────────────────────────────────

/**
 * Determine how to route a request for a given model provider based on available API keys.
 *
 * Implements the fallback chain:
 * - anthropic: direct Anthropic API -> OpenRouter fallback -> error
 * - openrouter: OpenRouter -> error
 * - openai: LiteLLM proxy (direct key) -> OpenRouter fallback -> error
 * - gemini: LiteLLM proxy (direct key) -> OpenRouter fallback -> error
 * - grok: LiteLLM proxy (direct key) -> OpenRouter fallback -> error
 */
export function resolveProviderRoute(
  modelProvider: LLMProvider,
  availableKeys: AvailableKeys,
  modelId?: string,
  registryId?: string,
): ProviderRouteResult {
  switch (modelProvider) {
    case "anthropic": {
      if (availableKeys.anthropicApiKey) {
        return {
          route: "direct",
          apiKey: availableKeys.anthropicApiKey,
          baseURL: "https://api.anthropic.com",
        };
      }
      if (availableKeys.openrouterApiKey) {
        return {
          route: "openrouter",
          apiKey: availableKeys.openrouterApiKey,
          baseURL: OPENROUTER_BASE_URL,
        };
      }
      return { route: "none", error: "No Anthropic or OpenRouter API key configured" };
    }

    case "openrouter": {
      if (availableKeys.openrouterApiKey) {
        return {
          route: "openrouter",
          apiKey: availableKeys.openrouterApiKey,
          baseURL: OPENROUTER_BASE_URL,
        };
      }
      return { route: "none", error: "No OpenRouter API key configured" };
    }

    case "openai": {
      if (availableKeys.openaiApiKey) {
        return {
          route: "litellm-proxy",
          apiKey: "sk-litellm",
          baseURL: LITELLM_BASE_URL,
          headers: {
            "x-provider-key": availableKeys.openaiApiKey,
            "x-target-provider": "openai",
          },
        };
      }
      if (availableKeys.openrouterApiKey) {
        const orModelId = toOpenRouterModelId(registryId || modelId || "");
        return {
          route: "openrouter",
          apiKey: availableKeys.openrouterApiKey,
          baseURL: OPENROUTER_BASE_URL,
          effectiveModelId: orModelId,
        };
      }
      return { route: "none", error: "No OpenAI or OpenRouter API key configured" };
    }

    case "gemini": {
      if (availableKeys.geminiApiKey) {
        return {
          route: "litellm-proxy",
          apiKey: "sk-litellm",
          baseURL: LITELLM_BASE_URL,
          headers: {
            "x-provider-key": availableKeys.geminiApiKey,
            "x-target-provider": "gemini",
          },
        };
      }
      if (availableKeys.openrouterApiKey) {
        const orModelId = toOpenRouterModelId(registryId || modelId || "");
        return {
          route: "openrouter",
          apiKey: availableKeys.openrouterApiKey,
          baseURL: OPENROUTER_BASE_URL,
          effectiveModelId: orModelId,
        };
      }
      return { route: "none", error: "No Gemini or OpenRouter API key configured" };
    }

    case "grok": {
      if (availableKeys.grokApiKey) {
        return {
          route: "litellm-proxy",
          apiKey: "sk-litellm",
          baseURL: LITELLM_BASE_URL,
          headers: {
            "x-provider-key": availableKeys.grokApiKey,
            "x-target-provider": "grok",
          },
        };
      }
      if (availableKeys.openrouterApiKey) {
        const orModelId = toOpenRouterModelId(registryId || modelId || "");
        return {
          route: "openrouter",
          apiKey: availableKeys.openrouterApiKey,
          baseURL: OPENROUTER_BASE_URL,
          effectiveModelId: orModelId,
        };
      }
      return { route: "none", error: "No Grok or OpenRouter API key configured" };
    }

    default: {
      return { route: "none", error: `Unknown provider: ${modelProvider}` };
    }
  }
}

/**
 * Check if a model needs the LiteLLM proxy for format translation.
 * Returns true ONLY when using direct provider keys via the proxy.
 * OpenRouter-fallback routes do NOT go through LiteLLM proxy.
 */
function needsLiteLLMProxy(model: ModelDefinition, route: ProviderRouteResult): boolean {
  if (route.route === "litellm-proxy") return true;
  // Legacy: non-Anthropic models on OpenRouter that aren't using the baseURL swap
  if (route.route === "openrouter" && model.provider === "openrouter" && !model.modelId.startsWith("anthropic/")) {
    return true;
  }
  return false;
}

/**
 * Create an Anthropic SDK client configured for the correct provider.
 * Accepts both registry IDs ("openrouter/sonnet") and legacy tier strings ("sonnet").
 *
 * The routing fallback chain ensures:
 * 1. Direct provider key -> direct API or LiteLLM proxy
 * 2. OpenRouter key -> OpenRouter with model ID translation
 * 3. No usable key -> throws with clear error (never silently falls back)
 */
export function createLLMClient(options: LLMClientOptions): LLMClient {
  // Resolve model: try exact match first, then legacy tier
  let model = getModelDef(options.modelId);
  if (!model) {
    model = resolveFromTier(options.modelId);
  }

  const availableKeys: AvailableKeys = {
    anthropicApiKey: options.anthropicApiKey,
    openrouterApiKey: options.openrouterApiKey,
    openaiApiKey: options.openaiApiKey,
    geminiApiKey: options.geminiApiKey,
    grokApiKey: options.grokApiKey,
  };

  const routeResult = resolveProviderRoute(
    model.provider,
    availableKeys,
    model.modelId,
    model.id,
  );

  if (routeResult.route === "none") {
    throw new Error(routeResult.error);
  }

  // Determine effective model ID (may change for OpenRouter fallback)
  const effectiveModelId = routeResult.effectiveModelId || model.modelId;

  // Create the Anthropic SDK client with appropriate configuration
  const clientOptions: ConstructorParameters<typeof Anthropic>[0] = {
    apiKey: routeResult.apiKey,
    baseURL: routeResult.baseURL,
  };

  // Add custom headers for LiteLLM proxy (x-provider-key, x-target-provider)
  if (routeResult.headers) {
    clientOptions.defaultHeaders = routeResult.headers;
  }

  // For legacy non-Anthropic OpenRouter models that need LiteLLM proxy translation
  if (needsLiteLLMProxy(model, routeResult) && routeResult.route !== "litellm-proxy") {
    return {
      client: new Anthropic({
        apiKey: "sk-litellm",
        baseURL: LITELLM_BASE_URL,
      }),
      model,
      effectiveModelId: model.modelId,
    };
  }

  return {
    client: new Anthropic(clientOptions),
    model,
    effectiveModelId,
  };
}
