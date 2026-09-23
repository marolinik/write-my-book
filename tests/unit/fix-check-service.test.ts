/**
 * The check runs inside the writer's apply click, so it must be quick, quiet
 * and harmless: off without its flag, never slower than its time budget, and
 * a failure leaves the finding exactly as the apply left it.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

const ENV = { FIX_CHECK_ENABLED: "1", TYPESAFE_API_KEY: "k" };
const FINDING = { id: "f1", category: "pov", description: "d", suggestion: null };

function mockWorld(opts: { answer?: unknown; fail?: boolean; hang?: boolean } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  let calls = 0;
  vi.doMock("@/lib/db", () => ({
    db: {
      editFinding: {
        update: vi.fn(async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return {};
        }),
      },
    },
  }));
  vi.doMock("@typesafe-ai/sdk", () => ({
    TypeSafeClient: class {
      async systemOne() {
        calls++;
        if (opts.fail) throw new Error("upstream 503");
        if (opts.hang) await new Promise(() => {});
        return { answers: { remains: opts.answer ?? { type: "noul", noul: 0.76 } } };
      }
    },
  }));
  return { updates, calls: () => calls };
}

describe("checkAppliedFix", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does nothing when it is switched off", async () => {
    const world = mockWorld();
    const { checkAppliedFix } = await import("@/lib/editorial/fix-check-service");
    const r = await checkAppliedFix({ finding: FINDING, before: "a", after: "b", env: {} });
    expect(r).toBeNull();
    expect(world.calls()).toBe(0);
    expect(world.updates).toHaveLength(0);
  });

  it("stores the probability the problem remains, and when it was judged", async () => {
    const world = mockWorld();
    const { checkAppliedFix } = await import("@/lib/editorial/fix-check-service");
    const r = await checkAppliedFix({ finding: FINDING, before: "a", after: "b", env: ENV });
    expect(r).toBe(0.76);
    expect(world.updates[0].fixRemains).toBe(0.76);
    expect(world.updates[0].fixCheckedAt).toBeInstanceOf(Date);
  });

  it("knows an unchanged passage still has its problem without asking anyone", async () => {
    const world = mockWorld();
    const { checkAppliedFix } = await import("@/lib/editorial/fix-check-service");
    const r = await checkAppliedFix({ finding: FINDING, before: "Isto.", after: " Isto. ", env: ENV });
    expect(r).toBe(1);
    expect(world.calls()).toBe(0);
    expect(world.updates[0].fixRemains).toBe(1);
  });

  it("gives up inside its time budget and writes nothing", async () => {
    const world = mockWorld({ hang: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkAppliedFix } = await import("@/lib/editorial/fix-check-service");
    const r = await checkAppliedFix({ finding: FINDING, before: "a", after: "b", env: ENV, timeoutMs: 20 });
    expect(r).toBeNull();
    expect(world.updates).toHaveLength(0);
  });

  it("leaves the finding as the apply left it when the judge fails or answers nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = mockWorld({ fail: true });
    const a = await import("@/lib/editorial/fix-check-service");
    expect(await a.checkAppliedFix({ finding: FINDING, before: "a", after: "b", env: ENV })).toBeNull();
    expect(failing.updates).toHaveLength(0);

    vi.resetModules();
    const empty = mockWorld({ answer: { type: "score", score: 2 } });
    const b = await import("@/lib/editorial/fix-check-service");
    expect(await b.checkAppliedFix({ finding: FINDING, before: "a", after: "b", env: ENV })).toBeNull();
    expect(empty.updates).toHaveLength(0);
  });
});
