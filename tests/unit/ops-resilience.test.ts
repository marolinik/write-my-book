import { describe, it, expect } from "vitest";
import { clientTimeoutMsFor, redisRetryDelayMs } from "@/lib/llm/client-timeouts";
import { createErrorLogThrottle } from "@/lib/queue/error-log-throttle";

/**
 * O5 — `qwen3.8-27b-uncensored` (Zika) answers /v1/models while its weights are
 * not resident, so the first request after an idle period can hang for minutes
 * and then die on the client's default timeout. The model is fine; the deadline
 * was wrong.
 *
 * O6 — while Docker was down the worker wrote ~80k ECONNREFUSED lines with no
 * backoff. The same one-line failure, eighty thousand times, buried everything
 * else in the log and would have buried the Sentry quota too.
 */

describe("clientTimeoutMsFor", () => {
  it("gives a cold local model room to load its weights", () => {
    const zika = clientTimeoutMsFor("local-zika/sonnet") ?? 0;
    const flash = clientTimeoutMsFor("local-deepseek/sonnet") ?? 0;
    expect(zika).toBeGreaterThan(flash);
    expect(zika).toBeGreaterThanOrEqual(15 * 60_000);
  });

  it("gives every local fleet model more than a hosted one", () => {
    expect(clientTimeoutMsFor("local-qwenflash/haiku") ?? 0).toBeGreaterThan(0);
    expect(clientTimeoutMsFor("claude-sonnet-5")).toBeUndefined();
  });

  it("recognises the cold family by model id, not by exact match", () => {
    expect(clientTimeoutMsFor("local-zika/opus")).toBe(clientTimeoutMsFor("local-zika/haiku"));
  });

  it("treats an unknown id as hosted rather than guessing a long deadline", () => {
    expect(clientTimeoutMsFor("")).toBeUndefined();
    expect(clientTimeoutMsFor("some-new-model")).toBeUndefined();
  });
});

describe("redisRetryDelayMs", () => {
  it("backs off exponentially instead of hammering a dead Redis", () => {
    expect(redisRetryDelayMs(1)).toBeLessThan(redisRetryDelayMs(3));
    expect(redisRetryDelayMs(3)).toBeLessThan(redisRetryDelayMs(6));
  });

  it("caps the wait so a recovered Redis is picked up promptly", () => {
    expect(redisRetryDelayMs(50)).toBeLessThanOrEqual(30_000);
    expect(redisRetryDelayMs(1)).toBeGreaterThanOrEqual(500);
  });
});

describe("createErrorLogThrottle", () => {
  it("logs the first occurrence immediately", () => {
    const t = createErrorLogThrottle(60_000);
    expect(t.shouldLog("connect ECONNREFUSED 127.0.0.1:6379", 0)).toBe(true);
  });

  it("swallows the repeats and counts them", () => {
    const t = createErrorLogThrottle(60_000);
    t.shouldLog("ECONNREFUSED", 0);
    for (let i = 1; i < 5000; i++) {
      expect(t.shouldLog("ECONNREFUSED", i)).toBe(false);
    }
    expect(t.suppressedCount("ECONNREFUSED")).toBe(4999);
  });

  it("logs again after the window, and reports how many were swallowed", () => {
    const t = createErrorLogThrottle(60_000);
    t.shouldLog("ECONNREFUSED", 0);
    t.shouldLog("ECONNREFUSED", 10);
    expect(t.shouldLog("ECONNREFUSED", 60_001)).toBe(true);
    // The counter resets once the summary has been emitted.
    expect(t.suppressedCount("ECONNREFUSED")).toBe(0);
  });

  it("keeps different errors apart — a new failure is never hidden by an old one", () => {
    const t = createErrorLogThrottle(60_000);
    expect(t.shouldLog("ECONNREFUSED", 0)).toBe(true);
    expect(t.shouldLog("READONLY You can't write against a read only replica", 1)).toBe(true);
  });

  it("collapses the same failure even when the message carries a changing suffix", () => {
    const t = createErrorLogThrottle(60_000);
    expect(t.shouldLog("connect ECONNREFUSED 127.0.0.1:6379", 0)).toBe(true);
    expect(t.shouldLog("connect ECONNREFUSED 127.0.0.1:6379 (attempt 2)", 1)).toBe(false);
  });
});
