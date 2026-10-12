import { describe, it, expect, vi } from "vitest";
import { withOpenRouterPrivacy } from "@/lib/llm/openrouter-privacy";
import { resolveProviderRoute } from "@/lib/llm/client-factory";

/**
 * Launch audit 2026-10-12: Free and managed-tier text goes to OpenRouter on the
 * platform key, and nothing told OpenRouter to avoid providers that store or
 * train on prompts. Every OpenRouter request now carries
 * provider.data_collection = "deny", so the privacy policy can promise it.
 */
function capture() {
  const seen: { url: string; body: unknown }[] = [];
  const base = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response("{}");
  });
  return { seen, base };
}

describe("withOpenRouterPrivacy", () => {
  it("adds data_collection deny to a JSON request body", async () => {
    const { seen, base } = capture();
    await withOpenRouterPrivacy(base as never)("https://openrouter.ai/api/v1/messages", {
      method: "POST",
      body: JSON.stringify({ model: "deepseek/deepseek-v4.1-flash", messages: [] }),
    });
    expect(seen[0].body).toMatchObject({ provider: { data_collection: "deny" }, model: "deepseek/deepseek-v4.1-flash" });
  });

  it("keeps other provider preferences, and deny wins", async () => {
    const { seen, base } = capture();
    await withOpenRouterPrivacy(base as never)("https://openrouter.ai/api/v1/messages", {
      method: "POST",
      body: JSON.stringify({ provider: { order: ["x"], data_collection: "allow" } }),
    });
    expect(seen[0].body).toEqual({ provider: { order: ["x"], data_collection: "deny" } });
  });

  it("passes a request without a JSON body through unchanged", async () => {
    const { base } = capture();
    await withOpenRouterPrivacy(base as never)("https://openrouter.ai/api/v1/models", { method: "GET" });
    expect(base).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models", { method: "GET" });
  });
});

describe("resolveProviderRoute", () => {
  it("gives every OpenRouter route the private fetch", () => {
    for (const provider of ["anthropic", "openrouter", "openai", "gemini", "grok"] as const) {
      const route = resolveProviderRoute(provider, { openrouterApiKey: "or-key" }, "m", "m");
      expect(route.route, provider).toBe("openrouter");
      expect(route.route === "openrouter" ? route.fetch : undefined, provider).toBeTypeOf("function");
    }
  });

  it("leaves direct routes on the default fetch", () => {
    const route = resolveProviderRoute("anthropic", { anthropicApiKey: "sk" }, "m", "m");
    expect(route.route === "direct" ? route.fetch : "unexpected route").toBeUndefined();
  });
});
