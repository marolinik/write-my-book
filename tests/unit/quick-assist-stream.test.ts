import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D5 — `gateQuickAssistStream` is the first-text-gate: it consumes the provider
 * MessageStream server-side and resolves BEFORE any HTTP byte flushes.
 *  - first non-empty text delta → ok:true, `firstText` = accumulated text,
 *    `rest` continues the SAME iterator yielding only subsequent text deltas;
 *  - thinking_delta / redacted_thinking are dropped (channel isolation);
 *  - stream ends with no usable text → ok:false, classified reasoning-only vs
 *    truncated via settleQuickAssist(finalMessage);
 *  - abort before first text → resolves ok:false and calls stream.abort() (the
 *    route then answers 499); no throw leaks.
 */

const h = vi.hoisted(() => ({
  db: { usageRecord: { create: vi.fn() } },
  estimateCost: vi.fn(),
  recordDailyUse: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/cost", () => ({ estimateCost: h.estimateCost }));
vi.mock("@/lib/billing/free-tier-meters", () => ({
  recordDailyUse: h.recordDailyUse,
}));

import {
  gateQuickAssistStream,
  sseQuickAssistBody,
  type QuickAssistMessageStream,
} from "@/lib/llm/quick-assist-stream";

// ── Fake MessageStream ────────────────────────────────────────────────────
type Delta =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; thinking: string };

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

/**
 * Async-iterable stub of the SDK MessageStream: yields scripted content-block
 * deltas then resolves finalMessage(). One shared iterator (obtained once by
 * the gate and continued by `rest`), plus an `abort` spy.
 */
function fakeStream(opts: {
  deltas: Delta[];
  final: FakeFinal;
  finalGate?: Promise<void>;
}): QuickAssistMessageStream & { abort: ReturnType<typeof vi.fn> } {
  const abort = vi.fn();
  async function* gen() {
    for (const d of opts.deltas) {
      yield { type: "content_block_delta", index: 0, delta: d };
    }
  }
  return {
    abort,
    [Symbol.asyncIterator]: () => gen(),
    finalMessage: async () => {
      if (opts.finalGate) await opts.finalGate;
      return opts.final as never;
    },
  } as never;
}

const okFinal = (text: string): FakeFinal => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 40, output_tokens: 8 },
});

beforeEach(() => {
  vi.clearAllMocks();
  h.estimateCost.mockReturnValue(0.0001);
  h.db.usageRecord.create.mockResolvedValue({});
  h.recordDailyUse.mockResolvedValue(undefined);
});

