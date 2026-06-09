/**
 * Per-provider API key validation.
 * Uses zero-cost endpoints where possible (OpenAI, Gemini, Grok list models).
 * Anthropic and OpenRouter send a tiny message (~$0.0003).
 */

import { type ProviderKey, getProvider } from "./providers";

export interface KeyValidationResult {
  valid: boolean;
  error?: string;
}

const VALIDATION_TIMEOUT_MS = 10_000;

/**
 * Validate an API key by making a lightweight request to the provider.
 * Returns { valid: true } on success (200 or 429), { valid: false, error } otherwise.
 */
export async function validateApiKey(
  provider: ProviderKey,
  key: string
): Promise<KeyValidationResult> {
  const providerDef = getProvider(provider);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

    try {
      const result = await validateByStrategy(provider, providerDef.validateEndpoint, key, controller.signal);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { valid: false, error: "Validation timed out after 10 seconds" };
    }
    return { valid: false, error: "Connection failed" };
  }
}

async function validateByStrategy(
  provider: ProviderKey,
  endpoint: string,
  key: string,
  signal: AbortSignal
): Promise<KeyValidationResult> {
  switch (provider) {
    case "anthropic":
      return validateWithTinyMessage(endpoint, key, "x-api-key", undefined, signal);

    case "openrouter":
      return validateWithTinyMessage(endpoint, key, "x-api-key", "anthropic/claude-haiku-4-5-20251001", signal);

    case "openai":
      return validateWithModelsList(endpoint, key, "bearer", signal);

    case "gemini":
      return validateGemini(endpoint, key, signal);

    case "grok":
      return validateWithModelsList(endpoint, key, "bearer", signal);

    default: {
      const _exhaustive: never = provider;
      return { valid: false, error: `Unknown provider: ${_exhaustive}` };
    }
  }
}

/**
 * Validate by sending a tiny message (Anthropic, OpenRouter).
 * Cost: ~$0.0003 per validation.
 */
async function validateWithTinyMessage(
  endpoint: string,
  key: string,
  headerName: "x-api-key",
  modelOverride: string | undefined,
  signal: AbortSignal
): Promise<KeyValidationResult> {
  const res = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: {
      [headerName]: key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelOverride ?? "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  if (res.ok || res.status === 429) {
    return { valid: true };
  }

  if (res.status === 401) {
    return { valid: false, error: "Invalid API key" };
  }

  if (res.status === 403) {
    return { valid: false, error: "API key lacks required permissions" };
  }

  return { valid: false, error: `Validation failed (HTTP ${res.status})` };
}

/**
 * Validate by listing models (OpenAI, Grok).
 * Cost: $0 (read-only endpoint).
 */
async function validateWithModelsList(
  endpoint: string,
  key: string,
  _authType: "bearer",
  signal: AbortSignal
): Promise<KeyValidationResult> {
  const res = await fetch(endpoint, {
    method: "GET",
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
    },
  });

  if (res.ok || res.status === 429) {
    return { valid: true };
  }

  if (res.status === 401) {
    return { valid: false, error: "Invalid API key" };
  }

  if (res.status === 403) {
    return { valid: false, error: "API key lacks required permissions" };
  }

  return { valid: false, error: `Validation failed (HTTP ${res.status})` };
}

/**
 * Validate Gemini key (uses key as query param, not header).
 * Cost: $0 (read-only endpoint).
 */
async function validateGemini(
  endpoint: string,
  key: string,
  signal: AbortSignal
): Promise<KeyValidationResult> {
  const res = await fetch(`${endpoint}?key=${encodeURIComponent(key)}`, {
    method: "GET",
    signal,
  });

  if (res.ok) {
    return { valid: true };
  }

  if (res.status === 400 || res.status === 403) {
    return { valid: false, error: "Invalid API key" };
  }

  if (res.status === 429) {
    // Rate-limited but key is valid
    return { valid: true };
  }

  return { valid: false, error: `Validation failed (HTTP ${res.status})` };
}
