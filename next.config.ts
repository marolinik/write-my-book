import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Baseline security headers (H2 launch hardening). CSP ships in production
 * only — the dev server needs HMR's inline/eval surface. script-src keeps
 * 'unsafe-inline' because App Router streams RSC flight data through inline
 * scripts; external origins stay fenced to Clerk. Nonce-based script-src is
 * the post-launch upgrade tracked with the launch review follow-ups.
 */
const securityHeaders: Array<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const productionHeaders: Array<{ key: string; value: string }> = [
  ...securityHeaders,
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://*.clerk.com https://*.clerk.accounts.dev https://*.clerk.dev",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' blob: https://*.clerk.com https://*.clerk.accounts.dev https://*.clerk.dev https://o*.ingest.sentry.io wss://*.clerk.com",
      "worker-src 'self' blob:",
      "frame-src https://*.clerk.com https://*.clerk.accounts.dev https://*.clerk.dev https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: isProduction ? productionHeaders : securityHeaders,
      },
    ];
  },
};

// Only wrap with Sentry in production — it adds significant overhead to dev server
let exportedConfig: NextConfig = nextConfig;

if (process.env.NODE_ENV === "production") {
  exportedConfig = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    disableLogger: false, // Changed from true - was hiding client errors
  });
}

export default exportedConfig;