describe("gateQuickAssistStream (D5) — the first-text gate", () => {
  it("resolves ok:true on the first non-empty text delta and streams the rest", async () => {
    const signal = new AbortController().signal;
    const stream = fakeStream({
      deltas: [
        { type: "text_delta", text: "The " },
        { type: "text_delta", text: "tide " },
        { type: "text_delta", text: "turned." },
      ],
      final: okFinal("The tide turned."),
    });
    const gate = await gateQuickAssistStream(stream, signal);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.gated.firstText).toBe("The ");
    const rest: string[] = [];
    for await (const t of gate.gated.rest) rest.push(t);
    expect(rest).toEqual(["tide ", "turned."]);
    const final = await gate.gated.final();
    expect(final.content[0].text).toBe("The tide turned.");
  });

  it("drops leading thinking_delta and gates on the first text (channel isolation)", async () => {
    const signal = new AbortController().signal;
    const stream = fakeStream({
      deltas: [
        { type: "thinking_delta", thinking: "hmm let me think" },
        { type: "thinking_delta", thinking: " more" },
        { type: "text_delta", text: "the door opened." },
      ],
      final: okFinal("the door opened."),
    });
    const gate = await gateQuickAssistStream(stream, signal);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.gated.firstText).toBe("the door opened.");
    const rest: string[] = [];
    for await (const t of gate.gated.rest) rest.push(t);
    expect(rest).toEqual([]);
  });

  it("forwards ONLY the text channel when thinking and text interleave", async () => {
    const signal = new AbortController().signal;
    const stream = fakeStream({
      deltas: [
        { type: "text_delta", text: "A" },
        { type: "thinking_delta", thinking: "IGNORED" },
        { type: "text_delta", text: "B" },
        { type: "thinking_delta", thinking: "IGNORED2" },
        { type: "text_delta", text: "C" },
      ],
      final: okFinal("ABC"),
    });
    const gate = await gateQuickAssistStream(stream, signal);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    const collected =
      gate.gated.firstText +
      (await (async () => {
        let s = "";
        for await (const t of gate.gated.rest) s += t;
        return s;
      })());
    expect(collected).toBe("ABC");
  });

  it("resolves ok:false reasoning-only when only thinking is produced", async () => {
    const signal = new AbortController().signal;
    const stream = fakeStream({
      deltas: [{ type: "thinking_delta", thinking: "only thoughts" }],
      final: {
        content: [{ type: "thinking" }],
        stop_reason: "max_tokens",
        usage: { input_tokens: 40, output_tokens: 60 },
      },
    });
    const gate = await gateQuickAssistStream(stream, signal);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reasoningOnly).toBe(true);
  });

  it("resolves ok:false truncated when empty and stop_reason is max_tokens", async () => {
    const signal = new AbortController().signal;
    const stream = fakeStream({
      deltas: [],
      final: {
        content: [],
        stop_reason: "max_tokens",
        usage: { input_tokens: 40, output_tokens: 60 },
      },
    });
    const gate = await gateQuickAssistStream(stream, signal);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reasoningOnly).toBe(false);
    expect(gate.truncated).toBe(true);
  });

  it("aborts the upstream and resolves ok:false when the signal is already aborted", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const stream = fakeStream({
      deltas: [{ type: "text_delta", text: "won't reach" }],
      final: okFinal("won't reach"),
    });
    const gate = await gateQuickAssistStream(stream, ctl.signal);
    expect(gate.ok).toBe(false);
    expect(stream.abort).toHaveBeenCalled();
  });
});

// ── SSE body builder + bill-at-settle ─────────────────────────────────────

const encoder = new TextEncoder();
async function drain(rs: ReadableStream): Promise<string> {
  const reader = rs.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value as Uint8Array, { stream: true });
  }
  return out;
}
function frames(sse: string): Array<Record<string, unknown>> {
  return sse
    .split("\n\n")
    .map((r) => r.trim())
    .filter((r) => r.startsWith("data:"))
    .map((r) => JSON.parse(r.slice("data:".length).trim()));
}
const model = { id: "anthropic/haiku", modelId: "claude-haiku" } as never;

describe("sseQuickAssistBody (D5) — bill-at-settle + canonical done", () => {
  it("pumps token frames then a canonical done frame and bills exactly once", async () => {
    const signal = new AbortController().signal;
    const stream = fakeStream({
      deltas: [
        { type: "text_delta", text: "The " },
        { type: "text_delta", text: "tide turned." },
      ],
      final: okFinal("The tide turned."),
    });
    const gate = await gateQuickAssistStream(stream, signal);
    if (!gate.ok) throw new Error("expected ok");
    const body = sseQuickAssistBody(gate.gated, signal, {
      userId: "u1",
      bookId: "b1",
      model,
      isFree: true,
      startedAt: Date.now(),
    });
    const parsed = frames(await drain(body));
    expect(parsed.filter((f) => f.type === "token").length).toBeGreaterThan(0);
    const done = parsed.find((f) => f.type === "done");
    expect(done?.text).toBe("The tide turned.");
    expect(typeof done?.elapsedMs).toBe("number");
    // Bill-at-settle: exactly one usage_record + one free-meter tick.
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    expect(h.db.usageRecord.create.mock.calls[0][0].data.model).toBe(
      "anthropic/haiku"
    );
    expect(h.recordDailyUse).toHaveBeenCalledTimes(1);
    expect(h.recordDailyUse).toHaveBeenCalledWith("u1", "ghost");
  });

  it("does NOT advance the free meter for a paid (isFree:false) user", async () => {
    const signal = new AbortController().signal;
    const stream = fakeStream({
      deltas: [{ type: "text_delta", text: "kept." }],
      final: okFinal("kept."),
    });
    const gate = await gateQuickAssistStream(stream, signal);
    if (!gate.ok) throw new Error("expected ok");
    const body = sseQuickAssistBody(gate.gated, signal, {
      userId: "u1",
      bookId: "b1",
      model,
      isFree: false,
      startedAt: Date.now(),
    });
    await drain(body);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    expect(h.recordDailyUse).not.toHaveBeenCalled();
  });

  it("does NOT bill when the client aborts mid-stream (before done)", async () => {
    const ctl = new AbortController();
    const gate2Final = deferred<void>();
    const stream = fakeStream({
      deltas: [{ type: "text_delta", text: "partial" }],
      final: okFinal("partial full"),
      finalGate: gate2Final.promise,
    });
    const gate = await gateQuickAssistStream(stream, ctl.signal);
    if (!gate.ok) throw new Error("expected ok");
    const body = sseQuickAssistBody(gate.gated, ctl.signal, {
      userId: "u1",
      bookId: "b1",
      model,
      isFree: true,
      startedAt: Date.now(),
    });
    const reader = body.getReader();
    // Read the first token frame, then abort before the done settle.
    await reader.read();
    ctl.abort();
    gate2Final.resolve();
    // Drain to completion.
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
    expect(h.recordDailyUse).not.toHaveBeenCalled();
  });
});

