// P2-4 (Wave 5 Task 8): no test imported the real src/lib/auth.ts to prove
// that its two development shortcuts — the e2e header and DEV_AUTH_BYPASS —
// are dead in production. With both configured and the header sent,
// production must find no user and never touch the database.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  header: "e2e-secret",
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null }), currentUser: async () => null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-e2e-test-secret": h.header }),
}));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: h.findUnique, upsert: h.upsert } } }));
vi.mock("@/lib/llm/defaults", () => ({ getDefaultModelId: () => "model-x" }));

const env = process.env as Record<string, string | undefined>;
const SAVED = { ...env };

async function loadAuth() {
  vi.resetModules();
  return import("@/lib/auth");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findUnique.mockResolvedValue({ id: "e2e-user" });
  h.upsert.mockResolvedValue({ id: "dev-user" });
  // Clerk unconfigured; both shortcuts configured.
  env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "";
  env.E2E_TEST_SECRET = "e2e-secret";
  env.DEV_AUTH_BYPASS = "true";
  env.DEV_CLERK_ID = "user_dev";
});

afterEach(() => {
  for (const key of ["NODE_ENV", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "E2E_TEST_SECRET", "DEV_AUTH_BYPASS", "DEV_CLERK_ID"]) {
    if (SAVED[key] === undefined) delete env[key];
    else env[key] = SAVED[key];
  }
});

describe("getDbUser's development shortcuts", () => {
  it("work outside production (control: the test reaches them)", async () => {
    env.NODE_ENV = "development";
    const { getDbUser } = await loadAuth();
    expect(await getDbUser()).toEqual({ id: "e2e-user" });
  });

  it("are dead in production: the e2e header and DEV_AUTH_BYPASS both give no user", async () => {
    env.NODE_ENV = "production";
    const { getDbUser, requireUser } = await loadAuth();
    expect(await getDbUser()).toBeNull();
    await expect(requireUser()).rejects.toThrow();
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("DEV_AUTH_BYPASS alone (no e2e header) is dead in production too", async () => {
    h.header = "wrong";
    env.NODE_ENV = "development";
    expect(await (await loadAuth()).getDbUser()).toEqual({ id: "e2e-user" });
    env.NODE_ENV = "production";
    vi.clearAllMocks();
    expect(await (await loadAuth()).getDbUser()).toBeNull();
    expect(h.upsert).not.toHaveBeenCalled();
    h.header = "e2e-secret";
  });
});
