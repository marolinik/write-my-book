// F4: <ClerkProvider> must not mount under DEV_AUTH_BYPASS / local dev (no real
// publishable key), otherwise it spams the console with failed Clerk
// script-load retries. ClerkThemeProvider is a client component that can't be
// rendered in the node test env, so the mount decision is factored into this
// pure predicate and pinned here.
import { describe, it, expect } from "vitest";
import { isClerkPublishableKeyConfigured } from "@/lib/clerk-config";

describe("isClerkPublishableKeyConfigured", () => {
  it("is true for a real publishable key (prod mounts ClerkProvider)", () => {
    expect(isClerkPublishableKeyConfigured("pk_test_abc123")).toBe(true);
    expect(isClerkPublishableKeyConfigured("pk_live_realkey")).toBe(true);
  });

  it("is false when the key is unset or empty (dev bypass renders children)", () => {
    expect(isClerkPublishableKeyConfigured(undefined)).toBe(false);
    expect(isClerkPublishableKeyConfigured("")).toBe(false);
  });

  it("is false for the REPLACE_ME placeholder", () => {
    expect(isClerkPublishableKeyConfigured("pk_test_REPLACE_ME")).toBe(false);
  });
});
