import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  wordSum: 0 as number | null,
  sessionCount: 0,
  subscription: null as null | { status: string; trialEnd: Date | null },
  usageRow: null as null | { ghostTextCalls: number; inlineEditCalls: number; polishSceneCalls?: number },
  // A database reached before `prisma db push` added free_tier_usage.polish_scene_calls.
  noPolishColumn: false,
  upsertArgs: undefined as unknown,
  countArgs: undefined as unknown,
  // Stripe configured by default so the Free-derivation tests below exercise
  // real enforcement; individual tests flip this to model a self-hosted deploy.
  stripeConfigured: true,
  // A database the new code reached before `prisma db push` added
  // free_tier_usage.agent_sessions: any read that asks for that column fails.
  oldSchema: false,
  missingColumn:
    "The column `free_tier_usage.agent_sessions` does not exist in the current database.",
}));

vi.mock("@/lib/billing/stripe-client", () => ({
  // Getter so `stripe` re-reads h.stripeConfigured on every access (ESM live
  // binding), letting a single suite toggle configured vs self-hosted.
  get stripe() {
    return h.stripeConfigured ? ({} as unknown) : null;
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    book: {
      aggregate: vi.fn(async () => ({ _sum: { wordCount: h.wordSum } })),
    },
    agentSession: {
      count: vi.fn(async (args: unknown) => {
        h.countArgs = args;
        return h.sessionCount;
      }),
    },
    subscription: { findUnique: vi.fn(async () => h.subscription) },
    freeTierUsage: {
      // P7-S13 session-start ledger: empty here, so the row count governs.
      aggregate: vi.fn(async () => {
        if (h.oldSchema) throw new Error(h.missingColumn);
        return { _sum: { agentSessions: null } };
      }),
      // Without a `select`, Prisma reads every column, agent_sessions included.
      findUnique: vi.fn(async (args: { select?: Record<string, boolean> }) => {
        if (h.oldSchema && (!args.select || args.select.agentSessions)) {
          throw new Error(h.missingColumn);
        }
        if (h.noPolishColumn && (!args.select || args.select.polishSceneCalls)) {
          throw new Error(
            "The column `free_tier_usage.polish_scene_calls` does not exist in the current database."
          );
        }
        return h.usageRow;
      }),
      upsert: vi.fn(async (args: unknown) => {
        h.upsertArgs = args;
        return {};
      }),
    },
  },
}));

import {
  sumOwnedWordCount,
  checkDailyMeter,
  recordDailyUse,
  checkConcurrencyFence,
  countRunningSessions,
  isFreeTierUser,
  getFreeTierSnapshot,
} from "@/lib/billing/free-tier-meters";
import { FREE_TIER } from "@/lib/billing/free-tier";

beforeEach(() => {
  vi.clearAllMocks();
  h.wordSum = 0;
  h.sessionCount = 0;
  h.subscription = null;
  h.usageRow = null;
  h.upsertArgs = undefined;
  h.countArgs = undefined;
  h.stripeConfigured = true;
  h.oldSchema = false;
  h.noPolishColumn = false;
  delete process.env.FREE_TIER_DISABLED;
});

describe("daily meters keep working before the agent_sessions column exists (deploy order)", () => {
  // Prod can ship before `prisma db push`. The ghost-text and inline-edit
  // meters only need their own counters, so they must not read the new column:
  // otherwise every Free ghost-text / inline-edit check throws until the push.
  it("checkDailyMeter reads only its own counters", async () => {
    h.oldSchema = true;
    h.usageRow = { ghostTextCalls: 4, inlineEditCalls: 2 };
    await expect(checkDailyMeter("u", "ghost")).resolves.toMatchObject({ used: 4, allowed: true });
    await expect(checkDailyMeter("u", "inline")).resolves.toMatchObject({ used: 2, allowed: true });
  });

  it("getFreeTierSnapshot still answers, counting sessions from the rows", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.oldSchema = true;
    h.sessionCount = 3;
    h.usageRow = { ghostTextCalls: 7, inlineEditCalls: 1 };
    const s = await getFreeTierSnapshot("u");
    expect(s).toMatchObject({ sessionsUsed: 3, ghostUsedToday: 7, inlineUsedToday: 1 });
    spy.mockRestore();
  });
});

