import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D5 — the ghost-text route's first-text-gate SSE path end to end:
 *  (a) success → 200 text/event-stream, decoded frames = token…+done with the
 *      canonical text, usage_record written once with the registry id +
 *      final.usage, free meter advanced once iff isFree, zero when paid;
 *  (b) reasoning-only → 422 MODEL_NO_QUICK_SUGGEST, unbilled;
 *  (c) cut-off/empty → 502 retryable, unbilled;
 *  (d) checkQuota !allowed → 429, stream() never constructed;
 *  (e) route === "none" → 400;
 *  (f) abort before first token → 499, unbilled, mstream.abort() called;
 *  (g) abort after first delta → unbilled, no meter tick;
 *  (h) stream() rejects at connect → falls back to create(), identical billing.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  create: vi.fn(),
  stream: vi.fn(),
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

import { POST } from "@/app/api/books/[id]/ghost-text/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown, signal?: AbortSignal) {
  return new Request("http://t/api/books/b1/ghost-text", {
    method: "POST",
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}
function warmupReq() {
  return new Request("http://t/api/books/b1/ghost-text?warmup=1", {
    method: "POST",
    body: "{}",
  });
}

interface FakeFinal {
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function fakeStream(deltas: string[], final: FakeFinal, finalGate?: Promise<void>) {
  async function* gen() {
    for (const text of deltas) {
      yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
    }
  }
  return {
    abort: vi.fn(),
    [Symbol.asyncIterator]: () => gen(),
    finalMessage: async () => {
      if (finalGate) await finalGate;
      return final;
    },
  };
}
const okFinal = (text: string): FakeFinal => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 40, output_tokens: 8 },
});
async function readSse(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value as Uint8Array, { stream: true });
  }
  return out
    .split("\n\n")
    .map((r) => r.trim())
    .filter((r) => r.startsWith("data:"))
    .map((r) => JSON.parse(r.slice("data:".length).trim()));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", language: "en" });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "anthropic", encryptedKey: "enc" }]);
  h.db.usageRecord.create.mockResolvedValue({});
  h.checkQuota.mockResolvedValue({ allowed: true, isFree: true });
  h.estimateCost.mockReturnValue(0.0001);
  h.decryptApiKey.mockReturnValue("sk-test");
  h.recordDailyUse.mockResolvedValue(undefined);
  h.resolveQuickAssistModelFor.mockReturnValue({ id: "anthropic/haiku", provider: "anthropic" });
  h.resolveProviderRoute.mockReturnValue({ route: "direct" });
  h.createLLMClient.mockReturnValue({
    client: { messages: { create: h.create, stream: h.stream } },
    model: { modelId: "claude-haiku", id: "anthropic/haiku" },
  });
});

describe("ghost-text route — first-text-gate SSE (D5)", () => {
  it("(a) streams token…done, bills once, advances the free meter (isFree)", async () => {
    h.stream.mockReturnValueOnce(
      fakeStream(["The ", "tide turned."], okFinal("The tide turned."))
    );
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("Server-Timing")).toMatch(/ttft;dur=/);
    const frames = await readSse(res);
    expect(frames.filter((f) => f.type === "token").length).toBeGreaterThan(0);
    const done = frames.find((f) => f.type === "done");
    expect(done?.text).toBe("The tide turned.");
    expect(typeof done?.elapsedMs).toBe("number");
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    expect(h.db.usageRecord.create.mock.calls[0][0].data.model).toBe("anthropic/haiku");
    expect(h.db.usageRecord.create.mock.calls[0][0].data.tokensInput).toBe(40);
    expect(h.recordDailyUse).toHaveBeenCalledTimes(1);
    expect(h.recordDailyUse).toHaveBeenCalledWith("u1", "ghost");
  });

  it("(a') does NOT advance the free meter for a paid user", async () => {
    h.checkQuota.mockResolvedValue({ allowed: true, isFree: false });
    h.stream.mockReturnValueOnce(fakeStream(["kept."], okFinal("kept.")));
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    await readSse(res);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    expect(h.recordDailyUse).not.toHaveBeenCalled();
  });

  it("(b) reasoning-only ends → 422 MODEL_NO_QUICK_SUGGEST, unbilled", async () => {
    h.stream.mockReturnValueOnce(
      fakeStream([], {
        content: [{ type: "thinking" }],
        stop_reason: "max_tokens",
        usage: { input_tokens: 40, output_tokens: 60 },
      })
    );
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("MODEL_NO_QUICK_SUGGEST");
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("(c) cut-off/empty end → 502 retryable, unbilled", async () => {
    h.stream.mockReturnValueOnce(
      fakeStream([], {
        content: [],
        stop_reason: "max_tokens",
        usage: { input_tokens: 40, output_tokens: 60 },
      })
    );
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.retryable).toBe(true);
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("(d) checkQuota !allowed → 429, stream() never constructed", async () => {
    h.checkQuota.mockResolvedValue({
      allowed: false,
      reason: "Free plan cap reached.",
      upgradeToTier: "indie",
      remainingToday: 0,
    });
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    expect(res.status).toBe(429);
    expect(h.stream).not.toHaveBeenCalled();
  });

  it("(e) route === 'none' → 400, stream() never constructed", async () => {
    h.resolveProviderRoute.mockReturnValue({ route: "none", error: "no key" });
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    expect(res.status).toBe(400);
    expect(h.stream).not.toHaveBeenCalled();
  });

  it("(f) abort before first token → 499, unbilled, mstream.abort() called", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const fake = fakeStream(["never"], okFinal("never"));
    h.stream.mockReturnValueOnce(fake);
    const res = await POST(
      req({ context: "a".repeat(60), chapterNumber: 1 }, ctl.signal) as never,
      ctx as never
    );
    expect(res.status).toBe(499);
    expect(fake.abort).toHaveBeenCalled();
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
    expect(h.recordDailyUse).not.toHaveBeenCalled();
  });

  it("(g) abort after first delta → unbilled, no meter tick", async () => {
    const ctl = new AbortController();
    const gate = deferred<void>();
    h.stream.mockReturnValueOnce(fakeStream(["partial"], okFinal("partial full"), gate.promise));
    const res = await POST(
      req({ context: "a".repeat(60), chapterNumber: 1 }, ctl.signal) as never,
      ctx as never
    );
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await reader.read(); // first token frame
    ctl.abort(); // client resumes typing mid-stream
    gate.resolve(); // finalMessage settles after the abort
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
    expect(h.recordDailyUse).not.toHaveBeenCalled();
  });

  it("(warmup) ?warmup=1 → 200 {warmed:true}, no LLM, no quota, no bill", async () => {
    const res = await POST(warmupReq() as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.warmed).toBe(true);
    expect(h.checkQuota).not.toHaveBeenCalled();
    expect(h.stream).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("(h) stream() rejects at connect → falls back to create(), identical billing", async () => {
    h.stream.mockImplementationOnce(() => {
      throw new Error("stream unsupported on this route");
    });
    h.create.mockResolvedValueOnce(okFinal("fallback continuation."));
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestion).toBe("fallback continuation.");
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    expect(h.recordDailyUse).toHaveBeenCalledTimes(1);
  });
});
