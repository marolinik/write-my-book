// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readQuickAssistFrames } from "@/components/editor/quick-assist-stream-client";
import { quickAssistErrorNotice } from "@/components/editor/quick-assist-client-errors";

/**
 * D5 — `readQuickAssistFrames` reassembles `data: {json}\n\n` SSE frames from a
 * ReadableStream reader across arbitrary chunk boundaries, ignores `:` keepalive
 * comment lines, and yields discriminated token/done/error frames. It must be
 * robust to a frame split across two reads and to multiple frames per chunk, and
 * return silently on a reader AbortError.
 */

const enc = new TextEncoder();

function streamFrom(chunks: (string | Uint8Array)[]): Response {
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === "string" ? enc.encode(c) : c);
      }
      controller.close();
    },
  });
  return { body } as unknown as Response;
}

function abortingStream(): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode('data: {"type":"token","text":"a"}\n\n'));
    },
    // read() will reject once we cancel it; simulate an AbortError instead.
  });
  return { body } as unknown as Response;
}

async function collect(res: Response, signal: AbortSignal) {
  const out: unknown[] = [];
  for await (const f of readQuickAssistFrames(res, signal)) out.push(f);
  return out;
}

describe("readQuickAssistFrames (D5) — SSE frame reassembly", () => {
  it("parses token…done frames delivered one per chunk", async () => {
    const res = streamFrom([
      'data: {"type":"token","text":"The "}\n\n',
      'data: {"type":"token","text":"tide."}\n\n',
      'data: {"type":"done","text":"The tide.","elapsedMs":1843}\n\n',
    ]);
    const frames = await collect(res, new AbortController().signal);
    expect(frames).toEqual([
      { type: "token", text: "The " },
      { type: "token", text: "tide." },
      { type: "done", text: "The tide.", elapsedMs: 1843 },
    ]);
  });

  it("reassembles a single frame split across two reads", async () => {
    const res = streamFrom([
      'data: {"type":"to',
      'ken","text":"split"}\n\n',
    ]);
    const frames = await collect(res, new AbortController().signal);
    expect(frames).toEqual([{ type: "token", text: "split" }]);
  });

  it("handles multiple frames arriving in one chunk", async () => {
    const res = streamFrom([
      'data: {"type":"token","text":"a"}\n\ndata: {"type":"token","text":"b"}\n\n',
    ]);
    const frames = await collect(res, new AbortController().signal);
    expect(frames).toEqual([
      { type: "token", text: "a" },
      { type: "token", text: "b" },
    ]);
  });

  it("ignores ':' keepalive comment lines", async () => {
    const res = streamFrom([
      ": keepalive\n\n",
      'data: {"type":"token","text":"x"}\n\n',
      ": keepalive\n\n",
      'data: {"type":"done","text":"x"}\n\n',
    ]);
    const frames = await collect(res, new AbortController().signal);
    expect(frames).toEqual([
      { type: "token", text: "x" },
      { type: "done", text: "x" },
    ]);
  });

  it("maps an error frame through quickAssistErrorNotice to the settings deep-link", async () => {
    const res = streamFrom([
      'data: {"type":"error","status":422,"error":"only reasoning","code":"MODEL_NO_QUICK_SUGGEST"}\n\n',
    ]);
    const frames = (await collect(
      res,
      new AbortController().signal
    )) as Array<Record<string, unknown>>;
    expect(frames).toHaveLength(1);
    const notice = quickAssistErrorNotice(frames[0]);
    expect(notice.openSettings).toBe(true);
    expect(notice.message).toContain("only reasoning");
  });

  it("returns silently on an aborted signal before reading", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const res = abortingStream();
    const frames = await collect(res, ctl.signal);
    expect(frames).toEqual([]);
  });

  it("returns nothing when the response has no body", async () => {
    const res = { body: null } as unknown as Response;
    const frames = await collect(res, new AbortController().signal);
    expect(frames).toEqual([]);
  });
});
