import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-172 (S2, live-observed 2026-07-27): a discuss turn is a real BYOK charge
 * against the writer's own provider key, and it wrote NOTHING to
 * `usage_records`. Confirmed live: a 24.3 s discuss turn at 23:26 left the
 * newest usage row at 21:28 (a prior session's coach call). Every other AI
 * surface bills — ghost-text and inline-edit both write a usage record at
 * settle — so the spend panel silently under-reported the writer's real spend:
 * the concrete mechanism behind the D-44 / D-119 "usage panel is a dishonest
 * health surface" family.
 *
 * Fix shape (bill-at-settle, mirroring quick-assist): record ONE usage row when
 * — and only when — the turn actually produced usable text for the writer,
 * carrying the registry model id (D-44) and the tokens the provider reported
 * across every attempt made.
 */

const h = vi.hoisted(() => ({
  create: vi.fn(),
  db: {
    apiKey: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    usageRecord: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: (k: string) => `dec:${k}` }));
// Keep the REAL registry (estimateCost resolves prices through @/lib/llm), and
// override only the two seams this test drives.
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  createLLMClient: () => ({
    client: { messages: { create: h.create } },
    // Registry id vs provider id — the usage row must carry the REGISTRY id
    // (D-44), never the raw provider model string.
    model: { id: "openrouter-qwen36/haiku", modelId: "qwen/qwen3.6-27b" },
    effectiveModelId: "qwen/qwen3.6-27b",
  }),
  resolveCheapModelFor: () => ({ id: "openrouter-qwen36/haiku" }),
}));

import { runDiscussTurn, DiscussLLMEmptyError } from "@/lib/editorial/discuss-llm";

const args = { system: "s", user: "u", userId: "u1", bookId: "b1" };

const reply = (
  text: string,
  usage: { input_tokens: number; output_tokens: number } | undefined,
  stop = "end_turn"
) => ({ content: [{ type: "text", text }], stop_reason: stop, usage });

/** Whole budget went to reasoning — no text block, but tokens were still spent. */
const reasoningOnly = {
  content: [{ type: "thinking", thinking: "…endless deliberation…" }],
  stop_reason: "max_tokens",
  usage: { input_tokens: 700, output_tokens: 2500 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "openrouter", encryptedKey: "ek" }]);
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "openrouter-qwen36/sonnet" });
  h.db.usageRecord.create.mockResolvedValue({});
});

describe("D-172 — discuss turns write an honest usage record", () => {
  it("records ONE usage row for a delivered turn, with the registry model id and real tokens", async () => {
    h.create.mockResolvedValueOnce(
      reply("Understood — I'll leave it.", { input_tokens: 1200, output_tokens: 180 })
    );

    await expect(runDiscussTurn(args)).resolves.toContain("Understood");

    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    const data = h.db.usageRecord.create.mock.calls[0][0].data;
    expect(data.userId).toBe("u1");
    expect(data.bookId).toBe("b1");
    expect(data.agentType).toBe("discuss");
    expect(data.model).toBe("openrouter-qwen36/haiku"); // D-44: registry id
    expect(data.tokensInput).toBe(1200);
    expect(data.tokensOutput).toBe(180);
    // 1200 in @ $0.285/1M + 180 out @ $2.40/1M
    expect(data.costEstimate).toBeCloseTo(1200 * 0.285e-6 + 180 * 2.4e-6, 12);
    expect(data.costEstimate).toBeGreaterThan(0);
  });

  it("bills the tokens of BOTH attempts when the doubled-budget retry is what lands", async () => {
    h.create
      .mockResolvedValueOnce(reasoningOnly) // 700 in / 2500 out, really charged
      .mockResolvedValueOnce(reply("Second attempt lands.", { input_tokens: 700, output_tokens: 220 }));

    await expect(runDiscussTurn(args)).resolves.toBe("Second attempt lands.");

    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    const data = h.db.usageRecord.create.mock.calls[0][0].data;
    expect(data.tokensInput).toBe(1400);
    expect(data.tokensOutput).toBe(2720);
  });

  it("writes NO usage row when the turn produced nothing usable (D-04: unusable is not billable)", async () => {
    h.create.mockResolvedValue(reasoningOnly);

    await expect(runDiscussTurn(args)).rejects.toBeInstanceOf(DiscussLLMEmptyError);

    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("never costs the writer their turn when the billing write fails — logs, still returns the text", async () => {
    h.create.mockResolvedValueOnce(reply("Kept as written.", { input_tokens: 10, output_tokens: 5 }));
    h.db.usageRecord.create.mockRejectedValue(new Error("db down"));

    await expect(runDiscussTurn(args)).resolves.toBe("Kept as written.");

    expect(console.error).toHaveBeenCalled();
  });

  it("still records the call (and warns) when the provider reports no usage at all", async () => {
    h.create.mockResolvedValueOnce(reply("Fine.", undefined));

    await expect(runDiscussTurn(args)).resolves.toBe("Fine.");

    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    const data = h.db.usageRecord.create.mock.calls[0][0].data;
    expect(data.tokensInput).toBe(0);
    expect(data.tokensOutput).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });
});
