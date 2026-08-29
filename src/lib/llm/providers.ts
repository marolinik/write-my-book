/**
 * Centralized provider definitions for all supported LLM providers.
 * Each provider has metadata for display, key validation, and API access.
 */

export type ProviderKey = "anthropic" | "openrouter" | "openai" | "gemini" | "grok";

export const PROVIDER_KEYS = ["anthropic", "openrouter", "openai", "gemini", "grok"] as const;

export const CUSTOM_PROVIDER_KEY = "custom" as const;

export interface ProviderDefinition {
  /** Unique key identifying this provider */
  key: ProviderKey;
  /** Human-readable display name */
  displayName: string;
  /** Short description of the provider */
  description: string;
  /** Expected prefix of API keys (for UI hint, not strict validation) */
  keyPrefix: string;
  /** Placeholder text for key input field */
  keyPlaceholder: string;
  /** URL to provider's API key documentation */
  docsUrl: string;
  /** Endpoint used to validate the API key */
  validateEndpoint: string;
  /** Validation strategy: list models or send a tiny message */
  validateMethod: "models-list" | "tiny-message";
  /** Lucide icon name for UI display */
  iconName: string;
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    key: "anthropic",
    displayName: "Anthropic",
    description: "Claude models direct from Anthropic. Best latency and reliability.",
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    validateEndpoint: "https://api.anthropic.com/v1/messages",
    validateMethod: "tiny-message",
    iconName: "Bot",
  },
  {
    key: "openrouter",
    displayName: "OpenRouter",
    description: "Access Claude and 200+ models through a single API key.",
    keyPrefix: "sk-or-",
    keyPlaceholder: "sk-or-v1-...",
    docsUrl: "https://openrouter.ai/keys",
    validateEndpoint: "https://openrouter.ai/api/v1/messages",
    validateMethod: "tiny-message",
    iconName: "Globe",
  },
  {
    key: "openai",
    displayName: "OpenAI",
    description: "GPT-4o, o3, and o4-mini models from OpenAI.",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
    validateEndpoint: "https://api.openai.com/v1/models",
    validateMethod: "models-list",
    iconName: "Sparkles",
  },
  {
    key: "gemini",
    displayName: "Google Gemini",
    description: "Gemini 2.5 Pro and Flash models from Google AI.",
    keyPrefix: "AI",
    keyPlaceholder: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
    validateEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    validateMethod: "models-list",
    iconName: "Gem",
  },
  {
    key: "grok",
    displayName: "xAI Grok",
    description: "Grok-4, Grok-3, and Grok-3 Mini from xAI.",
    keyPrefix: "xai-",
    keyPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai/",
    validateEndpoint: "https://api.x.ai/v1/models",
    validateMethod: "models-list",
    iconName: "Zap",
  },
];
/**
 * Custom providers extend the picker without touching ProviderKey — they are
 * stored in CustomProvider rows and surfaced via buildModelGroups(customModels).
 */
export interface CustomProviderDefinition {}

/** Look up a provider definition by key. Throws if not found. */
export function getProvider(key: ProviderKey): ProviderDefinition {
  const provider = PROVIDERS.find((p) => p.key === key);
  if (!provider) {
    throw new Error(`Unknown provider: ${key}`);
  }
  return provider;
}
