import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * UAT P5-S09 (critical) — a writer who finished onboarding, then opened the
 * app in a new browser, could never get in again.
 *
 * The middleware gate reads only the `wmb_onboarded` cookie. The only thing
 * that wrote it was the wizard's POST, and the wizard is never shown to a
 * writer the database already calls onboarded. So without the cookie:
 * /dashboard -> /onboarding ("already done, Open Dashboard") -> /dashboard ->
 * /onboarding, forever, on every page and every API call.
 *
 * These tests run the REAL middleware under a Clerk configuration (only the
 * session check is stubbed as signed in) and walk the writer's clicks.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: { user: { update: h.userUpdate } } }));

vi.mock("@clerk/nextjs/server", async () => {
  const actual = await vi.importActual<typeof import("@clerk/nextjs/server")>(
    "@clerk/nextjs/server"
  );
  type Handler = (auth: unknown, req: NextRequest) => unknown;
  return {
    ...actual,
    // Signed in: protect() lets the request through. Everything after it is
    // the app's own gate, unmodified.
    clerkMiddleware: (handler: Handler) => (req: NextRequest) =>
      handler(Object.assign(async () => ({ userId: "user_1" }), { protect: async () => {} }), req),
  };
});

type Middleware = (req: NextRequest) => Promise<Response | undefined | void>;

async function loadMiddleware(): Promise<Middleware> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_dW5pdC10ZXN0cy5jbGVyay5hY2NvdW50cy5kZXYk");
  vi.stubEnv("DEV_AUTH_BYPASS", "");
  vi.stubEnv("E2E_TEST_SECRET", "");
  const mod = await import("@/middleware");
  return mod.default as unknown as Middleware;
}

function get(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function isRedirectTo(res: Response | undefined | void, pathname: string): boolean {
  if (!res) return false;
  const location = res.headers.get("location");
  return res.status >= 300 && res.status < 400 && location !== null && new URL(location, "http://base.invalid").pathname === pathname;
}

/** The link an onboarded writer is offered on /onboarding. */
async function onboardingPageLink(): Promise<{ href: string; html: string }> {
  const { default: OnboardingPage } = await import("@/app/(onboarding)/onboarding/page");
  const html = renderToStaticMarkup(await OnboardingPage());
  const href = /href="([^"]+)"/.exec(html)?.[1];
  if (!href) throw new Error(`no link on the onboarding page: ${html}`);
  return { href, html };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({
    id: "u1",
    onboardingComplete: true,
    preferredLanguage: "sr",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Every test cold-imports the real middleware and Clerk after vi.resetModules(),
// which overruns the 5 s default when the suite runs in parallel shards.
describe("onboarded writer on a new browser (P5-S09)", { timeout: 30_000 }, () => {
  it("is sent to /onboarding when the cookie is missing (the gate itself is unchanged)", async () => {
    const middleware = await loadMiddleware();
    expect(isRedirectTo(await middleware(get("/dashboard")), "/onboarding")).toBe(true);
    expect(await middleware(get("/onboarding"))).toBeUndefined();
  });

  it("the page's link does not lead straight back into the gate", async () => {
    const middleware = await loadMiddleware();
    const { href } = await onboardingPageLink();

    // Pre-fix the link was "/dashboard": the gate bounced it to /onboarding.
    const res = await middleware(get(href));
    expect(isRedirectTo(res, "/onboarding")).toBe(false);
  });

  it("following the link restores the cookie and opens the dashboard, which then lets the writer in", async () => {
    const middleware = await loadMiddleware();
    const { href } = await onboardingPageLink();

    const { GET } = await import("@/app/(onboarding)/onboarding/continue/route");
    expect(href).toBe("/onboarding/continue");
    const res = await GET();

    expect(isRedirectTo(res, "/dashboard")).toBe(true);
    const cookie = res.cookies.get("wmb_onboarded");
    expect(cookie?.value).toBe("1");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/");

    expect(await middleware(get("/dashboard", "wmb_onboarded=1"))).toBeUndefined();
    expect(await middleware(get("/api/books", "wmb_onboarded=1"))).toBeUndefined();
  });

  it("never points the browser at the server's own bind address", async () => {
    // In the containerized stack req.nextUrl.origin is http://0.0.0.0:3000,
    // which the browser cannot open (ERR_ADDRESS_INVALID, see checkout).
    const { GET } = await import("@/app/(onboarding)/onboarding/continue/route");
    const res = await GET();
    const location = res.headers.get("location") ?? "";
    expect(location).toBe("/dashboard");
    expect(isRedirectTo(res, "/dashboard")).toBe(true);
  });

  it("does not hand the cookie to a writer who has not finished onboarding", async () => {
    h.requireUser.mockResolvedValue({ id: "u2", onboardingComplete: false, preferredLanguage: "en" });
    const { GET } = await import("@/app/(onboarding)/onboarding/continue/route");
    const res = await GET();

    expect(isRedirectTo(res, "/onboarding")).toBe(true);
    expect(res.cookies.get("wmb_onboarded")).toBeUndefined();
  });

  it("sends a signed-out visitor to sign in instead of erroring", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const { GET } = await import("@/app/(onboarding)/onboarding/continue/route");
    const res = await GET();

    expect(isRedirectTo(res, "/login")).toBe(true);
    expect(res.cookies.get("wmb_onboarded")).toBeUndefined();
  });

  it("speaks the writer's language on the 'already done' page", async () => {
    const { html } = await onboardingPageLink();
    const sr = getUIStrings("sr");
    expect(html).toContain(sr.appUI.onboardingComplete);
    expect(html).toContain(sr.onboardingUI.accountReady);
    expect(html).toContain(sr.onboardingUI.openDashboard);
    expect(html).not.toContain("Your account is set up");
    expect(html).not.toContain("Open Dashboard");
  });
});

describe("the wizard's own cookie and the recovery cookie are the same cookie", () => {
  it("POST /api/settings/onboarding sets it with the same name and options", async () => {
    h.userUpdate.mockResolvedValue({});
    const { POST } = await import("@/app/api/settings/onboarding/route");
    const { GET } = await import("@/app/(onboarding)/onboarding/continue/route");

    // `expires` is derived from maxAge at the moment of the call; compare the rest.
    type Cookie = { name: string; value: string; path?: string; httpOnly?: boolean; sameSite?: unknown; maxAge?: number };
    const withoutExpiry = (c: Cookie | undefined) =>
      c && { name: c.name, value: c.value, path: c.path, httpOnly: c.httpOnly, sameSite: c.sameSite, maxAge: c.maxAge };
    const fromWizard = (await POST()).cookies.get("wmb_onboarded");
    const fromRecovery = (await GET()).cookies.get("wmb_onboarded");
    expect(fromWizard).toBeDefined();
    expect(withoutExpiry(fromWizard)).toEqual(withoutExpiry(fromRecovery));
  });
});
