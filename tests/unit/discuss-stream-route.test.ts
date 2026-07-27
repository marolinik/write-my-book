import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D5 (P1/P6 floor) — the discuss turn must stream.
 *
 * Live-confirmed twice (157.2 s at baseline, 61.6 s on camera at shot 42d): the
 * finding-discuss POST is a single blocking request behind a spinner, while the
 * in-editor quick assist streams at ~141 ms token gaps through the D5 Stage-1
 * first-text-gate SSE. Both the P1 and the P6 judge independently named this
 * turn as the D5 lever.
 *
 * This suite locks the streamed contract AND every semantic the blocking route
 * already owned:
 *  (a) success → 200 text/event-stream, `text` frames then ONE `done` frame that
 *      carries the same parsed payload the blocking 200 returned, plus the raw
 *      reply for the client's settled render;
 *  (b) the 3-exchange cap 409s BEFORE any provider stream is constructed;
 *  (c) the 24 h rate limit 429s before any provider stream;
 *  (d) D-157 drifted REMEMBER syntax NEVER appears in an emitted text frame,
 *      while the settled done frame still carries the recovered constraint;
 *  (e) the doubled-budget retry survives, and D-172 bills BOTH attempts once;
 *  (f) no usable text → honest 502 JSON, nothing persisted, nothing billed;
 *  (g) D-142 abort before first text → 499, provider stream aborted, unbilled;
 *  (h) abort mid-stream → nothing persisted, nothing billed;
 *  (i) a provider that cannot stream degrades to the byte-identical blocking JSON;
 *  (j) D-143 ordering — the done frame is delivered BEFORE the billing write;
 *  (k) D-41b / D-105 revision write-back still runs on the streamed path.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  create: vi.fn(),
  stream: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    editFinding: { findFirst: vi.fn(), update: vi.fn() },
    findingReply: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    apiKey: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    usageRecord: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve(h.user) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: (k: string) => `dec:${k}` }));
vi.mock("@/lib/agents/writer-memory", () => ({
  formatWriterMemoryForPrompt: () => Promise.resolve(""),
}));
// Keep the REAL registry (estimateCost prices through @/lib/llm); override only
// the client seam, exactly as tests/unit/discuss-usage-record.test.ts does.
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  createLLMClient: () => ({
    client: { messages: { create: h.create, stream: h.stream } },
    model: { id: "openrouter-qwen36/haiku", modelId: "qwen/qwen3.6-27b" },
    effectiveModelId: "qwen/qwen3.6-27b",
  }),
  resolveCheapModelFor: () => ({ id: "openrouter-qwen36/haiku" }),
}));

import { POST } from "@/app/api/books/[id]/editorial/findings/[findingId]/discuss/route";

const ctx = { params: Promise.resolve({ id: "b1", findingId: "f1" }) };

function req(body: unknown, signal?: AbortSignal) {
  return new Request("http://t/discuss", {
    method: "POST",
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
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

/**
 * A provider MessageStream fake. With `lifecycle`, it emits the real
 * message_start / message_delta / message_stop envelope so settle is derived
 * from the stream itself (D-143) instead of finalMessage().
 */
function fakeStream(
  deltas: readonly string[],
  final: FakeFinal,
  opts: { lifecycle?: boolean; finalGate?: Promise<void> } = {}
) {
  async function* gen() {
    if (opts.lifecycle) {
      yield {
        type: "message_start",
        message: { usage: { input_tokens: final.usage.input_tokens, output_tokens: 0 } },
      };
    }
    for (const text of deltas) {
      yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
    }
    if (opts.lifecycle) {
      yield {
        type: "message_delta",
        delta: { stop_reason: final.stop_reason },
        usage: { output_tokens: final.usage.output_tokens },
      };
      yield { type: "message_stop" };
    }
  }
  return {
    abort: vi.fn(),
    [Symbol.asyncIterator]: () => gen(),
    finalMessage: async () => {
      if (opts.finalGate) await opts.finalGate;
      return final;
    },
  };
}

const finalOf = (text: string, usage = { input_tokens: 1200, output_tokens: 180 }): FakeFinal => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage,
});

/** Whole budget spent on reasoning: no text block, real tokens, max_tokens stop. */
const reasoningOnlyFinal: FakeFinal = {
  content: [{ type: "thinking" }],
  stop_reason: "max_tokens",
  usage: { input_tokens: 700, output_tokens: 2500 },
};

type Frame = Record<string, unknown>;

function parseFrames(raw: string): Frame[] {
  return raw
    .split("\n\n")
    .map((r) => r.trim())
    .filter((r) => r.startsWith("data:"))
    .map((r) => JSON.parse(r.slice("data:".length).trim()) as Frame);
}

async function readSse(res: Response): Promise<Frame[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value as Uint8Array, { stream: true });
  }
  return parseFrames(out);
}