describe("sumOwnedWordCount", () => {
  it("returns the summed word count, 0 when null", async () => {
    h.wordSum = 12_345;
    expect(await sumOwnedWordCount("u")).toBe(12_345);
    h.wordSum = null;
    expect(await sumOwnedWordCount("u")).toBe(0);
  });
});

describe("checkDailyMeter", () => {
  it("ghost: allowed under cap, remaining decremented", async () => {
    h.usageRow = { ghostTextCalls: 10, inlineEditCalls: 0 };
    const r = await checkDailyMeter("u", "ghost");
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(10);
    expect(r.limit).toBe(FREE_TIER.dailyGhostText);
    expect(r.remaining).toBe(FREE_TIER.dailyGhostText - 10);
  });

  it("inline: denied AT cap, remaining 0", async () => {
    h.usageRow = { ghostTextCalls: 0, inlineEditCalls: FREE_TIER.dailyInlineEdit };
    const r = await checkDailyMeter("u", "inline");
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("no row today → full budget", async () => {
    h.usageRow = null;
    const r = await checkDailyMeter("u", "ghost");
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(0);
    expect(r.remaining).toBe(FREE_TIER.dailyGhostText);
  });
});

describe("recordDailyUse", () => {
  it("upserts with an atomic increment on the right column", async () => {
    await recordDailyUse("u", "ghost");
    const args = h.upsertArgs as {
      update: { ghostTextCalls?: { increment: number } };
      create: { ghostTextCalls?: number };
    };
    expect(args.update.ghostTextCalls).toEqual({ increment: 1 });
    expect(args.create.ghostTextCalls).toBe(1);
  });

  it("targets inlineEditCalls for the inline meter", async () => {
    await recordDailyUse("u", "inline");
    const args = h.upsertArgs as {
      update: { inlineEditCalls?: { increment: number } };
    };
    expect(args.update.inlineEditCalls).toEqual({ increment: 1 });
  });
});

describe("checkConcurrencyFence", () => {
  it("no-op (allowed) for paid users, regardless of running sessions", async () => {
    h.subscription = { status: "active", trialEnd: null };
    h.sessionCount = 5;
    expect((await checkConcurrencyFence("u")).allowed).toBe(true);
  });

  it("denies a Free user already running a session → indie", async () => {
    h.subscription = null; // Free
    h.sessionCount = 1; // at the concurrency cap
    const r = await checkConcurrencyFence("u");
    expect(r.allowed).toBe(false);
    expect(r.upgradeToTier).toBe("indie");
    expect(r.reason).toMatch(/one AI session at a time/i);
  });

  it("allows a Free user with no running session", async () => {
    h.subscription = null;
    h.sessionCount = 0;
    expect((await checkConcurrencyFence("u")).allowed).toBe(true);
  });
});

describe("getFreeTierSnapshot", () => {
  it("assembles real numbers from rows + limits from FREE_TIER", async () => {
    h.sessionCount = 3;
    h.usageRow = { ghostTextCalls: 7, inlineEditCalls: 2 };
    h.wordSum = 5_000;
    const s = await getFreeTierSnapshot("u");
    expect(s).toEqual({
      sessionsUsed: 3,
      sessionsLimit: FREE_TIER.monthlyAgentSessions,
      ghostUsedToday: 7,
      inlineUsedToday: 2,
      aiWordsUsed: 5_000,
      aiWordsLimit: FREE_TIER.maxAiEligibleWords,
    });
  });
});

describe("isFreeTierUser (enforcement derivation)", () => {
  it("false when Stripe is unconfigured (self-hosted), even for a no-sub user", () => {
    h.stripeConfigured = false;
    expect(isFreeTierUser(null)).toBe(false);
  });

  it("false when the FREE_TIER_DISABLED rollback lever is set", () => {
    process.env.FREE_TIER_DISABLED = "1";
    expect(isFreeTierUser(null)).toBe(false);
  });

  it("true for a no-sub user on a Stripe-configured, lever-on deploy", () => {
    expect(isFreeTierUser(null)).toBe(true);
  });

  it("false for an active paid subscription", () => {
    expect(isFreeTierUser({ status: "active", trialEnd: null })).toBe(false);
  });
});

describe("Free enforcement is inert on self-hosted / lever-off deploys", () => {
  it("fence allows a Free-shaped user AT the cap when Stripe is unconfigured", async () => {
    h.stripeConfigured = false; // self-hosted: no STRIPE_SECRET_KEY
    h.subscription = null; // isFreeTier(null) would be true — must not fence
    h.sessionCount = 5; // well over the concurrency cap
    expect((await checkConcurrencyFence("u")).allowed).toBe(true);
  });

  it("fence allows a Free-shaped user AT the cap when FREE_TIER_DISABLED is set", async () => {
    process.env.FREE_TIER_DISABLED = "1";
    h.subscription = null;
    h.sessionCount = 5;
    expect((await checkConcurrencyFence("u")).allowed).toBe(true);
  });
});

describe("countRunningSessions stale bound (finding 9 — no permanent lockout)", () => {
  it("only counts running rows started within the stale ceiling", async () => {
    await countRunningSessions("u");
    const where = (
      h.countArgs as { where: { status: string; startedAt: { gte: Date } } }
    ).where;
    expect(where.status).toBe("running");
    // A crashed row older than the ceiling ages out → fence can't lock forever.
    const gte = where.startedAt.gte.getTime();
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    expect(Math.abs(gte - twoHoursAgo)).toBeLessThan(5_000);
  });
});

describe("recordDailyUse durability", () => {
  it("swallows a write failure so an already-billed response can't 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = await import("@/lib/db");
    (
      db.freeTierUsage.upsert as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("db down"));
    await expect(recordDailyUse("u", "ghost")).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("the scene-polish meter (its own daily budget)", () => {
  // A polish sends the fingerprint and the story bible twice; it costs far more
  // than an inline edit, so it draws on its own, smaller daily counter.
  it("counts polishes, not inline edits, against dailyPolishScene", async () => {
    h.usageRow = { ghostTextCalls: 0, inlineEditCalls: 0, polishSceneCalls: FREE_TIER.dailyPolishScene };
    const r = await checkDailyMeter("u", "polish");
    expect(r).toMatchObject({ allowed: false, used: FREE_TIER.dailyPolishScene, remaining: 0 });
    expect(r.limit).toBe(FREE_TIER.dailyPolishScene);
    expect(FREE_TIER.dailyPolishScene).toBeLessThan(FREE_TIER.dailyInlineEdit);
  });

  it("is not drawn down by inline edits", async () => {
    h.usageRow = { ghostTextCalls: 0, inlineEditCalls: FREE_TIER.dailyInlineEdit };
    await expect(checkDailyMeter("u", "polish")).resolves.toMatchObject({ allowed: true, used: 0 });
  });

  it("ghost and inline checks never read the polish column", async () => {
    h.noPolishColumn = true;
    h.usageRow = { ghostTextCalls: 3, inlineEditCalls: 1 };
    await expect(checkDailyMeter("u", "ghost")).resolves.toMatchObject({ used: 3 });
    await expect(checkDailyMeter("u", "inline")).resolves.toMatchObject({ used: 1 });
    await expect(getFreeTierSnapshot("u")).resolves.toMatchObject({ ghostUsedToday: 3 });
  });

  it("before the column exists, a polish is let through and the failure is logged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.noPolishColumn = true;
    await expect(checkDailyMeter("u", "polish")).resolves.toMatchObject({ allowed: true, used: 0 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("recordDailyUse targets polishSceneCalls", async () => {
    await recordDailyUse("u", "polish");
    const args = h.upsertArgs as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(args.update).toEqual({ polishSceneCalls: { increment: 1 } });
    expect(args.create.polishSceneCalls).toBe(1);
  });
});
