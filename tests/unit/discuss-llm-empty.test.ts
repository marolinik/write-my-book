import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-04 regression lock: reasoning models (qwen via OpenRouter) can burn the
 * whole max_tokens budget on thinking blocks and return NO text block at all.
 * Pre-fix runDiscussTurn returned "" — the route then answered 200 with an
 * empty assistantMessage and no REMEMBER block, silently consuming a turn and
 * killing the discuss→memory→honored loop. Post-fix: retry ONCE with a doubled
 * budget when the empty response stopped on max_tokens, and THROW a typed
 * DiscussLLMEmptyError when still empty — never return "".
 */

const h = vi.hoisted(() => ({
  create: vi.fn(),
  db: {
    apiKey: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    // D-172: a delivered turn now writes a usage record at settle.
    usageRecord: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: (k: string) => `dec:${k}` }));
// Real registry kept (the settle-time cost estimate resolves through it).
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  createLLMClient: () => ({
    client: { messages: { create: h.create } },
    model: { id: "openrouter-qwen36/haiku", modelId: "qwen/qwen3-vl-235b" },
    effectiveModelId: "qwen/qwen3-vl-235b",
  }),
  resolveCheapModelFor: () => ({ id: "openrouter-qwen36/haiku" }),
}));

import { runDiscussTurn, DiscussLLMEmptyError } from "@/lib/editorial/discuss-llm";

const args = { system: "s", user: "u", userId: "u1", bookId: "b1" };

/** A response whose entire budget went to reasoning — no text block. */
const reasoningOnly = {
  content: [{ type: "thinking", thinking: "…endless deliberation…" }],
  stop_reason: "max_tokens",
};
const textReply = (text: string, stop = "end_turn") => ({
  content: [{ type: "text", text }],
  stop_reason: stop,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "openrouter", encryptedKey: "ek" }]);
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "openrouter/qwen" });
});

describe("runDiscussTurn empty→retry→throw (D-04)", () => {
  it("returns the text on a normal reply without retrying", async () => {
    h.create.mockResolvedValueOnce(textReply("Keep the em dash."));
    await expect(runDiscussTurn(args)).resolves.toBe("Keep the em dash.");
    expect(h.create).toHaveBeenCalledTimes(1);
    // Budget must survive reasoning blocks — the old 700 was fully consumed.
    expect(h.create.mock.calls[0][0].max_tokens).toBe(2500);
  });

  it("retries ONCE with a doubled budget when reasoning ate the whole budget", async () => {
    h.create
      .mockResolvedValueOnce(reasoningOnly)
      .mockResolvedValueOnce(textReply("Second attempt lands."));
    await expect(runDiscussTurn(args)).resolves.toBe("Second attempt lands.");
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.create.mock.calls[1][0].max_tokens).toBe(
      h.create.mock.calls[0][0].max_tokens * 2
    );
  });

  it("throws DiscussLLMEmptyError when the retry is still empty — never returns ''", async () => {
    h.create.mockResolvedValue(reasoningOnly);
    await expect(runDiscussTurn(args)).rejects.toBeInstanceOf(DiscussLLMEmptyError);
    expect(h.create).toHaveBeenCalledTimes(2);
  });

  it("treats a whitespace-only text block as empty", async () => {
    h.create.mockResolvedValue(textReply("   \n", "max_tokens"));
    await expect(runDiscussTurn(args)).rejects.toBeInstanceOf(DiscussLLMEmptyError);
    expect(h.create).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry when the empty response stopped for a reason other than max_tokens", async () => {
    h.create.mockResolvedValueOnce({ content: [], stop_reason: "end_turn" });
    await expect(runDiscussTurn(args)).rejects.toBeInstanceOf(DiscussLLMEmptyError);
    expect(h.create).toHaveBeenCalledTimes(1);
  });
});
