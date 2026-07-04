// F4: <ClerkProvider> must not mount under DEV_AUTH_BYPASS / local dev (no real
// publishable key), otherwise it spams the console with failed Clerk
// script-load retries. ClerkThemeProvider is a client component that can't be
// rendered in the node test env, so the mount decision is factored into this
// pure predicate and pinned here.
import { describe, it, expect } from "vitest";
// Target the PURE predicate, not the env-defaulted wrapper: passing an explicit
// `undefined` to isClerkPublishableKeyConfigured triggers its
// `= process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` default, so the result would
// depend on ambient env (green locally, red in CI which injects a placeholder key).
import { isValidClerkPublishableKey } from "@/lib/clerk-config";

describe("isValidClerkPublishableKey", () => {
  it("is true for a real publishable key (prod mounts ClerkProvider)", () => {
    expect(isValidClerkPublishableKey("pk_test_abc123")).toBe(true);
    expect(isValidClerkPublishableKey("pk_live_realkey")).toBe(true);
  });

  it("is false when the key is unset or empty (dev bypass renders children)", () => {
    expect(isValidClerkPublishableKey(undefined)).toBe(false);
    expect(isValidClerkPublishableKey("")).toBe(false);
  });

  it("is false for the REPLACE_ME placeholder", () => {
    expect(isValidClerkPublishableKey("pk_test_REPLACE_ME")).toBe(false);
  });
});
