import { writeFrame, keepalive, QUICK_ASSIST_KEEPALIVE_MS } from "@/lib/api/sse-quick-assist";
import { extractQuickAssistText } from "@/lib/llm/quick-assist";
import { createDiscussProseGate } from "./discuss-prose-gate";
import type { GatedDiscussTurn } from "./discuss-llm";

/**
 * D5 — SSE body for a streamed discuss turn.
 *
 * Frame protocol (one `data: {json}\n\n` record each, `: keepalive` comments
 * between):
 *   { type: "text",  text }        prose-safe delta (see discuss-prose-gate)
 *   { type: "done",  …payload }    settled turn: the SAME body the blocking 200
 *                                  returned, plus `raw` for the client's swap
 *   { type: "error", status, … }   terminal failure after the first delta
 *
 * Ordering rules, inherited from the quick-assist engine:
 *  - D-143: the terminal frame is written BEFORE the billing round-trip, so the
 *    settled bubble and its controls never wait on Postgres. A billing failure
 *    yields a delivered-but-unbilled turn (honest direction), never an error
 *    frame after `done`.
 *  - D-142: a client that went away mid-stream settles nothing, persists nothing
 *    and bills nothing — the turn is all-or-nothing, so the 3-exchange cap is
 *    not consumed by a reply no one received.
 *  - D-172: billing stays "one row per turn with usable text", summed across the
 *    doubled-budget retry, and it still runs when persistence fails — that spend
 *    was real either way.
 */

/** The terminal frame the route's settle callback decides on. */
export type DiscussTerminalFrame = Readonly<Record<string, unknown>> & {
  type: "done" | "error";
};

export interface DiscussStreamOptions {
  gated: GatedDiscussTurn;
  signal: AbortSignal;
  /**
   * Route-owned settle: parse the raw reply, persist both turns and any agreed
   * revision, and return the frame to deliver. Runs exactly once, only when the
   * client is still connected and the turn produced usable text.
   */
  onSettle: (rawText: string) => Promise<DiscussTerminalFrame>;
}

const INTERRUPTED_FRAME = {
  type: "error",
  status: 502,
  error: "The editor's reply was interrupted before it finished. Your discussion turn was not used — please try again.",
  retryable: true,
} as const;

const SETTLE_FAILED_FRAME = {
  type: "error",
  status: 500,
  error: "The editor replied, but saving the turn failed. Please reopen the thread to check.",
  retryable: true,
} as const;

export function sseDiscussBody(options: DiscussStreamOptions): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      void pump(controller, encoder, options);
    },
  });
}

async function pump(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  { gated, signal, onSettle }: DiscussStreamOptions
): Promise<void> {
  // Long turns (61-157 s live) can outlast an idle proxy without traffic.
  const heartbeat = setInterval(() => {
    try {
      keepalive(controller, encoder);
    } catch {
      clearInterval(heartbeat);
    }
  }, QUICK_ASSIST_KEEPALIVE_MS);

  const gate = createDiscussProseGate();
  const emit = (delta: string): void => {
    const safe = gate.push(delta);
    if (safe.length > 0) writeFrame(controller, encoder, { type: "text", text: safe });
  };

  try {
    emit(gated.firstText);

    for await (const delta of gated.rest) {
      if (signal.aborted) break;
      emit(delta);
    }

    // Writer left mid-stream: settle nothing, persist nothing, bill nothing.
    if (signal.aborted) {
      safeClose(controller);
      return;
    }

    const final = await gated.final();
    if (signal.aborted) {
      safeClose(controller);
      return;
    }

    const raw = extractQuickAssistText(final.content);
    if (!raw.trim()) {
      // The gate guaranteed a text delta, so this is the rare post-first-text
      // drop where the settled message lost it. Unbilled, nothing persisted.
      writeFrame(controller, encoder, INTERRUPTED_FRAME);
      safeClose(controller);
      return;
    }

    let terminal: DiscussTerminalFrame;
    try {
      terminal = await onSettle(raw);
    } catch (err) {
      console.error("[discuss] settle failed after a delivered stream", err);
      terminal = SETTLE_FAILED_FRAME;
    }
    writeFrame(controller, encoder, terminal);

    // AFTER delivery (D-143a). Usable text was produced, so the provider charged
    // for it whether or not persistence succeeded — bill it either way (D-172).
    try {
      await gated.bill(final.usage);
    } catch (err) {
      console.error("[discuss] billing failed after delivery — turn delivered unbilled", err);
    }
    safeClose(controller);
  } catch (err) {
    // Provider drop AFTER the first delta: terminal error frame, unbilled and
    // unpersisted, so the writer keeps their turn. Suppressed if they left.
    if (!signal.aborted) {
      console.error("[discuss] stream interrupted after first text", err);
      try {
        writeFrame(controller, encoder, INTERRUPTED_FRAME);
      } catch {
        // reader already gone
      }
    }
    safeClose(controller);
  } finally {
    clearInterval(heartbeat);
  }
}

function safeClose(controller: ReadableStreamDefaultController): void {
  try {
    controller.close();
  } catch {
    // already closed by the client
  }
}
