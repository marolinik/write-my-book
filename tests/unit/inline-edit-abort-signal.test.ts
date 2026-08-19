import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-142 (inline-edit leg) — the route now threads req.signal + a bounded
 * timeout into client.messages.create, and a typing-resumed / navigation abort
 * (AbortError, or an already-aborted req.signal) returns 499 UNBILLED instead
 * of completing server-side and writing a usage_record for a suggestion no one
 * will ever see. A genuine result additionally carries elapsedMs + Server-Timing.
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
  recordDailyUse: vi.fn(),
  resolveQuickAssistModelFor: vi.fn(),
  resolveProviderRoute: vi.fn(),
  createLLMClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: h.decryptApiKey }));
vi.mock("@/lib/cost", () => ({ estimateCost: h.estimateCost }));
vi.mock("@/lib/billing/quota-checker", () => ({ checkQuota: h.checkQuota }));
vi.mock("@/lib/billing/free-tier-meters", () => ({
  recordDailyUse: h.recordDailyUse,
}));
vi.mock("@/lib/llm", () => ({
  createLLMClient: h.createLLMClient,
  resolveProviderRoute: h.resolveProviderRoute,
  resolveQuickAssistModelFor: h.resolveQuickAssistModelFor,
}));

import { POST } from "@/app/api/books/[id]/inline-edit/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown) {
  return new Request("http://t/api/books/b1/inline-edit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
function reply(text: string, stop_reason = "end_turn") {
  return {
    content: [{ type: "text", text }],
    stop_reason,
    usage: { input_tokens: 80, output_tokens: 40 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", language: "en" });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "anthropic", encryptedKey: "enc" }]);
  h.db.usageRecord.create.mockResolvedValue({});
  h.checkQuota.mockResolvedValue({ allowed: true, isFree: true });
  h.estimateCost.mockReturnValue(0.0002);
  h.decryptApiKey.mockReturnValue("sk-test");
  h.recordDailyUse.mockResolvedValue(undefined);
  h.resolveQuickAssistModelFor.mockReturnValue({ id: "anthropic/haiku", provider: "anthropic" });
  h.resolveProviderRoute.mockReturnValue({ route: "direct" });
  h.createLLMClient.mockReturnValue({
    client: { messages: { create: h.create } },
    model: { modelId: "claude-haiku", id: "anthropic/haiku" },
  });
});

describe("POST /api/books/:id/inline-edit — abort is unbilled (D-142)", () => {
  it("returns 499 and does NOT bill when the provider call aborts", async () => {
    h.create.mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
    );
    const res = await POST(req({ selectedText: "some prose", count: 3 }) as never, ctx as never);
    expect(res.status).toBe(499);
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
    expect(h.recordDailyUse).not.toHaveBeenCalled();
  });

  it("threads a signal + timeout into client.messages.create", async () => {
    h.create.mockResolvedValueOnce(
      reply('[{"text":"A tighter line.","label":"Tighter"}]')
    );
    await POST(req({ selectedText: "some prose", count: 3 }) as never, ctx as never);
    expect(h.create).toHaveBeenCalledTimes(1);
    const opts = h.create.mock.calls[0][1];
    expect(opts).toBeDefined();
    expect(opts.signal).toBeDefined();
    expect(typeof opts.timeout).toBe("number");
  });

  it("adds elapsedMs + Server-Timing to a genuine result", async () => {
    h.create.mockResolvedValueOnce(
      reply('[{"text":"A tighter line.","label":"Tighter"}]')
    );
    const res = await POST(req({ selectedText: "some prose", count: 3 }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.elapsedMs).toBe("number");
    expect(res.headers.get("Server-Timing")).toMatch(/llm;dur=/);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
  });
});
