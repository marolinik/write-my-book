import * as Sentry from "@sentry/nextjs";

const SENSITIVE_PATTERNS = [
  "apikey",
  "api_key",
  "encryptedkey",
  "encrypted_key",
  "x-provider-key",
  "x-api-key",
  "authorization",
];

/**
 * Recursively redact sensitive fields from any object.
 * Matches field names containing any of the sensitive patterns (case-insensitive).
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return obj;
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_PATTERNS.some((p) => lowerKey.includes(p))) {
      obj[key] = "[REDACTED]";
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeObject(obj[key] as Record<string, unknown>);
    }
  }
  return obj;
}

/**
 * Redact API key patterns from string data.
 * Covers Anthropic (sk-ant-), OpenRouter (sk-or-), OpenAI (sk-), xAI (xai-), and Gemini (AIza) keys.
 */
function redactKeyPatterns(str: string): string {
  return str
    .replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/sk-or-[a-zA-Z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/sk-proj-[a-zA-Z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/sk-[a-zA-Z0-9_-]{40,}/g, "[REDACTED]")
    .replace(/xai-[a-zA-Z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/AIza[a-zA-Z0-9_-]{30,}/g, "[REDACTED]");
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  beforeSend(event) {
    // Strip API keys from all event data
    if (event.extra) sanitizeObject(event.extra as Record<string, unknown>);
    if (event.contexts) sanitizeObject(event.contexts as Record<string, unknown>);
    if (event.request?.headers) sanitizeObject(event.request.headers as Record<string, unknown>);
    if (event.request?.data) {
      if (typeof event.request.data === "string") {
        event.request.data = redactKeyPatterns(event.request.data);
      } else if (typeof event.request.data === "object") {
        sanitizeObject(event.request.data as Record<string, unknown>);
      }
    }
    return event;
  },
});
