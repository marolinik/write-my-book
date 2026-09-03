import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { validateApiKey } from "@/lib/llm/key-validator";

/**
 * Local-LLM-overlay branch of key validation (WMB_LLM_FORCE_LOCAL=1):
 * the probe must hit the OPERATOR's gateway URL — never the real provider —
 * and key acceptance follows the gateway's answer.
 */
describe("validateApiKey — local gateway overlay", () => {
  const OLD = process.env;
  beforeEach(() => {
    process.env = {
      ...OLD,
      WMB_LLM_FORCE_LOCAL: "1",
      WMB_LOCAL_PROXY_URL: "http://127.0.0.1:39999",
    };
  });
  afterEach(() => {
    process.env = OLD;
    vi.unstubAllGlobals();
  });

  it("probes the local gateway and reports valid on 200", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe("http://127.0.0.1:39999/v1/messages");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await validateApiKey("anthropic", "sk-ant-any-key-works-locally");
    expect(result).toEqual({ valid: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("trailing slashes in WMB_LOCAL_PROXY_URL do not double the path", async () => {
    process.env.WMB_LOCAL_PROXY_URL = "http://127.0.0.1:39999/";
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe("http://127.0.0.1:39999/v1/messages");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(validateApiKey("openai", "sk-x")).resolves.toEqual({ valid: true });
  });

  it("reports invalid when the gateway is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const result = await validateApiKey("anthropic", "sk-x");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Local LLM gateway unreachable/);
  });

  it("reports invalid on gateway rejection (5xx)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 }))
    );
    const result = await validateApiKey("anthropic", "sk-x");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/HTTP 500/);
  });

  it("never contacts a real provider endpoint in local mode", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      urls.push(String(url));
      return new Response("{}", { status: 200 });
    }));
    await validateApiKey("openrouter", "sk-or-x");
    await validateApiKey("gemini", "AIx");
    expect(urls.every((u) => u.startsWith("http://127.0.0.1:39999"))).toBe(true);
  });
});
