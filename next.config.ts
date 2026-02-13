import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

// Only wrap with Sentry in production — it adds significant overhead to dev server
let exportedConfig: NextConfig = nextConfig;

if (process.env.NODE_ENV === "production") {
  const { withSentryConfig } = require("@sentry/nextjs");
  exportedConfig = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    disableLogger: true,
  });
}

export default exportedConfig;
