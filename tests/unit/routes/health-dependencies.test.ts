// P2-26: what a health caller sees depends on its trust tier, not NODE_ENV.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/health/dependencies", () => ({
  checkDependencies: async () => ({
    ok: false,
    status: "degraded",
    checkedAt: "2026-11-12T00:00:00.000Z",
    dependencies: [
      {
        name: "redis",
        required: true,
        status: "error",
        latencyMs: 3,
        message: "check failed",
        detail: "connect ECONNREFUSED 10.0.4.7:6379",
      },
    ],
  }),
}));

import { GET } from "@/app/api/health/dependencies/route";

const saved = { ...process.env };
beforeEach(() => {
  process.env.HEALTH_TOKEN = "health-token-0123456789";
});
afterEach(() => {
  process.env = { ...saved };
});

const call = (headers: Record<string, string>) =>
  GET(new NextRequest("http://app.example/api/health/dependencies", { headers }));

describe("health dependencies trust tiers", () => {
  it.each(["development", "production"])("a public caller in %s sees no detail", async (env) => {
    (process.env as Record<string, string>).NODE_ENV = env;
    const res = await call({ host: "app.example", "x-forwarded-for": "203.0.113.9" });
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("10.0.4.7");
    expect(JSON.parse(text).dependencies[0]).toEqual({ name: "redis", status: "error", required: true });
  });

  it("a caller with the token sees the cause", async () => {
    const res = await call({ host: "app.example", "x-health-token": "health-token-0123456789" });
    const body = await res.json();
    expect(body.dependencies[0].message).toBe("connect ECONNREFUSED 10.0.4.7:6379");
    expect(body.dependencies[0]).not.toHaveProperty("detail");
  });

  it("the loopback orchestrator sees the cause", async () => {
    const res = await call({ host: "localhost:3000" });
    expect((await res.json()).dependencies[0].message).toContain("ECONNREFUSED");
  });

  it("a wrong token is public", async () => {
    const res = await call({ host: "app.example", "x-health-token": "nope" });
    expect(await res.text()).not.toContain("ECONNREFUSED");
  });
});