/** Read frames until `match` is satisfied, leaving the stream open. */
async function readUntil(res: Response, match: (f: Frame) => boolean) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const seen: Frame[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value as Uint8Array, { stream: true });
    const frames = parseFrames(buf);
    seen.length = 0;
    seen.push(...frames);
    if (frames.some(match)) break;
  }
  return { seen, reader };
}

const DISCUSS_REPLY = [
  "That's fair — the taxonomy is the character.",
  '<<<REMEMBER category="preference">>',
  "Milan's plant names stay Latin; do not simplify them.",
  "<<<END>>>",
].join("\n");

const REVISION_REPLY = [
  "Agreed, that beat can land harder.",
  "<<<REVISION>>>",
  "suggestion: She bolted for the door.",
  "why: punchier",
  "<<<END>>>",
].join("\n");

/** Split a reply into small deltas so control syntax straddles chunk edges. */
function deltasOf(text: string, size = 6): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.editFinding.findFirst.mockResolvedValue({
    id: "f1",
    bookId: "b1",
    category: "dialogue",
    severity: "important",
    description: "d",
    alternatives: null,
    agentType: "line-editor",
    status: "pending",
  });
  h.db.findingReply.findMany.mockResolvedValue([]);
  h.db.findingReply.count.mockResolvedValue(0);
  h.db.findingReply.create.mockResolvedValue({});
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "openrouter", encryptedKey: "ek" }]);
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "openrouter-qwen36/sonnet" });
  h.db.usageRecord.create.mockResolvedValue({});
  h.db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ ...h.db, $queryRaw: h.db.$queryRaw })
  );
  h.db.$queryRaw.mockResolvedValue([{ id: "f1" }]);
});

