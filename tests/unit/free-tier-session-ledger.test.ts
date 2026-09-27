import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P7-S13 — the Free monthly session cap reset when the writer deleted a book.
 *
 * `countAgentSessionsThisMonth` counted AgentSession rows, and those rows
 * cascade with their book: 20 sessions, delete the book, and the meter read 0
 * again. The count must not depend on the book still existing, so session
 * starts are also written to a ledger keyed on the USER (FreeTierUsage), and
 * the meter reads the larger of the two.
 */

const h = vi.hoisted(() => ({
  rowCount: 0,
  ledgerSum: null as number | null,
  ledgerFails: false,
  aggregateArgs: undefined as unknown,
  upsertArgs: undefined as unknown,
  upsertFails: false,
}));

vi.mock("@/lib/billing/stripe-client", () => ({ stripe: {} }));

vi.mock("@/lib/db", () => ({
  db: {
    agentSession: { count: vi.fn(async () => h.rowCount) },
    freeTierUsage: {
      aggregate: vi.fn(async (args: unknown) => {
        h.aggregateArgs = args;
        if (h.ledgerFails) throw new Error("column does not exist");
        return { _sum: { agentSessions: h.ledgerSum } };
      }),
      upsert: vi.fn(async (args: unknown) => {
        h.upsertArgs = args;
        if (h.upsertFails) throw new Error("db down");
        return {};
      }),
    },
  },
}));

import {
  countAgentSessionsThisMonth,
  recordAgentSessionStart,
} from "@/lib/billing/free-tier-meters";
import { utcDayKey, utcMonthStart } from "@/lib/billing/free-tier";

beforeEach(() => {
  vi.clearAllMocks();
  h.rowCount = 0;
  h.ledgerSum = null;
  h.ledgerFails = false;
  h.aggregateArgs = undefined;
  h.upsertArgs = undefined;
  h.upsertFails = false;
});

describe("countAgentSessionsThisMonth — survives a deleted book", () => {
  it("keeps counting sessions whose rows were cascaded away with their book", async () => {
    // 20 sessions started this month, then the only book was deleted.
    h.rowCount = 0;
    h.ledgerSum = 20;
    expect(await countAgentSessionsThisMonth("u1")).toBe(20);
  });

  it("reads only this UTC month's ledger rows for this user", async () => {
    h.ledgerSum = 3;
    await countAgentSessionsThisMonth("u1");
    const args = h.aggregateArgs as {
      where: { userId: string; day: { gte: string } };
      _sum: Record<string, boolean>;
    };
    expect(args.where.userId).toBe("u1");
    expect(args.where.day.gte).toBe(utcDayKey(utcMonthStart()));
    expect(args._sum).toEqual({ agentSessions: true });
  });

  it("still counts rows the ledger never saw (sessions from before it shipped)", async () => {
    h.rowCount = 12;
    h.ledgerSum = 4;
    expect(await countAgentSessionsThisMonth("u1")).toBe(12);
  });

  it("falls back to the rows (never to zero) when the ledger cannot be read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.rowCount = 7;
    h.ledgerFails = true;
    expect(await countAgentSessionsThisMonth("u1")).toBe(7);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("recordAgentSessionStart", () => {
  it("increments today's per-user ledger row atomically", async () => {
    await recordAgentSessionStart("u1");
    const args = h.upsertArgs as {
      where: { userId_day: { userId: string; day: string } };
      update: { agentSessions: { increment: number } };
      create: { userId: string; day: string; agentSessions: number };
    };
    expect(args.where.userId_day).toEqual({ userId: "u1", day: utcDayKey() });
    expect(args.update.agentSessions).toEqual({ increment: 1 });
    expect(args.create).toEqual({ userId: "u1", day: utcDayKey(), agentSessions: 1 });
  });

  it("never throws into a session that has already started", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.upsertFails = true;
    await expect(recordAgentSessionStart("u1")).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
