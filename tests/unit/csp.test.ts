import { describe, it, expect } from "vitest";
import { buildContentSecurityPolicy, clerkFrontendApiHost } from "@/lib/security/csp";

const LIVE_KEY = `pk_live_${Buffer.from("clerk.writemybook.app$").toString("base64")}`;

function directive(csp: string, name: string): string {
  return csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
}

describe("clerkFrontendApiHost", () => {
  it("decodes the Frontend API host from a publishable key", () => {
    expect(clerkFrontendApiHost(LIVE_KEY)).toBe("clerk.writemybook.app");
  });

  it("returns null for a placeholder", () => {
    expect(clerkFrontendApiHost("placeholder")).toBeNull();
  });
});

describe("buildContentSecurityPolicy", () => {
  const csp = buildContentSecurityPolicy({
    clerkPublishableKey: LIVE_KEY,
    sentryDsn: "https://abc@o123.ingest.us.sentry.io/456",
  });

  it("lets a production key load clerk-js and call its Frontend API", () => {
    expect(directive(csp, "script-src")).toContain("https://clerk.writemybook.app");
    expect(directive(csp, "connect-src")).toContain("https://clerk.writemybook.app");
  });

  it("allows Turnstile, which Clerk sign-up uses for bot protection", () => {
    expect(directive(csp, "script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(csp, "frame-src")).toContain("https://challenges.cloudflare.com");
  });

  it("allows the Sentry ingest host from the DSN", () => {
    expect(directive(csp, "connect-src")).toContain("https://o123.ingest.us.sentry.io");
  });

  it("uses no host wildcard browsers discard", () => {
    expect(csp).not.toContain("o*.");
  });
});
