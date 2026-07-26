import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-04 (ghost-text leg) + D-38: an empty / whitespace-only inline suggestion
 * must NOT be recorded as a billed usage record and must NOT be answered with a
 * hollow 200. Pre-fix the route ALWAYS wrote a UsageRecord and returned
 * { suggestion: "" } — the writer paid for silence with no honest signal.
 *
 * Root cause overlaps D-38: the tiny max_tokens budget (60) can be fully
 * consumed (e.g. a reasoning model emitting only thinking blocks, stop_reason
 * "max_tokens") leaving no text block at all. Post-fix: no usage record for an
 * empty result, and an honest retryable error envelope (502) — surfacing the
 * truncation when the provider signals finish-reason=length.
 *
 * D5 (spec §11): these invariants now run through the STREAMING first-text
 * gate — a settled non-empty stream bills exactly once (canonical `done`
 * frame), and a stream that ends with no usable text answers the historical
 * 422/502 JSON BEFORE any byte flushes, still unbilled.
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
  resolveQuickAssistModelFor: vi.fn(),
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
  resolveQuickAssistModelFor: h.resolveQuickAssistModelFor,
}));

import { POST } from "@/app/api/books/[id]/ghost-text/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown) {
  return new Request("http://t/api/books/b1/ghost-text", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// A fake SDK MessageStream: async-iterable of scripted text deltas +
// finalMessage(). The gate obtains one iterator and continues it into `rest`.
function fakeStream(deltas: string[], final: {
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}) {
  async function* gen() {
    for (const text of deltas) {
      yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
    }
  }
  return {
    abort: vi.fn(),
    [Symbol.asyncIterator]: () => gen(),
    finalMessage: async () => final,
  };
}

/** A normal Anthropic-shaped final message with the given text + stop reason. */
function finalOf(text: string, stop_reason = "end_turn", output_tokens = 8) {
  return {
    content: text ? [{ type: "text", text }] : [],
    stop_reason,
    usage: { input_tokens: 40, output_tokens },
  };
}

/** A response whose whole 60-token budget went to reasoning — no text block. */
const reasoningOnly = {
  content: [{ type: "thinking", thinking: "…deliberation…" }],
  stop_reason: "max_tokens",
  usage: { input_tokens: 40, output_tokens: 60 },
};

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
  h.checkQuota.mockResolvedValue({ allowed: true });
  h.estimateCost.mockReturnValue(0.0001);
  h.decryptApiKey.mockReturnValue("sk-test");
  h.resolveQuickAssistModelFor.mockReturnValue({ id: "anthropic/haiku", provider: "anthropic" });
  h.resolveProviderRoute.mockReturnValue({ route: "direct" });
  h.createLLMClient.mockReturnValue({
    client: { messages: { create: h.create, stream: h.stream } },
    model: { modelId: "claude-haiku", id: "anthropic/haiku" },
  });
});

describe("POST /api/books/:id/ghost-text — empty result is not billed (D-04/D-38, gated D5)", () => {
  it("bills once and streams a canonical done frame for a genuine continuation", async () => {
    h.stream.mockReturnValueOnce(
      fakeStream(["the wind ", "rose off the water."], finalOf("the wind rose off the water."))
    );
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const frames = await readSse(res);
    const done = frames.find((f) => f.type === "done");
    expect(done?.text).toBe("the wind rose off the water.");
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
  });

  it("does NOT bill and returns a retryable 502 for a whitespace-only reply", async () => {
    h.stream.mockReturnValueOnce(fakeStream([], finalOf("   \n", "end_turn")));
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.retryable).toBe(true);
    expect(typeof body.error).toBe("string");
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("does NOT bill and returns MODEL_NO_QUICK_SUGGEST when reasoning ate the whole budget (thinking-only) — D-100", async () => {
    // D-100: a reasoning model that returns ONLY thinking blocks can't produce
    // quick suggestions; the gate resolves not-ok BEFORE any byte flushes and
    // answers the honest, machine-readable 422 — still unbilled.
    h.stream.mockReturnValueOnce(fakeStream([], reasoningOnly));
    const res = await POST(req({ context: "a".repeat(60), chapterNumber: 1 }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("MODEL_NO_QUICK_SUGGEST");
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });
});
