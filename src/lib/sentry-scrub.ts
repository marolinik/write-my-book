/**
 * P2-61: one scrubber for every Sentry init (browser, server, edge, worker).
 *
 * API keys should never reach an error report, but the worker decrypts BYOK
 * keys and provider SDK errors can echo request details, so every string in
 * an event (message, exception values, extra, contexts, request, breadcrumbs,
 * tags) is passed through the key patterns before it leaves the process.
 */

const KEY_PATTERNS: readonly RegExp[] = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/g, // Anthropic
  /sk-or-[a-zA-Z0-9_-]{20,}/g, // OpenRouter
  /sk-proj-[a-zA-Z0-9_-]{20,}/g, // OpenAI project keys
  /sk-[a-zA-Z0-9_-]{40,}/g, // OpenAI legacy keys
  /xai-[a-zA-Z0-9_-]{20,}/g, // xAI
  /AIza[a-zA-Z0-9_-]{30,}/g, // Google
  /whsec_[a-zA-Z0-9_]{16,}/g, // webhook secrets
];

export function redactKeyPatterns(value: string): string {
  return KEY_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value);
}

/** Field names whose value is redacted whatever it looks like. */
const SENSITIVE_FIELD_PARTS = [
  "apikey",
  "api_key",
  "encryptedkey",
  "encrypted_key",
  "x-provider-key",
  "x-api-key",
  "authorization",
];

const MAX_DEPTH = 8;

function deepRedact(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactKeyPatterns(value);
  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => deepRedact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    out[key] = SENSITIVE_FIELD_PARTS.some((part) => lower.includes(part))
      ? "[REDACTED]"
      : deepRedact(inner, depth + 1);
  }
  return out;
}

/** beforeSend for every init: a redacted copy of the event. */
export function scrubEvent<T>(event: T): T {
  return deepRedact(event, 0) as T;
}

/** beforeBreadcrumb for every init: console and http breadcrumbs carry text too. */
export function scrubBreadcrumb<T>(breadcrumb: T): T {
  return deepRedact(breadcrumb, 0) as T;
}

/** D20: 10% of traces in production, everything in development and tests. */
export function sentryTraceRate(): number {
  return process.env.NODE_ENV === "production" ? 0.1 : 1;
}
