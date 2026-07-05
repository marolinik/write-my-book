import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: { apiKey: { findMany: vi.fn() } },
  decryptApiKey: vi.fn((s: string) => `dec:${s}`),
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: h.decryptApiKey }));

import { getExtractionKeysForUser } from "@/lib/agents/extraction-keys";

beforeEach(() => {
  vi.clearAllMocks();
  h.decryptApiKey.mockImplementation((s: string) => `dec:${s}`);
});

describe("getExtractionKeysForUser (entity-extraction key threading)", () => {
  it("decrypts validated keys into the correct LLMClientOptions fields", async () => {
    h.db.apiKey.findMany.mockResolvedValue([
      { provider: "openrouter", encryptedKey: "enc-or", validatedAt: new Date() },
      { provider: "anthropic", encryptedKey: "enc-an", validatedAt: new Date() },
    ]);
    const keys = await getExtractionKeysForUser("u1");
    expect(keys.openrouterApiKey).toBe("dec:enc-or");
    expect(keys.anthropicApiKey).toBe("dec:enc-an");
    // the openrouter-only BYOK user (the mission's config) gets a usable key
    expect(Object.keys(keys).sort()).toEqual(["anthropicApiKey", "openrouterApiKey"]);
  });

  it("skips UNvalidated keys (never used for extraction, mirrors the worker)", async () => {
    h.db.apiKey.findMany.mockResolvedValue([
      { provider: "openrouter", encryptedKey: "enc-or", validatedAt: null },
    ]);
    expect(await getExtractionKeysForUser("u1")).toEqual({});
  });

  it("skips an undecryptable key without throwing", async () => {
    h.db.apiKey.findMany.mockResolvedValue([
      { provider: "anthropic", encryptedKey: "bad", validatedAt: new Date() },
    ]);
    h.decryptApiKey.mockImplementation(() => {
      throw new Error("bad key");
    });
    await expect(getExtractionKeysForUser("u1")).resolves.toEqual({});
  });

  it("ignores unknown providers", async () => {
    h.db.apiKey.findMany.mockResolvedValue([
      { provider: "mystery", encryptedKey: "x", validatedAt: new Date() },
    ]);
    expect(await getExtractionKeysForUser("u1")).toEqual({});
  });

  it("returns an empty object when the user has no keys", async () => {
    h.db.apiKey.findMany.mockResolvedValue([]);
    expect(await getExtractionKeysForUser("u1")).toEqual({});
  });
});
