// P1-12 / D3: direct OpenAI, Gemini and Grok keys were sent to a LiteLLM
// relay that is not deployed, defaulting to the local fleet proxy's port, and
// failed on every call with "temporary issues, retried automatically". There
// is no relay (D3), so those models go through OpenRouter, and a writer with
// only a direct key gets a clear answer instead.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  validateApiKey: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: { apiKey: { create: h.create, upsert: h.create, findFirst: vi.fn() } } }));
vi.mock("@/lib/encryption", () => ({
  encryptApiKey: (k: string) => `enc:${k}`,
  decryptApiKey: (k: string) => k,
  maskApiKey: () => "sk-...1234",
}));
vi.mock("@/lib/llm/key-validator", () => ({ validateApiKey: (...a: unknown[]) => h.validateApiKey(...a) }));

import { resolveProviderRoute } from "@/lib/llm/client-factory";
import { POST } from "@/app/api/settings/api-keys/route";

const ORIGINAL = process.env.LITELLM_BASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.LITELLM_BASE_URL;
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.validateApiKey.mockResolvedValue({ valid: true });
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.LITELLM_BASE_URL;
  else process.env.LITELLM_BASE_URL = ORIGINAL;
});

describe("routing a model whose provider has no direct path", () => {
  it("answers a writer with only a direct OpenAI key with a clear OpenRouter message", () => {
    const route = resolveProviderRoute("openai", { openaiApiKey: "sk-direct" }, "gpt-4o", "openai/gpt-4o");
    expect(route.route).toBe("none");
    if (route.route !== "none") return;
    expect(route.code).toBe("DIRECT_KEY_UNSUPPORTED");
    expect(route.error).toMatch(/OpenRouter/);
  });

  it("uses OpenRouter for the same model when the writer has an OpenRouter key", () => {
    const route = resolveProviderRoute(
      "gemini",
      { geminiApiKey: "AIza-direct", openrouterApiKey: "sk-or" },
      "gemini-2.5-pro",
      "gemini/2.5-pro"
    );
    expect(route.route).toBe("openrouter");
  });

  it("uses the relay only when one is configured", () => {
    process.env.LITELLM_BASE_URL = "http://litellm:4000";
    const route = resolveProviderRoute("grok", { grokApiKey: "xai-direct" }, "grok-4", "grok/grok-4");
    expect(route.route).toBe("litellm-proxy");
    if (route.route === "none") return;
    expect(route.baseURL).toBe("http://litellm:4000");
  });

  it("never defaults the relay to the local fleet proxy's port", () => {
    const source = readFileSync(join(__dirname, "..", "..", "src", "lib", "llm", "client-factory.ts"), "utf-8");
    expect(source).not.toMatch(/LITELLM_BASE_URL\s*\|\|\s*"http:\/\/localhost:30400"/);
  });
});

describe("saving a key for a provider with no direct path", () => {
  const save = (provider: string) =>
    POST(
      new NextRequest("http://t/api/settings/api-keys", {
        method: "POST",
        body: JSON.stringify({ provider, key: "AIzaSyTestKey00000000000000000000000" }),
        headers: { "content-type": "application/json" },
      })
    );

  it("refuses a new Gemini key with the OpenRouter message, before calling Google", async () => {
    const res = await save("gemini");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("DIRECT_KEY_UNSUPPORTED");
    expect(body.error).toMatch(/OpenRouter/);
    expect(h.validateApiKey).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });
});

describe("the session start route", () => {
  it("returns the direct-key message instead of 'No OpenAI API key configured'", () => {
    const route = readFileSync(
      join(__dirname, "..", "..", "src", "app", "api", "books", "[id]", "agent", "route.ts"),
      "utf-8"
    );
    expect(route).toContain('"DIRECT_KEY_UNSUPPORTED"');
  });
});
