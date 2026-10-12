/**
 * Routes the middleware lets through without a signed-in user.
 *
 * Kept in its own module so the list can be unit-tested without loading the
 * middleware (which reads Clerk configuration at import time).
 */
export const PUBLIC_ROUTE_PATTERNS: readonly string[] = [
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/privacy",
  "/terms",
  "/demo",
  // Next.js metadata routes generated from src/app (robots.ts, sitemap.ts,
  // opengraph-image.tsx, twitter-image.tsx). Crawlers and link unfurlers are
  // never signed in. The image routes may carry a hash suffix.
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image(.*)",
  "/twitter-image(.*)",
  "/api/auth/webhook",
  "/api/billing/webhook",
  "/api/billing/founder-count",
  "/api/health(.*)",
  // UDG round-7 (Luka 12): tokenized account-less read-only snapshots.
  "/share(.*)",
  "/api/share(.*)",
];
