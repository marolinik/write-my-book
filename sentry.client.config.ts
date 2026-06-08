import * as Sentry from "@sentry/nextjs";

/**
 * Redact API key patterns from string data.
 * Defense in depth — keys should never reach client-side, but catch edge cases.
 * Covers Anthropic (sk-ant-), OpenRouter (sk-or-), OpenAI (sk-proj-, sk-),
 * xAI (xai-), and Gemini (AIza) keys.
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
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  beforeSend(event) {
    // Redact any API key patterns that might appear in event data
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        if (typeof event.extra[key] === "string") {
          event.extra[key] = redactKeyPatterns(event.extra[key] as string);
        }
      }
    }
    if (event.message) {
      event.message = redactKeyPatterns(event.message);
    }
    return event;
  },
});
