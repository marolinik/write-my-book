// P1-11: the managed (platform-key) tier reached only the first inline turn.
// /message said "BYOK, no platform key fallbacks" and the worker re-read only
// the writer's keys and stamped every row keySource "user", so a keyless Free
// writer got one coach turn, every queued job failed three times, and the
// platform cap never saw that spend. One resolveSessionKeys now decides the
// keys for the start route, /message and the worker alike.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({
  apiKeys: vi.fn(),
  subscription: vi.fn(),
  managedKeyFor: vi.fn(),
  isFreeTierUser: vi.fn(),
  managedTierConfig: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { apiKey: { findMany: h.apiKeys }, subscription: { findUnique: h.subscription } },
}));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: (value: string) => `plain:${value}` }));
vi.mock("@/lib/billing/managed-tier", () => ({
  managedKeyFor: h.managedKeyFor,
  managedTierConfig: () => h.managedTierConfig(),
}));
vi.mock("@/lib/billing/free-tier-meters", () => ({ isFreeTierUser: h.isFreeTierUser }));

import { resolveSessionKeys } from "@/lib/billing/session-keys";

const PLATFORM = { provider: "openrouter", apiKey: "sk-platform" };
const ALLOWANCE = { granted: true, remainingTodayUsd: 0.4, remainingThisMonthUsd: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  h.apiKeys.mockResolvedValue([]);
  h.subscription.mockResolvedValue(null);
  h.isFreeTierUser.mockReturnValue(true);
  h.managedTierConfig.mockReturnValue(PLATFORM);
  h.managedKeyFor.mockResolvedValue({ allowance: ALLOWANCE, config: PLATFORM });
});

describe("resolveSessionKeys", () => {
  it("lends a keyless Free writer the platform key, in its own provider slot only", async () => {
    const keys = await resolveSessionKeys("u1", true);
    expect(keys.keySource).toBe("platform");
    expect(keys.availableKeys.openrouterApiKey).toBe("sk-platform");
    expect(keys.availableKeys.anthropicApiKey).toBeUndefined();
    expect(h.managedKeyFor).toHaveBeenCalledWith("u1", true);
  });

  it("uses the writer's own key and never asks for the platform one", async () => {
    h.apiKeys.mockResolvedValue([{ provider: "openrouter", encryptedKey: "enc", validatedAt: new Date() }]);
    const keys = await resolveSessionKeys("u1", true);
    expect(keys.keySource).toBe("user");
    expect(keys.availableKeys.openrouterApiKey).toBe("plain:enc");
    expect(h.managedKeyFor).not.toHaveBeenCalled();
  });

  it("works out Free itself when the caller has no quota result (the worker)", async () => {
    await resolveSessionKeys("u1");
    expect(h.isFreeTierUser).toHaveBeenCalled();
    expect(h.managedKeyFor).toHaveBeenCalledWith("u1", true);
  });

  it("does not read the subscription when the managed tier is off", async () => {
    h.managedTierConfig.mockReturnValue(null);
    const keys = await resolveSessionKeys("u1");
    expect(keys.keySource).toBe("user");
    expect(h.subscription).not.toHaveBeenCalled();
    expect(h.managedKeyFor).not.toHaveBeenCalled();
  });

  it("reports user keys when the platform allowance is spent", async () => {
    h.managedKeyFor.mockResolvedValue({ allowance: { ...ALLOWANCE, granted: false }, config: null });
    const keys = await resolveSessionKeys("u1", true);
    expect(keys.keySource).toBe("user");
    expect(keys.availableKeys.openrouterApiKey).toBeUndefined();
  });
});

const SRC = join(__dirname, "..", "..", "src");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf-8");

describe("every path that runs a session uses the same key decision", () => {
  it("/message resolves keys through resolveSessionKeys and stamps the key source", () => {
    const route = read("app", "api", "books", "[id]", "agent", "[sessionId]", "message", "route.ts");
    expect(route).toContain("resolveSessionKeys(");
    expect(route).not.toMatch(/no platform key fallbacks/i);
    expect(route).toMatch(/usageRecord\.create\([\s\S]{0,400}keySource/);
  });

  it("the worker resolves keys through resolveSessionKeys and stamps the key source", () => {
    const worker = read("lib", "queue", "agent-worker.ts");
    expect(worker).toContain("resolveSessionKeys(");
    expect(worker).not.toContain('keySource: "user"');
  });

  it("the worker does not retry a job that has no usable key", () => {
    const worker = read("lib", "queue", "agent-worker.ts");
    expect(worker).toMatch(/throw new UnrecoverableError\(\s*`No API key/);
  });

  it("the start route uses the same decision", () => {
    expect(read("app", "api", "books", "[id]", "agent", "route.ts")).toContain("resolveSessionKeys(");
  });
});
