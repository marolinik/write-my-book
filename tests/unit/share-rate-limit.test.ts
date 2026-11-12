// P2-23: the public share limiter was keyed by the FIRST x-forwarded-for hop
// (client-controlled), ran per process, kept two separate budgets for the page
// and the API, and never evicted spoofed keys.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: h.rateLimit }));

import { allowShareLoad, clientIpFrom, InMemoryRateLimiter } from "@/lib/share/token";

const TOKEN = "a".repeat(48);
const hdrs = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const saved = process.env.TRUSTED_PROXY_HOPS;

beforeEach(() => {
  vi.clearAllMocks();
  h.rateLimit.mockResolvedValue(true);
  delete process.env.TRUSTED_PROXY_HOPS;
});
afterEach(() => {
  if (saved === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = saved;
});

describe("clientIpFrom", () => {
  it("takes the address our proxy appended, not the client-supplied head", () => {
    expect(clientIpFrom(hdrs({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIpFrom(hdrs({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("honours TRUSTED_PROXY_HOPS for a chain of proxies", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIpFrom(hdrs({ "x-forwarded-for": "spoof, 203.0.113.9, 10.0.0.2" }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIpFrom(hdrs({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIpFrom(hdrs({}))).toBe("unknown");
  });
});

describe("allowShareLoad", () => {
  it("counts per client IP and per token in the shared (Redis) limiter", async () => {
    await allowShareLoad(hdrs({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }), TOKEN);
    const keys = h.rateLimit.mock.calls.map((c) => c[0] as string);
    expect(keys).toContain("share-ip:203.0.113.9");
    expect(keys).toContain(`share-token:${TOKEN}`);
  });

  it("a spoofed head cannot buy a fresh budget", async () => {
    await allowShareLoad(hdrs({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }), TOKEN);
    await allowShareLoad(hdrs({ "x-forwarded-for": "2.2.2.2, 203.0.113.9" }), TOKEN);
    const ipKeys = h.rateLimit.mock.calls.map((c) => c[0] as string).filter((k) => k.startsWith("share-ip:"));
    expect(new Set(ipKeys)).toEqual(new Set(["share-ip:203.0.113.9"]));
  });

  it("refuses when either budget is spent", async () => {
    h.rateLimit.mockImplementation(async (key: string) => !key.startsWith("share-token:"));
    expect(await allowShareLoad(hdrs({ "x-real-ip": "203.0.113.9" }), TOKEN)).toBe(false);
  });

  it("the page and the API share the one limiter", () => {
    const page = readFileSync("src/app/share/[token]/page.tsx", "utf8");
    const api = readFileSync("src/app/api/share/[token]/route.ts", "utf8");
    expect(page).toMatch(/allowShareLoad\(/);
    expect(api).toMatch(/allowShareLoad\(/);
    expect(api).not.toMatch(/new InMemoryRateLimiter/);
  });
});

describe("InMemoryRateLimiter (the backstop when Redis is down)", () => {
  it("evicts expired keys so spoofed ones cannot grow the map forever", () => {
    const l = new InMemoryRateLimiter(1000, 5);
    for (let i = 0; i < 100; i++) l.allow(`k${i}`, 0);
    l.allow("fresh", 5000);
    expect(l.size()).toBe(1);
  });
});
