import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * C1/S9 regression: "Discuss finding" and entity extraction must pick the cheap
 * ("haiku"-tier) model for the USER'S OWN provider via resolveCheapModelFor —
 * not a hardcoded anthropic/haiku, which 400/500'd every turn for OpenRouter-only
 * BYOK users (the mission's qwen config). We keep the REAL resolveCheapModelFor
 * and only capture the modelId handed to createLLMClient.
 */

const h = vi.hoisted(() => ({
  createLLMClient: vi.fn(),
  db: {
    user: { findUnique: vi.fn() },
    apiKey: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: (s: string) => s }));
vi.mock("@/lib/llm", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/llm")>();
  return { ...actual, createLLMClient: h.createLLMClient };
});

import { runDiscussTurn } from "@/lib/editorial/discuss-llm";
import { extractEntities } from "@/lib/graph/entity-extractor";

/** modelId passed into createLLMClient by the most recent call. */
function capturedModelId(): string {
  const calls = h.createLLMClient.mock.calls;
  return calls[calls.length - 1][0].modelId as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.createLLMClient.mockImplementation((opts: { modelId: string }) => ({
    client: {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: '{"entities":[],"relationships":[]}' }],
        }),
      },
    },
    model: { modelId: opts.modelId },
    effectiveModelId: opts.modelId,
  }));
});

describe("runDiscussTurn honors the user's provider", () => {
  beforeEach(() => {
    h.db.apiKey.findMany.mockResolvedValue([{ provider: "openrouter", encryptedKey: "k" }]);
  });

  it("routes an OpenRouter-default user to an openrouter/* cheap model (not anthropic)", async () => {
    h.db.user.findUnique.mockResolvedValue({ defaultModel: "openrouter-qwen-max/opus" });
    await runDiscussTurn({ system: "s", user: "u", userId: "u1" });
    // Exact id (not just /^openrouter/): resolveCheapModelFor("openrouter-qwen-max/opus")
    // returns "openrouter-qwen-max/haiku". The loose regex also matched the PRE-FIX
    // heuristic ("openrouter/haiku"), so it gave no regression protection — now that
    // CI gates merges on this suite, assert the exact post-fix model.
    expect(capturedModelId()).toBe("openrouter-qwen-max/haiku");
  });

  it("preserves anthropic/haiku for an anthropic-default user", async () => {
    h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
    await runDiscussTurn({ system: "s", user: "u", userId: "u1" });
    expect(capturedModelId()).toBe("anthropic/haiku");
  });

  it("defaults to anthropic/haiku when the user has no stored defaultModel", async () => {
    h.db.user.findUnique.mockResolvedValue(null);
    await runDiscussTurn({ system: "s", user: "u", userId: "u1" });
    expect(capturedModelId()).toBe("anthropic/haiku");
  });
});

describe("extractEntities honors the user's provider", () => {
  it("routes an OpenRouter-default user to an openrouter/* cheap model", async () => {
    await extractEntities("some text", "b1", 1, { openrouterApiKey: "k" }, "openrouter-qwen-max/opus");
    // Exact id (not just /^openrouter/): resolveCheapModelFor("openrouter-qwen-max/opus")
    // returns "openrouter-qwen-max/haiku". The loose regex also matched the PRE-FIX
    // heuristic ("openrouter/haiku"), so it gave no regression protection — now that
    // CI gates merges on this suite, assert the exact post-fix model.
    expect(capturedModelId()).toBe("openrouter-qwen-max/haiku");
  });

  it("preserves anthropic/haiku for an anthropic-default user", async () => {
    await extractEntities("some text", "b1", 1, { anthropicApiKey: "k" }, "anthropic/sonnet");
    expect(capturedModelId()).toBe("anthropic/haiku");
  });

  it("falls back to the key-presence heuristic when no defaultModel is threaded", async () => {
    await extractEntities("some text", "b1", 1, { openrouterApiKey: "k" });
    expect(capturedModelId()).toBe("openrouter/haiku");
  });
});
