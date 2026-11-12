// P2-30: connection failures and gateway timeouts are retried with backoff
// like a 503, instead of failing at once as an unknown 500; the final failure
// carries a code that does not promise another retry; and an OpenRouter 404
// under the no-training policy says the model is not allowed, not "unknown".
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withProviderRetry, ProviderError, RETRY_CONFIG } from "@/lib/llm/retry-handler";
import { translateProviderError } from "@/lib/llm/error-translator";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function run<T>(fn: () => Promise<T>, provider: "openrouter" | "anthropic" = "anthropic") {
  const onRetry = vi.fn();
  const p = withProviderRetry(fn, { provider, onRetry });
  const settled = p.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e })
  );
  await vi.runAllTimersAsync();
  return { result: await settled, onRetry };
}

const connReset = () => Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
const sdkConnection = () => Object.assign(new Error("Connection error."), { name: "APIConnectionError" });
const fetchFailed = () => new TypeError("fetch failed");

describe("transport failures", () => {
  it.each([
    ["ECONNRESET", connReset],
    ["the SDK's APIConnectionError", sdkConnection],
    ["fetch failed", fetchFailed],
    ["a 504", () => Object.assign(new Error("Gateway Timeout"), { status: 504 })],
  ])("%s is retried, then succeeds", async (_n, make) => {
    let calls = 0;
    const { result, onRetry } = await run(async () => {
      calls++;
      if (calls < 3) throw make();
      return "ok";
    });
    expect(result).toEqual({ ok: true, v: "ok" });
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries with a timeout code, not the 'will be retried' one", async () => {
    let calls = 0;
    const { result } = await run(async () => {
      calls++;
      throw connReset();
    });
    expect(calls).toBe(RETRY_CONFIG.maxRetries + 1);
    expect(result.ok).toBe(false);
    const err = (result as { e: ProviderError }).e;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.translated.code).toBe("PROVIDER_TIMEOUT");
    expect(err.translated.userMessage).not.toMatch(/will be retried/i);
  });

  it("a 400 is still not retried", async () => {
    let calls = 0;
    const { result } = await run(async () => {
      calls++;
      throw Object.assign(new Error("bad"), { status: 400 });
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
  });
});

describe("OpenRouter no-training 404", () => {
  it("maps to PROVIDER_MODEL_NOT_ALLOWED with a settings action", () => {
    const t = translateProviderError(404, "openrouter");
    expect(t.code).toBe("PROVIDER_MODEL_NOT_ALLOWED");
    expect(t.retryable).toBe(false);
    expect(t.action).toBe("check-key");
  });

  it("no translated message promises an automatic retry", () => {
    for (const status of [500, 502, 503, 504, 418]) {
      expect(translateProviderError(status, "anthropic").userMessage).not.toMatch(/will be retried/i);
    }
  });
});
