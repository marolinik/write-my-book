/**
 * Production Content-Security-Policy. Lives here, not inline in next.config.ts,
 * so it can be tested: the inline version only allowed Clerk's hosted domains,
 * and a production key loads clerk-js from clerk.<your-domain>, so sign-in
 * would have been blocked at launch (audit P0-3).
 */

const CLERK_HOSTED = ["https://*.clerk.com", "https://*.clerk.accounts.dev", "https://*.clerk.dev"];
const TURNSTILE = "https://challenges.cloudflare.com";
const SENTRY_INGEST_FALLBACK = [
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://*.ingest.de.sentry.io",
];

export interface CspInput {
  clerkPublishableKey?: string;
  sentryDsn?: string;
}

/** The Frontend API host a Clerk publishable key encodes, or null if it is not a real key. */
export function clerkFrontendApiHost(publishableKey: string): string | null {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=]+)$/.exec(publishableKey.trim());
  if (!match) return null;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  if (!decoded.endsWith("$")) return null;
  const host = decoded.slice(0, -1);
  return /^[a-z0-9.-]+$/i.test(host) ? host : null;
}

function sentryIngestOrigins(dsn: string | undefined): string[] {
  if (!dsn) return SENTRY_INGEST_FALLBACK;
  try {
    return [new URL(dsn).origin];
  } catch {
    return SENTRY_INGEST_FALLBACK;
  }
}

export function buildContentSecurityPolicy({ clerkPublishableKey, sentryDsn }: CspInput): string {
  const fapi = clerkPublishableKey ? clerkFrontendApiHost(clerkPublishableKey) : null;
  const clerk = fapi ? [...CLERK_HOSTED, `https://${fapi}`] : CLERK_HOSTED;
  const clerkSockets = fapi ? [`wss://${fapi}`, "wss://*.clerk.com"] : ["wss://*.clerk.com"];

  return [
    "default-src 'self'",
    ["script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", ...clerk, TURNSTILE].join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    ["connect-src 'self' blob:", ...clerk, ...clerkSockets, ...sentryIngestOrigins(sentryDsn)].join(" "),
    "worker-src 'self' blob:",
    ["frame-src", ...clerk, TURNSTILE, "https://js.stripe.com", "https://hooks.stripe.com"].join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
