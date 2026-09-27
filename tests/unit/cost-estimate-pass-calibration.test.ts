import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P2-S06 — "Based on this book's last {n} runs of this pass" never appeared
 * for a specialist pass, and appeared for passes the book had never run.
 *
 * The estimate read UsageRecords filed under `workflow.primaryAgent`
 * ("dev-editor", "line-editor", ...), but both places that write a finished
 * session's row filed it under "writing-coach" — the conductor of every
 * session. So dev-edit / line-edit / beta-read never calibrated, and every
 * coach-led pass pooled the costs of every other session type.
 *
 * The contract: a finished session's row is filed under its pass (the
 * workflow id), and the estimate reads that same key.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    usageRecord: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/llm", () => ({
  resolveModelForRole: () => ({
    registryId: "anthropic/sonnet",
    modelDef: { displayName: "Sonnet", tier: "sonnet" },
    resolvedFrom: "user-default",
  }),
  meetsMinimumTier: () => true,
  mapAgentTypeToRole: () => "editor",
}));

import { GET } from "@/app/api/books/[id]/cost-estimate/route";
import { passUsageType } from "@/lib/llm/cost-calibration";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(workflowId: string) {
  const url = new URL(`http://t/api/books/b1/cost-estimate?workflowId=${workflowId}`);
  return { nextUrl: url } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1", defaultModel: "anthropic/sonnet" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", settings: null });
  h.db.usageRecord.findMany.mockResolvedValue([]);
});

describe("GET /api/books/:id/cost-estimate — calibrates per pass (P2-S06)", () => {
  it("files a pass's usage under the workflow id, not the agent that conducts it", () => {
    expect(passUsageType("dev-edit")).toBe("dev-edit");
    expect(passUsageType("discuss-chapter")).toBe("discuss-chapter");
  });

  it("reads the dev-edit pass's own runs, not the dev-editor agent's", async () => {
    await GET(req("dev-edit"), ctx as never);
    expect(h.db.usageRecord.findMany).toHaveBeenCalledTimes(1);
    const where = h.db.usageRecord.findMany.mock.calls[0][0].where;
    expect(where.agentType).toBe("dev-edit");
    expect(where.bookId).toBe("b1");
    expect(where.billed).toBe(true);
  });

  it("does not pool one coach-led pass with another", async () => {
    await GET(req("discuss-edits"), ctx as never);
    const where = h.db.usageRecord.findMany.mock.calls[0][0].where;
    expect(where.agentType).toBe("discuss-edits");
    expect(where.agentType).not.toBe("writing-coach");
  });

  it("says how many runs of this pass it is speaking from", async () => {
    h.db.usageRecord.findMany.mockResolvedValue(
      [0.05, 0.06, 0.07, 0.08, 0.09].map((costEstimate) => ({ costEstimate }))
    );
    const res = await GET(req("dev-edit"), ctx as never);
    const body = await res.json();
    expect(body.costEstimate.basedOnRuns).toBe(5);
  });
});
