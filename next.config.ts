import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildContentSecurityPolicy } from "./src/lib/security/csp";

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
    value: buildContentSecurityPolicy({
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    }),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Every body the middleware matches is cloned through the proxy and cut
    // at this size (Next's default is 10 MB). Route handlers read the clone,
    // so this is the real upload ceiling: it must hold a 20 MB manuscript
    // (UAT P6-S01/S06) and an 8 MB cover as base64 JSON. Keep equal to
    // MAX_UPLOAD_REQUEST_BYTES in src/lib/import-export/upload-limits.ts
    // (tests/unit/import-upload-size-limit.test.ts holds them together).
    proxyClientMaxBodySize: 25 * 1024 * 1024,
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
