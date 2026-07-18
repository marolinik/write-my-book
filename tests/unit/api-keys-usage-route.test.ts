// tests/unit/api-keys-usage-route.test.ts
// D-44 (P6 Owen, S3) route-level regression: GET /api/settings/api-keys must
// report a BYOK key's real spend. The judge's raw trace showed an OpenRouter
// key reading $0 while $10.21 of spend existed on model "openrouter-qwen36/
// sonnet" — the old `startsWith("openrouter/")` match missed the "openrouter-"
// sub-variant. This test drives the real GET handler with that exact model
// string and asserts the key's usage is non-zero.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    apiKey: { findMany: vi.fn() },
    usageRecord: { groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({
  decryptApiKey: (v: string) => v,
  maskApiKey: () => "sk-or-v...705e",
  encryptApiKey: (v: string) => v,
}));

import { GET } from "@/app/api/settings/api-keys/route";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
});

describe("GET /api/settings/api-keys — per-key usage (D-44)", () => {
  it("attributes openrouter-* sub-variant spend to the openrouter key (was $0)", async () => {
    h.db.apiKey.findMany.mockResolvedValue([
      {
        id: "k1",
        provider: "openrouter",
        label: "Owen OpenRouter",
        isDefault: true,
        validatedAt: new Date(),
        createdAt: new Date(),
        encryptedKey: "enc",
      },
    ]);
    h.db.usageRecord.groupBy.mockResolvedValue([
      {
        model: "openrouter-qwen36/sonnet",
        _sum: { tokensInput: 900_000, tokensOutput: 300_000, costEstimate: 10.21 },
        _count: { _all: 7 },
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].usage).toEqual({
      totalTokens: 1_200_000,
      totalCost: 10.21,
      sessionCount: 7,
    });
  });

  it("leaves a provider with no matching usage at zero", async () => {
    h.db.apiKey.findMany.mockResolvedValue([
      {
        id: "k2",
        provider: "anthropic",
        label: null,
        isDefault: true,
        validatedAt: null,
        createdAt: new Date(),
        encryptedKey: "enc",
      },
    ]);
    // Only openrouter + embedding usage exists — neither belongs to anthropic.
    h.db.usageRecord.groupBy.mockResolvedValue([
      {
        model: "openrouter-qwen36/sonnet",
        _sum: { tokensInput: 100, tokensOutput: 100, costEstimate: 2 },
        _count: { _all: 1 },
      },
      {
        model: "text-embedding-3-small",
        _sum: { tokensInput: 1000, tokensOutput: 0, costEstimate: 0.02 },
        _count: { _all: 5 },
      },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body[0].usage).toEqual({
      totalTokens: 0,
      totalCost: 0,
      sessionCount: 0,
    });
  });
});
