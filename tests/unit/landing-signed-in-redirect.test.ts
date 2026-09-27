import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * UAT P4-S19 — a signed-in visitor on "/" saw the marketing page instead of
 * being sent to /dashboard. `redirect()` works by throwing (digest
 * NEXT_REDIRECT), and the call sat inside a bare `try {} catch {}` meant for a
 * misconfigured Clerk, which swallowed it. Only production shows it: the dev
 * bypass takes the earlier redirect, outside the try. /login's <SignIn> has no
 * redirect target, so every production sign-in landed on the marketing page.
 */

const h = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => h.auth() }));

async function renderHome(): Promise<{ redirectedTo: string | null }> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_dW5pdC10ZXN0cy5jbGVyay5hY2NvdW50cy5kZXYk");
  vi.stubEnv("DEV_AUTH_BYPASS", "");
  const { default: Home } = await import("@/app/page");
  try {
    await Home();
    return { redirectedTo: null };
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw error;
    // NEXT_REDIRECT;<type>;<url>;<status>;
    return { redirectedTo: digest.split(";")[2] ?? null };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("landing page for a signed-in visitor (P4-S19)", () => {
  it("sends a signed-in visitor to the dashboard", async () => {
    h.auth.mockResolvedValue({ userId: "user_1" });
    expect(await renderHome()).toEqual({ redirectedTo: "/dashboard" });
  });

  it("shows the landing page to a signed-out visitor", async () => {
    h.auth.mockResolvedValue({ userId: null });
    expect(await renderHome()).toEqual({ redirectedTo: null });
  });

  it("still shows the landing page when Clerk itself fails", async () => {
    h.auth.mockRejectedValue(new Error("clerkMiddleware() was not run"));
    expect(await renderHome()).toEqual({ redirectedTo: null });
  });
});
