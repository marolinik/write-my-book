import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-100 — the quick-assist routes (ghost-text + inline-edit) must:
 *  - disable provider reasoning on the OpenRouter route (where the seeded
 *    free-tier default qwen/qwen3.6-27b routes), and NOT send `reasoning` on
 *    the direct Anthropic route (which would reject the unknown field);
 *  - answer an honest, non-retryable MODEL_NO_QUICK_SUGGEST error (not the
 *    generic infinitely-retryable "cut off" 502) when the model returns only
 *    thinking blocks — without billing a usage record;
 *  - still use the text when thinking+text are mixed.
 *
 * The discuss builder MUST remain untouched (no `reasoning`) — regression guard.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  create: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    apiKey: { findMany: vi.fn() },
    usageRecord: { create: vi.fn() },
  },
  checkQuota: vi.fn(),
  estimateCost: vi.fn(),
  decryptApiKey: vi.fn(),
  resolveCheapModelFor: vi.fn(),
  resolveProviderRoute: vi.fn(),
  createLLMClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: h.decryptApiKey }));
vi.mock("@/lib/cost", () => ({ estimateCost: h.estimateCost }));
vi.mock("@/lib/billing/quota-checker", () => ({ checkQuota: h.checkQuota }));
vi.mock("@/lib/llm", () => ({
  createLLMClient: h.createLLMClient,
  resolveProviderRoute: h.resolveProviderRoute,
  resolveCheapModelFor: h.resolveCheapModelFor,
}));

import { POST as ghostPOST } from "@/app/api/books/[id]/ghost-text/route";
import { POST as inlinePOST } from "@/app/api/books/[id]/inline-edit/route";
import { runDiscussTurn } from "@/lib/editorial/discuss-llm";

const ghostCtx = { params: Promise.resolve({ id: "b1" }) };
function ghostReq(body: unknown) {
  return new Request("http://t/api/books/b1/ghost-text", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
function inlineReq(body: unknown) {
  return new Request("http://t/api/books/b1/inline-edit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const textReply = (text: string, stop_reason = "end_turn") => ({
  content: [{ type: "text", text }],
  stop_reason,
  usage: { input_tokens: 20, output_tokens: 5 },
});
const thinkingOnly = {
  content: [{ type: "thinking" }, { type: "redacted_thinking" }],
  stop_reason: "max_tokens",
  usage: { input_tokens: 49, output_tokens: 60 },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", language: "en" });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "openrouter-qwen36/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "openrouter", encryptedKey: "enc" }]);
  h.db.usageRecord.create.mockResolvedValue({});
  h.checkQuota.mockResolvedValue({ allowed: true });
  h.estimateCost.mockReturnValue(0.0001);
  h.decryptApiKey.mockReturnValue("sk-or-test");
  h.resolveCheapModelFor.mockReturnValue({ id: "openrouter-qwen36/haiku", provider: "openrouter" });
  h.resolveProviderRoute.mockReturnValue({ route: "openrouter" });
  h.createLLMClient.mockReturnValue({
    client: { messages: { create: h.create } },
    model: { modelId: "qwen/qwen3.6-27b", id: "openrouter-qwen36/haiku" },
  });
});

describe("ghost-text — reasoning-disable + honest fallback (D-100)", () => {
  it("disables reasoning on the OpenRouter route", async () => {
    h.create.mockResolvedValueOnce(textReply("the tide turned."));
    await ghostPOST(ghostReq({ context: "a".repeat(60), chapterNumber: 1 }) as never, ghostCtx as never);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0].reasoning).toEqual({ enabled: false });
  });

  it("does NOT send reasoning on the direct Anthropic route", async () => {
    h.resolveProviderRoute.mockReturnValue({ route: "direct" });
    h.create.mockResolvedValueOnce(textReply("the tide turned."));
    await ghostPOST(ghostReq({ context: "a".repeat(60), chapterNumber: 1 }) as never, ghostCtx as never);
    expect(h.create.mock.calls[0][0].reasoning).toBeUndefined();
  });

  it("returns MODEL_NO_QUICK_SUGGEST (422, not billed) for a thinking-only response", async () => {
    h.create.mockResolvedValueOnce(thinkingOnly);
    const res = await ghostPOST(ghostReq({ context: "a".repeat(60), chapterNumber: 1 }) as never, ghostCtx as never);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("MODEL_NO_QUICK_SUGGEST");
    expect(typeof body.error).toBe("string");
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("uses the text (and bills) when thinking+text are mixed", async () => {
    h.create.mockResolvedValueOnce({
      content: [{ type: "thinking" }, { type: "text", text: "the tide turned." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 20, output_tokens: 5 },
    });
    const res = await ghostPOST(ghostReq({ context: "a".repeat(60), chapterNumber: 1 }) as never, ghostCtx as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestion).toBe("the tide turned.");
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
  });
});

describe("inline-edit — reasoning-disable + honest fallback (D-100)", () => {
  it("disables reasoning on the OpenRouter route", async () => {
    h.create.mockResolvedValueOnce(textReply('[{"text":"A tighter line.","label":"Tighter"}]'));
    await inlinePOST(inlineReq({ selectedText: "some prose", count: 3 }) as never, ghostCtx as never);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0].reasoning).toEqual({ enabled: false });
  });

  it("returns MODEL_NO_QUICK_SUGGEST (422, not billed) for a thinking-only response", async () => {
    h.create.mockResolvedValueOnce(thinkingOnly);
    const res = await inlinePOST(inlineReq({ selectedText: "some prose", count: 3 }) as never, ghostCtx as never);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("MODEL_NO_QUICK_SUGGEST");
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });
});

describe("discuss builder is NOT touched by the quick-assist fix (D-100 scope guard)", () => {
  it("runDiscussTurn never attaches reasoning to its request", async () => {
    h.create.mockResolvedValueOnce({
      content: [{ type: "text", text: "Keep the em dash." }],
      stop_reason: "end_turn",
    });
    await runDiscussTurn({ system: "s", user: "u", userId: "u1" });
    expect(h.create).toHaveBeenCalled();
    expect(h.create.mock.calls[0][0].reasoning).toBeUndefined();
  });
});
