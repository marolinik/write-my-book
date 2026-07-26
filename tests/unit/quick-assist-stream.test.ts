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
