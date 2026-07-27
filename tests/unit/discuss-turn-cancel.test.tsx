// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { useFindingDiscussion } from "@/hooks/use-finding-discussion";
import { DISCUSS_TURN_CANCELLED } from "@/lib/editorial/discuss-turn-notice";

/**
 * D-176 (cancel half) + D-177 (settle ordering), at the state level.
 *
 * Cancel: the writer aborts the fetch, the abort travels to the route as
 * `req.signal`, and the server's proven all-or-nothing path settles nothing,
 * persists nothing and consumes no exchange (D-142). Client side the optimistic
 * writer bubble must roll back and the rejection must be the CANCELLED sentinel,
 * not the scary "reply was cut off" copy the truncation path uses.
 *
 * Settle ordering: the settled assistant reply and the cleared turn flag must
 * land in ONE commit — there must be no rendered state in which the settled
 * reply exists while the turn is still flagged active (that window is exactly
 * the 50-189 ms re-cover flash D-177 measured).
 */

const enc = new TextEncoder();
const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

/** A stream that stays open after its chunks, and errors on abort like fetch does. */
function sseResponse(chunks: readonly string[], opts: { close: boolean; signal?: AbortSignal | null }): Response {
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      if (opts.close) {
        controller.close();
        return;
      }
      opts.signal?.addEventListener("abort", () => {
        try {
          controller.error(new DOMException("The operation was aborted.", "AbortError"));
        } catch {
          // already closed
        }
      });
    },
  });
  return {
    ok: true,
    status: 200,
    body,
    headers: new Headers({ "content-type": "text/event-stream" }),
  } as unknown as Response;
}

function jsonThread(replies: Array<{ role: string; content: string }>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ replies, userTurns: replies.filter((r) => r.role === "user").length, canDiscuss: true }),
  } as unknown as Response;
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

let capturedSignal: AbortSignal | undefined;

beforeEach(() => {
  capturedSignal = undefined;
});
afterEach(() => vi.unstubAllGlobals());

describe("useFindingDiscussion — writer-initiated cancel", () => {
  it("hands an AbortSignal to the POST, aborts it on cancel(), and rolls the turn back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method !== "POST") return Promise.resolve(jsonThread([]));
        capturedSignal = init.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError"))
          );
        });
      })
    );

    const { result } = renderHook(() => useFindingDiscussion("b1", "f1"), {
      wrapper: makeWrapper(newClient()),
    });

    let rejection: unknown;
    act(() => {
      void result.current.send("the names matter").catch((e: unknown) => {
        rejection = e;
      });
    });

    // The turn is live: flag set, start time recorded, writer bubble optimistic.
    await waitFor(() => expect(result.current.turnActive).toBe(true));
    expect(typeof result.current.turnStartedAt).toBe("number");
    expect(result.current.replies.map((r) => r.role)).toEqual(["user"]);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(false);

    act(() => result.current.cancel());

    // The abort really reaches the request (the route then sees req.signal → 499).
    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
    await waitFor(() => expect(result.current.turnActive).toBe(false));
    expect(result.current.turnStartedAt).toBeNull();
    await waitFor(() => expect(rejection).toBeDefined());
    expect((rejection as Error)?.message).toBe(DISCUSS_TURN_CANCELLED);
    // Optimistic writer bubble rolled back — nothing was persisted server-side.
    await waitFor(() => expect(result.current.replies).toHaveLength(0));
  });

  it("reports a cancel taken mid-stream as cancelled, not as the truncation error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method !== "POST") return Promise.resolve(jsonThread([]));
        capturedSignal = init.signal ?? undefined;
        return Promise.resolve(
          sseResponse([frame({ type: "text", text: "That's fair" })], {
            close: false,
            signal: init.signal,
          })
        );
      })
    );

    const { result } = renderHook(() => useFindingDiscussion("b1", "f1"), {
      wrapper: makeWrapper(newClient()),
    });

    let rejection: unknown;
    act(() => {
      void result.current.send("mid-stream").catch((e: unknown) => {
        rejection = e;
      });
    });

    await waitFor(() => expect(result.current.streamingText).toBe("That's fair"));

    act(() => result.current.cancel());

    await waitFor(() => expect(rejection).toBeDefined());
    expect((rejection as Error)?.message).toBe(DISCUSS_TURN_CANCELLED);
    expect(result.current.streamingText).toBe("");
    expect(result.current.turnActive).toBe(false);
  });

  it("still surfaces a REAL truncation (no cancel) as the server's honest error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method !== "POST") return Promise.resolve(jsonThread([]));
        // Prose, then the connection closes with no terminal frame.
        return Promise.resolve(
          sseResponse([frame({ type: "text", text: "half a th" })], { close: true })
        );
      })
    );

    const { result } = renderHook(() => useFindingDiscussion("b1", "f1"), {
      wrapper: makeWrapper(newClient()),
    });

    let rejection: unknown;
    await act(async () => {
      await result.current.send("truncate me").catch((e: unknown) => {
        rejection = e;
      });
    });

    expect((rejection as Error)?.message).toMatch(/cut off/i);
    expect((rejection as Error)?.message).not.toBe(DISCUSS_TURN_CANCELLED);
  });

  it("D-177: the settled reply is never rendered while the turn is still active", async () => {
    let posted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method !== "POST") {
          return Promise.resolve(
            jsonThread(
              posted
                ? [
                    { role: "user", content: "the names matter" },
                    { role: "assistant", content: "That's fair." },
                  ]
                : []
            )
          );
        }
        posted = true;
        return Promise.resolve(
          sseResponse(
            [
              frame({ type: "text", text: "That's " }),
              frame({ type: "text", text: "fair." }),
              frame({
                type: "done",
                assistantMessage: "That's fair.",
                raw: "That's fair.",
                userTurns: 1,
                capped: false,
              }),
            ],
            { close: true }
          )
        );
      })
    );

    const snapshots: Array<{ turnActive: boolean; assistants: number; streaming: number }> = [];
    const { result } = renderHook(
      () => {
        const state = useFindingDiscussion("b1", "f1");
        snapshots.push({
          turnActive: state.turnActive,
          assistants: state.replies.filter((r) => r.role === "assistant").length,
          streaming: state.streamingText.length,
        });
        return state;
      },
      { wrapper: makeWrapper(newClient()) }
    );

    await act(async () => {
      await result.current.send("the names matter");
    });

    await waitFor(() => expect(result.current.turnActive).toBe(false));

    // No frame in which the settled turn coexists with an active waiting bubble.
    expect(snapshots.filter((s) => s.assistants > 0 && s.turnActive)).toEqual([]);
    // And the streamed text is dropped in that same commit.
    expect(snapshots.filter((s) => s.assistants > 0 && s.streaming > 0)).toEqual([]);
    expect(result.current.replies.filter((r) => r.role === "assistant")).toHaveLength(1);
  });
});
