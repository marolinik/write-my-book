// P2-61: Sentry scrubbing was asymmetric. The worker, where BYOK keys are
// decrypted, had no beforeSend at all; the web beforeSend ignored exception
// values and breadcrumbs; every init traced 100% in production; and the
// client carried replay sample rates for a replay integration that does not
// exist (D20: removed).
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { scrubEvent, scrubBreadcrumb, sentryTraceRate } from "@/lib/sentry-scrub";

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const OR = "sk-or-v1-0123456789abcdef0123456789abcdef";

describe("scrubEvent", () => {
  it("redacts keys in the message, exception values, extra, contexts, request and breadcrumbs", () => {
    const event = {
      message: `failed with ${KEY}`,
      exception: { values: [{ type: "Error", value: `401 for key ${OR}` }] },
      extra: { header: `Bearer ${KEY}` },
      contexts: { llm: { apiKey: KEY } },
      request: { headers: { authorization: `Bearer ${OR}` }, data: `{"key":"${KEY}"}` },
      breadcrumbs: [{ message: `fetch ${OR}`, data: { url: `https://x/?key=AIzaSyA0123456789abcdefghijklmnopqrstuv` } }],
    };
    const out = JSON.stringify(scrubEvent(event));
    expect(out).not.toContain(KEY);
    expect(out).not.toContain(OR);
    expect(out).not.toContain("AIzaSyA0123456789");
    expect(out).toContain("[REDACTED]");
  });

  it("leaves ordinary text alone", () => {
    expect(scrubEvent({ message: "Chapter 3 failed to save" })).toEqual({ message: "Chapter 3 failed to save" });
  });

  it("scrubs a breadcrumb on its own", () => {
    expect(JSON.stringify(scrubBreadcrumb({ category: "console", message: `key=${KEY}` }))).not.toContain(KEY);
  });
});

describe("sentryTraceRate", () => {
  const saved = process.env.NODE_ENV;
  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = saved;
  });

  it("samples 10% of traces in production and everything elsewhere", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(sentryTraceRate()).toBe(0.1);
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(sentryTraceRate()).toBe(1);
  });
});

describe("every Sentry init uses the shared scrubber", () => {
  it.each(["sentry.client.config.ts", "sentry.server.config.ts", "sentry.edge.config.ts", "src/worker.ts"])("%s", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/beforeSend:\s*scrubEvent/);
    expect(src).toMatch(/beforeBreadcrumb:\s*scrubBreadcrumb/);
    expect(src).toMatch(/tracesSampleRate:\s*sentryTraceRate\(\)/);
    expect(src).not.toMatch(/replaysSessionSampleRate|replaysOnErrorSampleRate/);
  });
});