// ── D-143: settle-tail dead-zone (finalMessage lag + billing-before-done) ────
//
// Root cause (verified against @anthropic-ai/sdk MessageStream): finalMessage()
// awaits done() = the 'end' event, emitted only AFTER the underlying HTTP body
// closes — which lagged ~4.4s behind the last visible token on the OpenRouter
// route. The pump then ran two awaited DB writes BEFORE the done frame that
// arms accept. Fix: settle from the streamed message_stop (usage/stop_reason
// are known by message_delta) and write the done frame BEFORE billing.

/** Lifecycle-faithful stub: emits message_start → deltas → message_delta →
 *  message_stop (the real SDK event order), so the gate/rest can settle from the
 *  stream. `finalMessage` defaults to a NEVER-resolving promise to prove the
 *  fast path never awaits it. */
function fakeLifecycleStream(opts: {
  deltas: string[];
  inputTokens: number;
  outputTokens: number;
  stopReason?: string;
  finalMessage?: () => Promise<FakeFinal>;
  dropBeforeStop?: boolean;
}): QuickAssistMessageStream & { abort: ReturnType<typeof vi.fn> } {
  const abort = vi.fn();
  async function* gen() {
    yield {
      type: "message_start",
      message: { usage: { input_tokens: opts.inputTokens, output_tokens: 0 } },
    };
    yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
    for (const text of opts.deltas) {
      yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
    }
    if (opts.dropBeforeStop) {
      // Provider dropped after the first text delta — the SDK iterator throws
      // and NO message_stop is ever seen (acc.completed stays false).
      throw new Error("upstream reset");
    }
    yield { type: "content_block_stop", index: 0 };
    yield {
      type: "message_delta",
      delta: { stop_reason: opts.stopReason ?? "end_turn", stop_sequence: null },
      usage: { output_tokens: opts.outputTokens },
    };
    yield { type: "message_stop" };
  }
  return {
    abort,
    [Symbol.asyncIterator]: () => gen(),
    finalMessage:
      opts.finalMessage ?? ((() => new Promise<FakeFinal>(() => {})) as never),
  } as never;
}

