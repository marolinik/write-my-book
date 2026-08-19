import { describe, it, expect, vi } from "vitest";
import { consumeDiscussStream } from "@/lib/editorial/discuss-stream-client";

/**
 * D5 — the client half of the streamed discuss turn.
 *
 * `consumeDiscussStream` is the pure state machine the discussion hook drives:
 * it reassembles SSE frames, pushes prose deltas at the caller (typing feel),
 * and resolves with the SAME settled payload the blocking 200 used to return, so
 * the bubble can swap to the parsed view on `done`. Terminal frames must map to
 * the historical outcomes: 409 → capped (not an error), everything else → a
 * thrown error the mutation rolls back on.
 */

const enc = new TextEncoder();

function sseResponse(chunks: readonly string[]): Response {
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return { body, headers: new Headers({ "content-type": "text/event-stream" }) } as unknown as Response;
}

const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

describe("consumeDiscussStream", () => {
  it("pushes each prose delta at the caller, then resolves with the settled payload", async () => {
    const onText = vi.fn();
    const res = sseResponse([
      frame({ type: "text", text: "That's " }),
      frame({ type: "text", text: "fair." }),
      frame({
        type: "done",
        assistantMessage: "That's fair.",
        raw: "That's fair.\n<<<REMEMBER category=\"preference\">>\nkeep it\n<<<END>>>",
        suggestedConstraint: { category: "preference", content: "keep it" },
        userTurns: 1,
        capped: false,
        elapsedMs: 4200,
      }),
    ]);

    const result = await consumeDiscussStream(res, { onText });

    expect(onText.mock.calls.map((c) => c[0])).toEqual(["That's ", "fair."]);
    expect(result.assistantMessage).toBe("That's fair.");
    expect(result.userTurns).toBe(1);
    expect(result.capped).toBe(false);
    expect(result.raw).toContain("REMEMBER");
    expect(result.suggestedConstraint).toEqual({ category: "preference", content: "keep it" });
  });

  it("survives a frame split across chunk boundaries", async () => {
    const onText = vi.fn();
    const res = sseResponse([
      'data: {"type":"te',
      'xt","text":"split"}\n\n',
      frame({ type: "done", assistantMessage: "split", raw: "split", userTurns: 1, capped: false }),
    ]);

    const result = await consumeDiscussStream(res, { onText });

    expect(onText).toHaveBeenCalledWith("split");
    expect(result.assistantMessage).toBe("split");
  });

  it("ignores keepalive comments during a long turn", async () => {
    const onText = vi.fn();
    const res = sseResponse([
      ": keepalive\n\n",
      frame({ type: "text", text: "still here" }),
      ": keepalive\n\n",
      frame({ type: "done", assistantMessage: "still here", raw: "still here", userTurns: 2, capped: false }),
    ]);

    const result = await consumeDiscussStream(res, { onText });

    expect(onText).toHaveBeenCalledTimes(1);
    expect(result.userTurns).toBe(2);
  });

  it("maps a 409 error frame to a capped result rather than an error", async () => {
    const res = sseResponse([
      frame({ type: "text", text: "one more thing" }),
      frame({
        type: "error",
        status: 409,
        capped: true,
        assistantMessage: "You've discussed this finding thoroughly (3 exchanges). Ready to make a decision?",
        userTurns: 3,
      }),
    ]);

    const result = await consumeDiscussStream(res, { onText: () => {} });

    expect(result.capped).toBe(true);
    expect(result.userTurns).toBe(3);
    expect(result.assistantMessage).toMatch(/thoroughly/);
  });

  it("throws the server's message on a non-cap error frame", async () => {
    const res = sseResponse([
      frame({ type: "text", text: "half a thought" }),
      frame({ type: "error", status: 502, error: "The editor's reply was interrupted.", retryable: true }),
    ]);

    await expect(consumeDiscussStream(res, { onText: () => {} })).rejects.toThrow(/interrupted/);
  });

  it("throws when the stream closes without any terminal frame", async () => {
    const res = sseResponse([frame({ type: "text", text: "truncated" })]);

    await expect(consumeDiscussStream(res, { onText: () => {} })).rejects.toThrow();
  });

  it("throws when the response carries no body", async () => {
    const res = { body: null, headers: new Headers() } as unknown as Response;

    await expect(consumeDiscussStream(res, { onText: () => {} })).rejects.toThrow();
  });
});
