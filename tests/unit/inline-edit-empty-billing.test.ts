import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-04 (inline-edit leg) + D-38: a rewrite request that yields NO usable
 * suggestions must NOT be recorded as a billed usage record and must NOT be
 * answered with a hollow 200 { suggestions: [] }. Pre-fix the route ALWAYS
 * wrote a UsageRecord and returned an empty array — the writer paid for
 * nothing with no honest signal.
 *
 * The empty result correlates with D-38: a max_tokens-truncated JSON array
 * fails to parse (→ []). Post-fix: no usage record for an empty result, and an
 * honest retryable error envelope (502) that surfaces the truncation.
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

import { POST } from "@/app/api/books/[id]/inline-edit/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown) {
  return new Request("http://t/api/books/b1/inline-edit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function reply(text: string, stop_reason = "end_turn", output_tokens = 40) {
  return {
    content: text ? [{ type: "text", text }] : [],
    stop_reason,
    usage: { input_tokens: 80, output_tokens },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", language: "en" });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "anthropic", encryptedKey: "enc" }]);
  h.db.usageRecord.create.mockResolvedValue({});
  h.checkQuota.mockResolvedValue({ allowed: true });
  h.estimateCost.mockReturnValue(0.0002);
  h.decryptApiKey.mockReturnValue("sk-test");
  h.resolveCheapModelFor.mockReturnValue({ id: "anthropic/haiku", provider: "anthropic" });
  h.resolveProviderRoute.mockReturnValue({ route: "direct" });
  h.createLLMClient.mockReturnValue({
    client: { messages: { create: h.create } },
    model: { modelId: "claude-haiku", id: "anthropic/haiku" },
  });
});

describe("POST /api/books/:id/inline-edit — empty result is not billed (D-04/D-38)", () => {
  it("bills and returns suggestions for a genuine parseable result", async () => {
    h.create.mockResolvedValueOnce(
      reply('[{"text":"A tighter line.","label":"Tighter"}]')
    );
    const res = await POST(req({ selectedText: "some prose", count: 3 }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(1);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
  });

  it("does NOT bill and returns a retryable error when the model returns an empty array", async () => {
    h.create.mockResolvedValueOnce(reply("[]"));
    const res = await POST(req({ selectedText: "some prose", count: 3 }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.retryable).toBe(true);
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("does NOT bill and surfaces truncation when the JSON is cut off (max_tokens)", async () => {
    // Truncated array — JSON.parse throws → suggestions [] pre-fix billed anyway.
    h.create.mockResolvedValueOnce(reply('[{"text":"A tighter li', "max_tokens"));
    const res = await POST(req({ selectedText: "some prose", count: 3 }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
    expect(body.error.toLowerCase()).toContain("cut off");
  });
});
