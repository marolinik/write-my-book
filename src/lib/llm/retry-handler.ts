/**
 * Retry handler with exponential backoff for LLM provider errors.
 * Automatically retries on rate limits (429) and server errors (5xx),
 * and immediately throws on non-retryable errors (auth, billing, etc.).
 */

import type { ProviderKey } from "./providers";
import { translateProviderError, type TranslatedError } from "./error-translator";

export const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [10_000, 30_000, 60_000] as readonly number[],
  retryableStatuses: [429, 500, 502, 503, 529] as readonly number[],
  nonRetryableStatuses: [400, 401, 402, 403, 404] as readonly number[],
} as const;

export interface RetryOptions {
  /** Which provider this request targets (for error translation). */
  provider: ProviderKey;
  /** Called before each retry with attempt number, wait duration, and translated error. */
  onRetry?: (attempt: number, waitMs: number, error: TranslatedError) => void;
}

/** Error class that carries the translated error and HTTP status. */
export class ProviderError extends Error {
  constructor(
    public readonly translated: TranslatedError,
    public readonly status: number,
    public readonly provider: ProviderKey
  ) {
    super(translated.userMessage);
    this.name = "ProviderError";
  }
}

/** Extract HTTP status from various error shapes (Anthropic SDK, fetch, etc.). */
function extractStatus(error: unknown): number | null {
  if (error && typeof error === "object") {
    // Anthropic SDK errors have .status
    if ("status" in error && typeof (error as { status: unknown }).status === "number") {
      return (error as { status: number }).status;
    }
    // Some errors have .statusCode
    if ("statusCode" in error && typeof (error as { statusCode: unknown }).statusCode === "number") {
      return (error as { statusCode: number }).statusCode;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute fn() with automatic retry on retryable provider errors.
 *
 * - Retryable errors (429, 5xx, 529): Wait with exponential backoff, call onRetry, retry.
 * - Non-retryable errors (400, 401-403, 404): Throw immediately with translated error.
 * - Unknown errors or max retries exhausted: Throw with translated error.
 */
export async function withProviderRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = extractStatus(error);

      // Non-retryable: throw immediately with translated error
      if (status !== null && RETRY_CONFIG.nonRetryableStatuses.includes(status)) {
        const translated = translateProviderError(status, options.provider);
        throw new ProviderError(translated, status, options.provider);
      }

      // Retryable: check if we have retries left
      if (
        status !== null &&
        RETRY_CONFIG.retryableStatuses.includes(status) &&
        attempt < RETRY_CONFIG.maxRetries
      ) {
        const waitMs = RETRY_CONFIG.backoffMs[Math.min(attempt, RETRY_CONFIG.backoffMs.length - 1)];
        const translated = translateProviderError(status, options.provider);

        if (options.onRetry) {
          options.onRetry(attempt + 1, waitMs, translated);
        }

        await sleep(waitMs);
        continue;
      }

      // Max retries exhausted or unknown status: throw with translated error
      const finalStatus = status ?? 500;
      const translated = translateProviderError(finalStatus, options.provider);
      throw new ProviderError(translated, finalStatus, options.provider);
    }
  }

  // Should never reach here, but TypeScript needs it
  const translated = translateProviderError(500, options.provider);
  throw new ProviderError(translated, 500, options.provider);
}
