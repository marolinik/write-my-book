/**
 * Whether a real Clerk publishable key is configured.
 *
 * A missing key or the "REPLACE_ME" placeholder means Clerk auth is not wired
 * up — the DEV_AUTH_BYPASS / local-dev path. Mounting <ClerkProvider> in that
 * state does nothing useful and just spams the console with failed Clerk
 * script-load retries, so callers should render children directly instead.
 *
 * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is inlined into the client bundle at build
 * time, so this predicate works in both server and client components. This
 * mirrors the inline check used in middleware/layout/auth (kept as the single
 * assertable copy of that logic).
 */
export function isClerkPublishableKeyConfigured(
  key: string | undefined = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
): boolean {
  return isValidClerkPublishableKey(key);
}

/**
 * Pure key validation, independent of the environment. Kept separate so it is
 * deterministically testable — calling {@link isClerkPublishableKeyConfigured}
 * with an explicit `undefined` would trigger the env-reading default parameter,
 * making its result depend on ambient `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (green
 * locally, red in CI where a placeholder key is injected).
 */
export function isValidClerkPublishableKey(key: string | undefined): boolean {
  return Boolean(key && key.length > 0 && !key.includes("REPLACE_ME"));
}
