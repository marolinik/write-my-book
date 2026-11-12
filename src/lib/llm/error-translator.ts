/**
 * Translates raw LLM provider HTTP errors into user-friendly messages.
 * Never exposes raw provider error text to users.
 */

import type { LLMProvider } from "./model-registry";
import type { ProviderErrorCode } from "@/lib/agents/agent-errors";

export interface TranslatedError {
  /** P2-31: stable code; the client renders it in the interface language. */
  code: ProviderErrorCode;
  /** English (never raw provider text), for logs and Error.message; not shown as is. */
  userMessage: string;
  /** Recommended action for the user */
  action: "retry" | "switch-provider" | "check-key" | "contact-support";
  /** Whether an automatic retry is appropriate */
  retryable: boolean;
  /** Suggested delay before retry (ms), if retryable */
  retryAfterMs?: number;
}

/**
 * Provider display names for error messages.
 *
 * Keyed by LLMProvider (not ProviderKey) so the self-hosted fleet has a name
 * too: the local route is the DEFAULT on fleet installs, and a missing key here
 * produced user-facing text reading "Your undefined API key ...".
 */
const PROVIDER_NAMES: Record<LLMProvider, string> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  gemini: "Google Gemini",
  grok: "xAI Grok",
  local: "the local fleet",
};

/** Backoff curve for rate limit retries (successive 429 errors) */
const RATE_LIMIT_BACKOFF_MS = [10_000, 30_000, 60_000] as const;

/** Track consecutive rate limits per provider for backoff escalation */
const rateLimitCounters = new Map<LLMProvider, number>();

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
  provider: LLMProvider,
  _rawMessage?: string
): TranslatedError {
  const name = PROVIDER_NAMES[provider];

  switch (status) {
    case 401:
      // Reset rate limit counter on auth errors
      rateLimitCounters.delete(provider);
      return {
        code: "PROVIDER_KEY_INVALID",
        userMessage: `Your ${name} API key appears to be invalid or has been revoked. Please check your key in Settings.`,
        action: "check-key",
        retryable: false,
      };

    case 402:
      rateLimitCounters.delete(provider);
      return {
        code: "PROVIDER_NO_CREDIT",
        userMessage: `Your ${name} account has insufficient balance. Please add credits or switch to a different provider.`,
        action: "check-key",
        retryable: false,
      };

    case 403:
      rateLimitCounters.delete(provider);
      return {
        code: "PROVIDER_FORBIDDEN",
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
        code: "PROVIDER_RATE_LIMITED",
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
        code: "PROVIDER_UNAVAILABLE",
        userMessage: `${name} is experiencing temporary issues.`,
        action: "retry",
        retryable: true,
        retryAfterMs: 5_000,
      };

    case 504:
      rateLimitCounters.delete(provider);
      return {
        code: "PROVIDER_TIMEOUT",
        userMessage: `${name} did not answer in time (timeout or dropped connection).`,
        action: "retry",
        retryable: true,
        retryAfterMs: 10_000,
      };

    case 404:
      rateLimitCounters.delete(provider);
      // P2-30: OpenRouter answers 404 when no endpoint serves the model under
      // the account's no-training data policy (the deny guard). The writer
      // has to pick another model; retrying cannot help.
      if (provider === "openrouter") {
        return {
          code: "PROVIDER_MODEL_NOT_ALLOWED",
          userMessage: `${name} has no endpoint for this model under the no-training policy.`,
          action: "check-key",
          retryable: false,
        };
      }
      return {
        code: "PROVIDER_UNAVAILABLE",
        userMessage: `${name} does not know this model (status 404).`,
        action: "switch-provider",
        retryable: false,
      };

    default:
      rateLimitCounters.delete(provider);
      return {
        code: "PROVIDER_UNAVAILABLE",
        userMessage: `An unexpected error occurred with ${name} (status ${status}).`,
        action: "retry",
        retryable: true,
        retryAfterMs: 5_000,
      };
  }
}

/**
 * Reset rate limit counter for a provider (call after a successful request).
 */
export function resetRateLimitCounter(provider: LLMProvider): void {
  rateLimitCounters.delete(provider);
}