describe("D5 — discuss turns stream via the first-text-gate SSE", () => {
  it("(a) streams prose frames then one canonical done frame, and persists the raw turn", async () => {
    h.stream.mockReturnValueOnce(
      fakeStream(deltasOf(DISCUSS_REPLY), finalOf(DISCUSS_REPLY), { lifecycle: true })
    );

    const res = await POST(req({ writerMessage: "the names matter" }), ctx as never);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("Server-Timing")).toMatch(/ttft;dur=/);

    const frames = await readSse(res);
    const textFrames = frames.filter((f) => f.type === "text");
    expect(textFrames.length).toBeGreaterThan(1); // real incremental delivery

    const done = frames.find((f) => f.type === "done");
    expect(done).toBeDefined();
    expect(done!.capped).toBe(false);
    expect(done!.userTurns).toBe(1);
    expect(done!.assistantMessage).toBe("That's fair — the taxonomy is the character.");
    expect(done!.raw).toBe(DISCUSS_REPLY);
    expect(typeof done!.elapsedMs).toBe("number");

    // Persistence is unchanged: both turns stored, assistant row keeps the RAW
    // reply so GET re-parses it through the same sanitizer.
    const roles = h.db.findingReply.create.mock.calls.map((c) => c[0].data.role);
    expect(roles).toEqual(["user", "assistant"]);
    const stored = h.db.findingReply.create.mock.calls[1][0].data.content;
    expect(stored).toBe(DISCUSS_REPLY);
  });

  it("(d) never emits drifted REMEMBER syntax in a text frame, yet settles the constraint", async () => {
    h.stream.mockReturnValueOnce(
      fakeStream(deltasOf(DISCUSS_REPLY, 3), finalOf(DISCUSS_REPLY), { lifecycle: true })
    );

    const res = await POST(req({ writerMessage: "the names matter" }), ctx as never);
    const frames = await readSse(res);

    const streamed = frames
      .filter((f) => f.type === "text")
      .map((f) => String(f.text ?? ""))
      .join("");
    expect(streamed).not.toMatch(/REMEMBER/);
    expect(streamed).not.toMatch(/<</);
    expect(streamed).not.toMatch(/>>/);
    expect(streamed).not.toContain("Milan's plant names stay Latin");

    const done = frames.find((f) => f.type === "done")!;
    expect(done.suggestedConstraint).toEqual({
      category: "preference",
      content: "Milan's plant names stay Latin; do not simplify them.",
    });
  });

  it("(a2) writes exactly one usage row at settle, with the registry model id (D-172)", async () => {
    h.stream.mockReturnValueOnce(
      fakeStream(deltasOf(DISCUSS_REPLY), finalOf(DISCUSS_REPLY), { lifecycle: true })
    );

    const res = await POST(req({ writerMessage: "x" }), ctx as never);
    await readSse(res);

    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    const data = h.db.usageRecord.create.mock.calls[0][0].data;
    expect(data.userId).toBe("u1");
    expect(data.bookId).toBe("b1");
    expect(data.agentType).toBe("discuss");
    expect(data.model).toBe("openrouter-qwen36/haiku");
    expect(data.tokensInput).toBe(1200);
    expect(data.tokensOutput).toBe(180);
    expect(data.costEstimate).toBeGreaterThan(0);
  });

  it("(j) delivers the done frame BEFORE the billing write completes (D-143 ordering)", async () => {
    const billGate = deferred<void>();
    let billStarted = false;
    h.db.usageRecord.create.mockImplementation(async () => {
      billStarted = true;
      await billGate.promise;
      return {};
    });
    h.stream.mockReturnValueOnce(
      fakeStream(deltasOf(DISCUSS_REPLY), finalOf(DISCUSS_REPLY), { lifecycle: true })
    );

    const res = await POST(req({ writerMessage: "x" }), ctx as never);
    const { seen, reader } = await readUntil(res, (f) => f.type === "done");

    expect(seen.some((f) => f.type === "done")).toBe(true);
    expect(billStarted).toBe(true); // billing is in flight, not yet finished
    billGate.resolve();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
  });

  it("(b) 409s on the 3-exchange cap BEFORE constructing any provider stream", async () => {
    h.db.findingReply.findMany.mockResolvedValue([
      { role: "user", content: "1" },
      { role: "user", content: "2" },
      { role: "user", content: "3" },
    ]);

    const res = await POST(req({ writerMessage: "one more" }), ctx as never);

    expect(res.status).toBe(409);
    expect((await res.json()).capped).toBe(true);
    expect(h.stream).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("(c) 429s on the 24h rate limit before any provider stream", async () => {
    h.db.findingReply.count.mockResolvedValue(201);

    const res = await POST(req({ writerMessage: "x" }), ctx as never);

    expect(res.status).toBe(429);
    expect(h.stream).not.toHaveBeenCalled();
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("(e) retries once with a doubled budget and bills BOTH attempts (D-04 + D-172)", async () => {
    h.stream
      .mockReturnValueOnce(fakeStream([], reasoningOnlyFinal))
      .mockReturnValueOnce(
        fakeStream(deltasOf("Second attempt lands."), finalOf("Second attempt lands.", {
          input_tokens: 700,
          output_tokens: 220,
        }))
      );

    const res = await POST(req({ writerMessage: "x" }), ctx as never);
    expect(res.status).toBe(200);
    const frames = await readSse(res);
    expect(frames.find((f) => f.type === "done")!.assistantMessage).toBe("Second attempt lands.");

    expect(h.stream).toHaveBeenCalledTimes(2);
    const budgets = h.stream.mock.calls.map((c) => c[0].max_tokens);
    expect(budgets[1]).toBe(budgets[0] * 2);

    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    const data = h.db.usageRecord.create.mock.calls[0][0].data;
    expect(data.tokensInput).toBe(1400);
    expect(data.tokensOutput).toBe(2720);
  });

  it("(f) answers an honest 502 with nothing persisted and nothing billed when no text lands", async () => {
    h.stream.mockReturnValue(fakeStream([], reasoningOnlyFinal));

    const res = await POST(req({ writerMessage: "x" }), ctx as never);

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/turn was not used/i);
    expect(h.db.findingReply.create).not.toHaveBeenCalled();
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("(g) D-142: a client gone before the first token → 499, provider aborted, unbilled", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const fake = fakeStream(deltasOf(DISCUSS_REPLY), finalOf(DISCUSS_REPLY));
    h.stream.mockReturnValueOnce(fake);

    const res = await POST(req({ writerMessage: "x" }, ctl.signal), ctx as never);

    expect(res.status).toBe(499);
    expect(fake.abort).toHaveBeenCalled();
    expect(h.db.findingReply.create).not.toHaveBeenCalled();
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("(h) abort mid-stream persists nothing and bills nothing", async () => {
    const ctl = new AbortController();
    const gate = deferred<void>();
    h.stream.mockReturnValueOnce(
      fakeStream(["Partial prose"], finalOf(DISCUSS_REPLY), { finalGate: gate.promise })
    );

    const res = await POST(req({ writerMessage: "x" }, ctl.signal), ctx as never);
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    await reader.read(); // first prose frame
    ctl.abort(); // writer closed the tab / navigated away
    gate.resolve();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(h.db.findingReply.create).not.toHaveBeenCalled();
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("(i) degrades to the blocking JSON turn when the provider cannot stream", async () => {
    h.stream.mockImplementationOnce(() => {
      throw new Error("stream unsupported on this route");
    });
    h.create.mockResolvedValueOnce({
      content: [{ type: "text", text: DISCUSS_REPLY }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 180 },
    });

    const res = await POST(req({ writerMessage: "x" }), ctx as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(body.assistantMessage).toBe("That's fair — the taxonomy is the character.");
    expect(body.userTurns).toBe(1);
    expect(body.capped).toBe(false);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.db.findingReply.create).toHaveBeenCalledTimes(2);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
  });

  it("(k) still arms an agreed revision onto the finding from the streamed path (D-41b)", async () => {
    h.stream.mockReturnValueOnce(
      fakeStream(deltasOf(REVISION_REPLY), finalOf(REVISION_REPLY), { lifecycle: true })
    );

    const res = await POST(req({ writerMessage: "tighten it" }), ctx as never);
    const frames = await readSse(res);

    const done = frames.find((f) => f.type === "done")!;
    expect(done.revisedSuggestion).toBe("She bolted for the door.");
    expect(h.db.editFinding.update).toHaveBeenCalledTimes(1);
    expect(h.db.editFinding.update.mock.calls[0][0].data.newText).toBe("She bolted for the door.");
  });

  it("(b2) a cap crossed mid-stream ends in a 409 error frame with nothing persisted", async () => {
    // Cap was free at precheck, taken by a concurrent turn before settle.
    h.db.findingReply.count
      .mockResolvedValueOnce(0) // 24h rate-limit probe
      .mockResolvedValue(3); // settle-time re-check inside the txn
    h.stream.mockReturnValueOnce(
      fakeStream(deltasOf(DISCUSS_REPLY), finalOf(DISCUSS_REPLY), { lifecycle: true })
    );

    const res = await POST(req({ writerMessage: "x" }), ctx as never);
    const frames = await readSse(res);

    const terminal = frames[frames.length - 1];
    expect(terminal.type).toBe("error");
    expect(terminal.status).toBe(409);
    expect(terminal.capped).toBe(true);
    expect(h.db.findingReply.create).not.toHaveBeenCalled();
  });
});
