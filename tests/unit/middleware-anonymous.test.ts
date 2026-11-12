// P2-3 (Wave 5 Task 10): the e2e suite cannot show an anonymous request being
// refused (its server runs DEV_AUTH_BYPASS, and the old test accepted
// /dashboard as a pass). This proves it on the middleware itself: without
// a session, a protected route goes through Clerk's protect(); the e2e header
// is honoured only outside production; and DEV_AUTH_BYPASS is dead in
// production.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ protect: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  createRouteMatcher: (patterns: string[]) => (req: NextRequest) =>
    patterns.some((p) => new RegExp(`^${p.replace(/\(\.\*\)/g, ".*")}$`).test(req.nextUrl.pathname)),
  clerkMiddleware:
    (fn: (auth: { protect: () => Promise<void> }, req: NextRequest) => Promise<Response | void>) =>
    (req: NextRequest) =>
      fn({ protect: h.protect }, req),
}));

const env = process.env as Record<string, string | undefined>;
const KEYS = ["NODE_ENV", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "DEV_AUTH_BYPASS", "E2E_TEST_SECRET"];
const SAVED = Object.fromEntries(KEYS.map((k) => [k, env[k]]));

async function middleware(settings: Record<string, string | undefined>) {
  for (const k of KEYS) delete env[k];
  Object.assign(env, settings);
  vi.resetModules();
  return (await import("@/middleware")).default as unknown as (req: NextRequest) => Promise<Response | undefined>;
}

const anonymous = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://test${path}`, { headers });

const CLERK = "pk_live_Y2xlcmsud3JpdGVteWJvb2suYXBwJA";

beforeEach(() => {
  vi.clearAllMocks();
  h.protect.mockRejectedValue(Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { status: 404 }));
});

afterEach(() => {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete env[k];
    else env[k] = SAVED[k];
  }
});

describe("an anonymous request to a protected route", () => {
  it("goes through Clerk's protect() and is refused", async () => {
    const handler = await middleware({ NODE_ENV: "production", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: CLERK });
    await expect(handler(anonymous("/api/books"))).rejects.toThrow();
    expect(h.protect).toHaveBeenCalledTimes(1);
  });

  it("a public route needs no session", async () => {
    const handler = await middleware({ NODE_ENV: "production", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: CLERK });
    await handler(anonymous("/"));
    expect(h.protect).not.toHaveBeenCalled();
  });

  it("the e2e header is ignored in production", async () => {
    const handler = await middleware({
      NODE_ENV: "production",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: CLERK,
      E2E_TEST_SECRET: "s3cret",
    });
    await expect(handler(anonymous("/api/books", { "x-e2e-test-secret": "s3cret" }))).rejects.toThrow();
    expect(h.protect).toHaveBeenCalled();
  });

  it("the e2e header is honoured outside production (control)", async () => {
    const handler = await middleware({
      NODE_ENV: "development",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: CLERK,
      E2E_TEST_SECRET: "s3cret",
    });
    await handler(anonymous("/api/books", { "x-e2e-test-secret": "s3cret" }));
    expect(h.protect).not.toHaveBeenCalled();
  });

  it("DEV_AUTH_BYPASS is dead in production", async () => {
    const handler = await middleware({
      NODE_ENV: "production",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: CLERK,
      DEV_AUTH_BYPASS: "true",
    });
    await expect(handler(anonymous("/api/books"))).rejects.toThrow();
    expect(h.protect).toHaveBeenCalled();
  });

  it("with Clerk unconfigured, production answers 503 and development 401, never a pass", async () => {
    const prod = await middleware({ NODE_ENV: "production" });
    expect((await prod(anonymous("/api/books")))?.status).toBe(503);
    const dev = await middleware({ NODE_ENV: "development" });
    expect((await dev(anonymous("/api/books")))?.status).toBe(401);
  });
});