describe("D-143 — settle from message_stop, done before billing", () => {
  it("(b) settles from the streamed message_stop WITHOUT awaiting finalMessage()", async () => {
    const signal = new AbortController().signal;
    // finalMessage() hangs forever: reaching a done frame proves the fast path
    // never touched it (the pre-fix pump awaited it, and would deadlock here).
    const stream = fakeLifecycleStream({
      deltas: ["The ", "tide ", "turned."],
      inputTokens: 55,
      outputTokens: 9,
      finalMessage: () => new Promise<FakeFinal>(() => {}),
    });
    const gate = await gateQuickAssistStream(stream, signal);
    if (!gate.ok) throw new Error("expected ok");
    const body = sseQuickAssistBody(gate.gated, signal, {
      userId: "u1",
      bookId: "b1",
      model,
      isFree: true,
      startedAt: Date.now(),
    });
    const parsed = frames(await drain(body));
    const done = parsed.find((f) => f.type === "done");
    expect(done?.text).toBe("The tide turned.");
    // Usage came from message_start (input) + message_delta (output), not from
    // the (never-resolving) finalMessage().
    expect((done?.usage as { input_tokens: number }).input_tokens).toBe(55);
    expect((done?.usage as { output_tokens: number }).output_tokens).toBe(9);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    const billed = h.db.usageRecord.create.mock.calls[0][0].data;
    expect(billed.tokensInput).toBe(55);
    expect(billed.tokensOutput).toBe(9);
    expect(h.recordDailyUse).toHaveBeenCalledTimes(1);
  });

  it("(a) enqueues the done frame BEFORE the billing DB writes (accept never waits on Postgres)", async () => {
    const signal = new AbortController().signal;
    const billGate = deferred<void>();
    // usage_record.create hangs until we release billGate. Pre-fix the pump
    // awaited this BEFORE writing done, so the done frame would be unreachable.
    h.db.usageRecord.create.mockReturnValue(
      billGate.promise.then(() => ({}))
    );
    const stream = fakeLifecycleStream({
      deltas: ["Kept."],
      inputTokens: 10,
      outputTokens: 3,
      finalMessage: () => new Promise<FakeFinal>(() => {}),
    });
    const gate = await gateQuickAssistStream(stream, signal);
    if (!gate.ok) throw new Error("expected ok");
    const body = sseQuickAssistBody(gate.gated, signal, {
      userId: "u1",
      bookId: "b1",
      model,
      isFree: true,
      startedAt: Date.now(),
    });
    const reader = body.getReader();
    const decoder = new TextDecoder();
    // Read frames until the done frame appears — WITHOUT releasing billGate.
    let sawDone = false;
    for (let i = 0; i < 4 && !sawDone; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      if (decoder.decode(value as Uint8Array, { stream: true }).includes('"type":"done"')) {
        sawDone = true;
      }
    }
    expect(sawDone).toBe(true);
    // Billing was invoked (create called) but is still pending, so the meter
    // tick that runs AFTER it has not fired.
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    expect(h.recordDailyUse).not.toHaveBeenCalled();
    // Release billing; the pump advances the meter and closes.
    billGate.resolve();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(h.recordDailyUse).toHaveBeenCalledTimes(1);
  });

  it("(a) a billing failure AFTER delivery does NOT emit an error frame (delivered-unbilled)", async () => {
    const signal = new AbortController().signal;
    h.db.usageRecord.create.mockRejectedValueOnce(new Error("db down"));
    const stream = fakeLifecycleStream({
      deltas: ["Delivered."],
      inputTokens: 12,
      outputTokens: 4,
      finalMessage: () => new Promise<FakeFinal>(() => {}),
    });
    const gate = await gateQuickAssistStream(stream, signal);
    if (!gate.ok) throw new Error("expected ok");
    const body = sseQuickAssistBody(gate.gated, signal, {
      userId: "u1",
      bookId: "b1",
      model,
      isFree: true,
      startedAt: Date.now(),
    });
    const parsed = frames(await drain(body));
    // The suggestion was delivered; a post-delivery DB failure must NOT turn
    // into a 502 error frame.
    expect(parsed.find((f) => f.type === "done")?.text).toBe("Delivered.");
    expect(parsed.some((f) => f.type === "error")).toBe(false);
    expect(h.recordDailyUse).not.toHaveBeenCalled();
  });

  it("post-first-text drop (no message_stop) defers to finalMessage → 502 error frame, unbilled", async () => {
    const signal = new AbortController().signal;
    const stream = fakeLifecycleStream({
      deltas: ["Half a sen"],
      inputTokens: 20,
      outputTokens: 5,
      dropBeforeStop: true,
      // finalMessage rejects, exactly as the SDK does when the stream errored
      // without producing a complete message.
      finalMessage: () => Promise.reject(new Error("no final message")),
    });
    const gate = await gateQuickAssistStream(stream, signal);
    if (!gate.ok) throw new Error("expected ok");
    const body = sseQuickAssistBody(gate.gated, signal, {
      userId: "u1",
      bookId: "b1",
      model,
      isFree: true,
      startedAt: Date.now(),
    });
    const parsed = frames(await drain(body));
    const err = parsed.find((f) => f.type === "error");
    expect(err?.status).toBe(502);
    expect(parsed.some((f) => f.type === "done")).toBe(false);
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
    expect(h.recordDailyUse).not.toHaveBeenCalled();
  });
});
