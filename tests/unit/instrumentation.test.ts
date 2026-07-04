import { describe, it, expect } from "vitest";

// Smoke-import the Next.js instrumentation entry. The Sentry.init side effects
// (which only fire under a real server runtime with NEXT_RUNTIME set) are not
// unit-testable — this guards the wiring contract Next.js relies on:
//   - `register()` exists and is called at server startup
//   - `onRequestError` is re-exported so RSC / route-handler errors are captured
import * as instrumentation from "@/instrumentation";

describe("instrumentation — server/edge Sentry wiring", () => {
  it("exports a register() hook", () => {
    expect(typeof instrumentation.register).toBe("function");
  });

  it("re-exports onRequestError for request-error capture", () => {
    expect(typeof instrumentation.onRequestError).toBe("function");
  });

  it("register() is a safe no-op when no server runtime is set", async () => {
    const prev = process.env.NEXT_RUNTIME;
    delete process.env.NEXT_RUNTIME;
    try {
      await expect(instrumentation.register()).resolves.toBeUndefined();
    } finally {
      if (prev !== undefined) process.env.NEXT_RUNTIME = prev;
    }
  });
});
