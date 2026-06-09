/**
 * Translates raw LLM provider HTTP errors into user-friendly messages.
 * Never exposes raw provider error text to users.
 */

import type { ProviderKey } from "./providers";

export interface TranslatedError {
  /** User-facing error message (never contains raw provider text) */
  userMessage: string;
  /** Recommended action for the user */
  action: "retry" | "switch-provider" | "check-key" | "contact-support";
  /** Whether an automatic retry is appropriate */
  retryable: boolean;
  /** Suggested delay before retry (ms), if retryable */
  retryAfterMs?: number;
}

/** Provider display names for error messages */
const PROVIDER_NAMES: Record<ProviderKey, string> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  gemini: "Google Gemini",
  grok: "xAI Grok",
};

/** Backoff curve for rate limit retries (successive 429 errors) */
const RATE_LIMIT_BACKOFF_MS = [10_000, 30_000, 60_000] as const;

/** Track consecutive rate limits per provider for backoff escalation */
const rateLimitCounters = new Map<ProviderKey, number>();

/**
 * Translate a provider HTTP error status into a user-friendly message.
 * Raw error messages from providers are never included in the output.
 *
 * @param status - HTTP status code from the provider
 * @param provider - Which provider returned the error
 * @param _rawMessage - Raw error message (logged internally, never exposed to user)
 */
export function translateProviderError(
  status: number,
  provider: ProviderKey,
  _rawMessage?: string
): TranslatedError {
  const name = PROVIDER_NAMES[provider];

  switch (status) {
    case 401:
      // Reset rate limit counter on auth errors
      rateLimitCounters.delete(provider);
      return {
        userMessage: `Your ${name} API key appears to be invalid or has been revoked. Please check your key in Settings.`,
        action: "check-key",
        retryable: false,
      };

    case 402:
      rateLimitCounters.delete(provider);
      return {
        userMessage: `Your ${name} account has insufficient balance. Please add credits or switch to a different provider.`,
        action: "check-key",
        retryable: false,
      };

    case 403:
      rateLimitCounters.delete(provider);
      return {
        userMessage: `Your ${name} API key does not have permission for this operation. Please verify your key permissions.`,
        action: "check-key",
        retryable: false,
      };

    case 429: {
      const count = (rateLimitCounters.get(provider) ?? 0);
      const backoffIndex = Math.min(count, RATE_LIMIT_BACKOFF_MS.length - 1);
      const retryAfterMs = RATE_LIMIT_BACKOFF_MS[backoffIndex];
      rateLimitCounters.set(provider, count + 1);
      return {
        userMessage: `${name} rate limit reached. Retrying automatically in ${retryAfterMs / 1000} seconds.`,
        action: "retry",
        retryable: true,
        retryAfterMs,
      };
    }

    case 500:
    case 502:
    case 503:
      rateLimitCounters.delete(provider);
      return {
        userMessage: `${name} is experiencing temporary issues. The request will be retried automatically.`,
        action: "retry",
        retryable: true,
        retryAfterMs: 5_000,
      };

    case 504:
      rateLimitCounters.delete(provider);
      return {
        userMessage: `${name} request timed out. This usually resolves on retry.`,
        action: "retry",
        retryable: true,
        retryAfterMs: 10_000,
      };

    default:
      rateLimitCounters.delete(provider);
      return {
        userMessage: `An unexpected error occurred with ${name} (status ${status}). The request will be retried.`,
        action: "retry",
        retryable: true,
        retryAfterMs: 5_000,
      };
  }
}

/**
 * Reset rate limit counter for a provider (call after a successful request).
 */
export function resetRateLimitCounter(provider: ProviderKey): void {
  rateLimitCounters.delete(provider);
}
