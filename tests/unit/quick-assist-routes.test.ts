import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-100 + D-116/D-117/D-118 — the quick-assist routes (ghost-text + inline-edit)
 * must:
 *  - resolve the cheap model through `resolveQuickAssistModelFor`, which routes
 *    AROUND the seeded reasoning default (openrouter-qwen36/* → the cheapest
 *    non-reasoning openrouter haiku, DeepSeek V3.2) so a free user's first AI
 *    taste is fast text, not 28–44s of billed-but-invisible thinking (D-117) or
 *    a 100% honest-422 dead end (D-116). The registry id actually used is what
 *    gets billed (usage record), so spend is attributed to the real model;
 *  - disable provider reasoning on the OpenRouter route, and NOT send
 *    `reasoning` on the direct Anthropic route (which rejects the unknown field);
 *  - answer an honest, non-retryable MODEL_NO_QUICK_SUGGEST 422 (not the generic
 *    "cut off" 502) when the model returns only thinking blocks — without billing
 *    a usage record — with copy scoped to the surface that failed (D-118): the
 *    ghost-text copy names autocomplete and says inline edit still works; the
 *    inline copy names inline suggestions only.
 *
 * We keep the REAL registry resolvers (`resolveQuickAssistModelFor` /
 * `resolveCheapModelFor`) and only stub the network edges (createLLMClient,
 * resolveProviderRoute) so the qwen36→deepseek re-route is exercised end-to-end.
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
  resolveProviderRoute: vi.fn(),
  createLLMClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: h.decryptApiKey }));
vi.mock("@/lib/cost", () => ({ estimateCost: h.estimateCost }));
vi.mock("@/lib/billing/quota-checker", () => ({ checkQuota: h.checkQuota }));
// Partial mock: keep the REAL registry resolvers (so qwen36 → deepseek routing
// is exercised for real) and stub only the network edges.
vi.mock("@/lib/llm", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/llm")>();
  return {
    ...actual,
    createLLMClient: h.createLLMClient,
    resolveProviderRoute: h.resolveProviderRoute,
  };
});

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

/** modelId handed to createLLMClient on the most recent call. */
function lastClientModelId(): string {
  const calls = h.createLLMClient.mock.calls;
  return calls[calls.length - 1][0].modelId as string;
}
/** UsageRecord.model written on the most recent usage-record create. */
function lastUsageModel(): string {
  const calls = h.db.usageRecord.create.mock.calls;
  return calls[calls.length - 1][0].data.model as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", language: "en" });
  // Seeded free-tier default is the qwen36 reasoning model.
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "openrouter-qwen36/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "openrouter", encryptedKey: "enc" }]);
  h.db.usageRecord.create.mockResolvedValue({});
  h.checkQuota.mockResolvedValue({ allowed: true });
  h.estimateCost.mockReturnValue(0.0001);
  h.decryptApiKey.mockReturnValue("sk-or-test");
  h.resolveProviderRoute.mockReturnValue({ route: "openrouter" });
  // Echo the resolved registry id back through both fields so the test can
  // observe which model the route actually chose (and billed).
  h.createLLMClient.mockImplementation((opts: { modelId: string }) => ({
    client: { messages: { create: h.create } },
    model: { id: opts.modelId, modelId: opts.modelId },
  }));
});

describe("ghost-text — reasoning-aware resolution + honest fallback (D-116/117/118)", () => {
  it("re-routes the qwen36 reasoning default to deepseek and bills that model", async () => {
    h.create.mockResolvedValueOnce(textReply("the tide turned."));
    const res = await ghostPOST(
      ghostReq({ context: "a".repeat(60), chapterNumber: 1 }) as never,
      ghostCtx as never
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestion).toBe("the tide turned.");
    // Escaped the reasoning model → cheapest non-reasoning openrouter haiku.
    expect(lastClientModelId()).toBe("openrouter-deepseek/haiku");
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    expect(lastUsageModel()).toBe("openrouter-deepseek/haiku");
  });

  it("disables reasoning on the OpenRouter route", async () => {
    h.create.mockResolvedValueOnce(textReply("the tide turned."));
    await ghostPOST(ghostReq({ context: "a".repeat(60), chapterNumber: 1 }) as never, ghostCtx as never);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0].reasoning).toEqual({ enabled: false });
  });

  it("does NOT send reasoning on the direct Anthropic route", async () => {
    h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
    h.resolveProviderRoute.mockReturnValue({ route: "direct" });
    h.create.mockResolvedValueOnce(textReply("the tide turned."));
    await ghostPOST(ghostReq({ context: "a".repeat(60), chapterNumber: 1 }) as never, ghostCtx as never);
    expect(lastClientModelId()).toBe("anthropic/haiku");
    expect(h.create.mock.calls[0][0].reasoning).toBeUndefined();
  });

  it("returns a ghost-scoped MODEL_NO_QUICK_SUGGEST (422, not billed) for thinking-only", async () => {
    h.create.mockResolvedValueOnce(thinkingOnly);
    const res = await ghostPOST(ghostReq({ context: "a".repeat(60), chapterNumber: 1 }) as never, ghostCtx as never);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("MODEL_NO_QUICK_SUGGEST");
    // D-118: copy names the broken surface (ghost/autocomplete) and reassures
    // that inline edit still works — it must NOT tell the writer inline is broken.
    expect(body.error).toMatch(/ghost|autocomplete/i);
    expect(body.error).toMatch(/inline edit still works/i);
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

describe("inline-edit — reasoning-aware resolution + honest fallback (D-116/117/118)", () => {
  it("re-routes the qwen36 reasoning default to deepseek and bills that model", async () => {
    h.create.mockResolvedValueOnce(textReply('[{"text":"A tighter line.","label":"Tighter"}]'));
    const res = await inlinePOST(inlineReq({ selectedText: "some prose", count: 3 }) as never, ghostCtx as never);
    expect(res.status).toBe(200);
    expect(lastClientModelId()).toBe("openrouter-deepseek/haiku");
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    expect(lastUsageModel()).toBe("openrouter-deepseek/haiku");
  });

  it("disables reasoning on the OpenRouter route", async () => {
    h.create.mockResolvedValueOnce(textReply('[{"text":"A tighter line.","label":"Tighter"}]'));
    await inlinePOST(inlineReq({ selectedText: "some prose", count: 3 }) as never, ghostCtx as never);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0].reasoning).toEqual({ enabled: false });
  });

  it("returns an inline-scoped MODEL_NO_QUICK_SUGGEST (422, not billed) for thinking-only", async () => {
    h.create.mockResolvedValueOnce(thinkingOnly);
    const res = await inlinePOST(inlineReq({ selectedText: "some prose", count: 3 }) as never, ghostCtx as never);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("MODEL_NO_QUICK_SUGGEST");
    // D-118: inline copy is scoped to inline suggestions only — never blames ghost.
    expect(body.error).toMatch(/inline/i);
    expect(body.error).not.toMatch(/ghost|autocomplete/i);
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });
});

describe("discuss builder is NOT touched by the quick-assist fix (D-100 scope guard)", () => {
  it("runDiscussTurn never attaches reasoning to its request", async () => {
    h.create.mockResolvedValueOnce({
      content: [{ type: "text", text: "Keep the em dash." }],
      stop_reason: "end_turn",
    });
    await runDiscussTurn({ system: "s", user: "u", userId: "u1", bookId: "b1" });
    expect(h.create).toHaveBeenCalled();
    expect(h.create.mock.calls[0][0].reasoning).toBeUndefined();
  });
});
