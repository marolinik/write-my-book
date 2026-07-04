/**
 * Next.js instrumentation entry — runs once per server runtime at startup.
 *
 * This is the file that actually EXECUTES the `Sentry.init` in
 * `sentry.server.config.ts` / `sentry.edge.config.ts`. Without it those
 * configs are dead code and server / edge (RSC + route-handler) errors are
 * never captured — client errors still ship via `withSentryConfig`.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Forwards errors thrown in React Server Components / route handlers to Sentry
// via Next.js's `onRequestError` hook. In @sentry/nextjs v10 the hook
// implementation is exported under the name `captureRequestError`.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
