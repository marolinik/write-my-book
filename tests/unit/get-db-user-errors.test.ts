// P1-2 / P2-2: getDbUser wrapped auth(), the lookup, currentUser() and the
// create in one bare catch, so a database outage looked like "signed out"
// (401, redirect to /login), and a first sign-in racing the user.created
// webhook hit P2002 and showed an error page. A failure now says so, and the
// first sign-in upserts.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  db: { user: { findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn() } },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => h.auth(), currentUser: () => h.currentUser() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("./db", () => ({ db: h.db }));
vi.mock("@/lib/llm/defaults", () => ({ getDefaultModelId: () => "model-x" }));

async function loadAuth() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k");
  return import("@/lib/auth");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  h.auth.mockResolvedValue({ userId: "user_1" });
  h.currentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: "ana@example.com" },
    emailAddresses: [{ emailAddress: "ana@example.com" }],
    firstName: "Ana",
    lastName: "Writer",
    username: null,
  });
});

describe("getDbUser", () => {
  it("throws AuthUnavailableError when the database fails, instead of acting signed out", async () => {
    h.db.user.findUnique.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const { getDbUser } = await loadAuth();
    const { AuthUnavailableError } = await import("@/lib/auth/errors");
    await expect(getDbUser()).rejects.toBeInstanceOf(AuthUnavailableError);
  });

  it("upserts on the Clerk id at first sign-in, so the user.created race cannot fail it", async () => {
    h.db.user.findUnique.mockResolvedValue(null);
    h.db.user.upsert.mockResolvedValue({ id: "u1", clerkId: "user_1" });
    const { getDbUser } = await loadAuth();
    const user = await getDbUser();
    expect(user).toMatchObject({ id: "u1" });
    expect(h.db.user.upsert).toHaveBeenCalledTimes(1);
    expect(h.db.user.upsert.mock.calls[0][0].where).toEqual({ clerkId: "user_1" });
    expect(h.db.user.upsert.mock.calls[0][0].create.email).toBe("ana@example.com");
    expect(h.db.user.create).not.toHaveBeenCalled();
  });

  it("gives a user with no email a unique placeholder, so two of them cannot collide", async () => {
    h.db.user.findUnique.mockResolvedValue(null);
    h.db.user.upsert.mockImplementation(async (args: { create: { email: string } }) => ({ id: "u2", email: args.create.email }));
    h.currentUser.mockResolvedValue({ primaryEmailAddress: null, emailAddresses: [], firstName: null, lastName: null, username: "ana" });
    const { getDbUser } = await loadAuth();
    await getDbUser();
    const email = h.db.user.upsert.mock.calls[0][0].create.email as string;
    expect(email).toContain("user_1");
    expect(email).not.toBe("");
  });

  it("returns null when there is simply no session", async () => {
    h.auth.mockResolvedValue({ userId: null });
    const { getDbUser } = await loadAuth();
    expect(await getDbUser()).toBeNull();
  });
});

describe("requireUser", () => {
  it("throws UnauthorizedError whose message routes still match", async () => {
    h.auth.mockResolvedValue({ userId: null });
    const { requireUser } = await loadAuth();
    const { UnauthorizedError } = await import("@/lib/auth/errors");
    const error = await requireUser().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as Error).message).toBe("Unauthorized");
  });
});
