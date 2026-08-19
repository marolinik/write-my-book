/**
 * D5 — the ghost-first first-text-gate + the SSE body builder.
 *
 * The gate consumes the provider MessageStream SERVER-SIDE and does not let the
 * route commit an HTTP status until it knows whether usable text exists:
 *  - first real text delta  → ok:true; the route returns 200 text/event-stream
 *    and `sseQuickAssistBody` pumps token frames + a canonical `done` frame;
 *  - stream ends with no text → ok:false (reasoning-only / cut-off); the route
 *    returns the historical 422/502 JSON BEFORE any byte flushes.
 * This is strictly more honest than committing 200 up front — a real HTTP
 * status is preserved while streaming (the TRUST axis owning the D5 4.0 low).
 *
 * Channel isolation (spec §9): only `content_block_delta` with
 * `delta.type === "text_delta"` is forwarded; `thinking_delta` /
 * `redacted_thinking` are dropped — streamed reasoning is never rendered.
 */

import { db } from "@/lib/db";
import { estimateCost } from "@/lib/cost";
import { recordDailyUse } from "@/lib/billing/free-tier-meters";
import { settleQuickAssist } from "@/lib/llm/quick-assist";
import type { ModelDefinition } from "@/lib/llm";
import {
  writeFrame,
  keepalive,
  QUICK_ASSIST_KEEPALIVE_MS,
} from "@/lib/api/sse-quick-assist";

// ── Structural stream surface (satisfied by the SDK MessageStream + fakes) ──

/** Cumulative usage as it rides on message_start / message_delta events. */
interface StreamUsageLike {
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * A single streamed event — loose enough that the SDK union is assignable.
 * D-143: `message.usage` (message_start), plus top-level `usage` and
 * `delta.stop_reason` (message_delta), are read so the SSE pump can settle the
 * moment `message_stop` lands — instead of awaiting `finalMessage()`, which
 * resolves only on the SDK 'end' event (the underlying HTTP body close). On the
 * OpenRouter route that close was observed lagging ~4.4s behind the last
 * visible token: the accept-arming dead-zone this defect is about.
 */
interface StreamEventLike {
  type: string;
  delta?:
    | { type?: string; text?: string; stop_reason?: string | null }
    | undefined;
  message?: { usage?: StreamUsageLike } | undefined;
  usage?: StreamUsageLike | undefined;
}

/** The subset of `finalMessage()` the settle decision + billing read. */
interface FinalMessageLike {
  content: readonly { type: string; text?: unknown }[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * The MessageStream surface the gate depends on. The concrete
 * `@anthropic-ai/sdk` `MessageStream` is structurally assignable (it has more).
 */
export interface QuickAssistMessageStream {
  [Symbol.asyncIterator](): AsyncIterator<StreamEventLike>;
  finalMessage(): Promise<FinalMessageLike>;
  abort(): void;
}

/** A gated stream, past the first real text delta. */
export interface GatedStream {
  /** ≥1 non-empty text delta already received (accumulated). */
  firstText: string;
  /** Subsequent TEXT deltas only (thinking dropped). */
  rest: AsyncGenerator<string>;
  /** Authoritative usage / stop_reason / content. */
  final: () => Promise<FinalMessageLike>;
}

export type GateResult =
  | { ok: true; gated: GatedStream }
  | { ok: false; reasoningOnly: boolean; truncated: boolean };

/** Billing/identity context threaded into the SSE body. */
export interface QuickAssistStreamMeta {
  userId: string;
  bookId: string;
  model: ModelDefinition;
  isFree: boolean;
  startedAt: number;
}

/** True for a forwardable text delta; false for thinking / non-delta events. */
function isTextDelta(
  event: StreamEventLike
): event is { type: "content_block_delta"; delta: { type: "text_delta"; text: string } } {
  return (
    event.type === "content_block_delta" &&
    event.delta?.type === "text_delta" &&
    typeof event.delta.text === "string"
  );
}

/**
 * D-143 settle accumulator — folded from the streamed lifecycle events so the
 * pump can compute settle + billing WITHOUT awaiting the SDK's finalMessage().
 * finalMessage() resolves only on the SDK 'end' event, which fires after the
 * underlying HTTP body closes — the ~4.4s post-last-token accept-arming
 * dead-zone. Everything settle needs (full text, usage, stop_reason) is known
 * by `message_stop`, so capturing it as it streams collapses that dead-zone.
 */
interface StreamSettleAccumulator {
  /** firstText + every subsequent text delta (the full suggestion). */
  text: string;
  /** input_tokens from message_start (overridden by message_delta if present). */
  inputTokens: number;
  /** cumulative output_tokens from the final message_delta. */
  outputTokens: number;
  /** stop_reason from message_delta. */
  stopReason: string | null;
  /** Latched true at message_stop — the stream produced a complete message, so
   *  settle is safe to derive from this accumulator instead of finalMessage(). */
  completed: boolean;
}

/**
 * Fold one NON-text lifecycle event into the settle accumulator, mirroring the
 * SDK's own usage accumulation (MessageStream #accumulateMessage): input_tokens
 * from message_start then overridden by message_delta if present; output_tokens
 * + stop_reason from message_delta; completion latched at message_stop. Text
 * deltas are accumulated by the callers (gate + rest), never here.
 */
function foldSettleEvent(
  acc: StreamSettleAccumulator,
  event: StreamEventLike
): void {
  if (event.type === "message_start") {
    const usage = event.message?.usage;
    if (usage) {
      if (typeof usage.input_tokens === "number") acc.inputTokens = usage.input_tokens;
      if (typeof usage.output_tokens === "number") acc.outputTokens = usage.output_tokens;
    }
    return;
  }
  if (event.type === "message_delta") {
    if (event.delta && event.delta.stop_reason !== undefined) {
      acc.stopReason = event.delta.stop_reason;
    }
    const usage = event.usage;
    if (usage) {
      if (typeof usage.output_tokens === "number") acc.outputTokens = usage.output_tokens;
      if (typeof usage.input_tokens === "number") acc.inputTokens = usage.input_tokens;
    }
    return;
  }
  if (event.type === "message_stop") {
    acc.completed = true;
  }
}

/**
 * The gated stream's authoritative settle. D-143: when the stream completed
 * (message_stop observed) settle derives from the accumulator with NO await on
 * finalMessage() — the fast path that arms accept promptly. When the stream
 * ended WITHOUT message_stop (post-first-text provider drop / early close),
 * defer to the SDK finalMessage(), preserving the historical
 * reject → 502-error-frame, unbilled behaviour byte-for-byte.
 */
function makeSettle(
  stream: QuickAssistMessageStream,
  acc: StreamSettleAccumulator
): () => Promise<FinalMessageLike> {
  return async () => {
    if (acc.completed) {
      return {
        content: [{ type: "text", text: acc.text }],
        stop_reason: acc.stopReason,
        usage: {
          input_tokens: acc.inputTokens,
          output_tokens: acc.outputTokens,
        },
      };
    }
    return stream.finalMessage();
  };
}

/** Classify a no-text stream end via the shared settle decision. */
function classifyNoText(final: FinalMessageLike): GateResult {
  const settle = settleQuickAssist(final.content, final.stop_reason);
  if (settle.kind === "reasoning-only") {
    return { ok: false, reasoningOnly: true, truncated: false };
  }
  if (settle.kind === "empty") {
    return { ok: false, reasoningOnly: false, truncated: settle.truncated };
  }
  // Defensive: finalMessage carried text yet no delta was ever seen (SDK
  // inconsistency). There is no way to stream it now — treat as empty.
  return { ok: false, reasoningOnly: false, truncated: false };
}

/**
 * The first-text gate. Iterates the SAME async iterator it later hands to
 * `rest`, so the stream is never re-opened or double-consumed. Resolves on the
 * first delta whose accumulated text has a non-whitespace char (leading
 * whitespace is preserved and included in `firstText`).
 */
export async function gateQuickAssistStream(
  stream: QuickAssistMessageStream,
  signal: AbortSignal
): Promise<GateResult> {
  const iterator = stream[Symbol.asyncIterator]();
  // D-143: fold lifecycle events (usage/stop_reason) as they pass so the SSE
  // pump can settle at message_stop without awaiting finalMessage().
  const acc: StreamSettleAccumulator = {
    text: "",
    inputTokens: 0,
    outputTokens: 0,
    stopReason: null,
    completed: false,
  };
  let buffer = "";

  for (;;) {
    if (signal.aborted) {
      // D-142: cancel upstream so the writer isn't billed BYOK tokens for a
      // suggestion they will never see. The route checks signal.aborted and
      // answers 499; this branch just makes sure we stop the provider.
      stream.abort();
      return { ok: false, reasoningOnly: false, truncated: false };
    }
    let step: IteratorResult<StreamEventLike>;
    try {
      step = await iterator.next();
    } catch (err) {
      if (signal.aborted) {
        stream.abort();
        return { ok: false, reasoningOnly: false, truncated: false };
      }
      // Provider error BEFORE first text — no body has flushed. Re-throw so the
      // route's stream-attempt catch degrades to the non-streaming create()
      // fallback (worst case = today's behaviour).
      throw err;
    }
    if (step.done) break;
    if (isTextDelta(step.value)) {
      buffer += step.value.delta.text;
      if (buffer.trim().length > 0) {
        acc.text = buffer;
        return {
          ok: true,
          gated: {
            firstText: buffer,
            rest: makeRest(iterator, signal, acc),
            final: makeSettle(stream, acc),
          },
        };
      }
    } else {
      // thinking_delta / redacted_thinking / non-delta events are dropped from
      // the TEXT channel — but message_start still carries input_tokens (D-143).
      foldSettleEvent(acc, step.value);
    }
  }

  const final = await stream.finalMessage();
  return classifyNoText(final);
}

/**
 * Continue the SAME iterator, yielding only subsequent text deltas while folding
 * the lifecycle events into `acc`. D-143: returns the instant `message_stop`
 * lands so the pump never drains to the lagging SDK 'end' event (HTTP close) —
 * the accept-arming dead-zone.
 */
async function* makeRest(
  iterator: AsyncIterator<StreamEventLike>,
  signal: AbortSignal,
  acc: StreamSettleAccumulator
): AsyncGenerator<string> {
  for (;;) {
    if (signal.aborted) return;
    let step: IteratorResult<StreamEventLike>;
    try {
      step = await iterator.next();
    } catch {
      // Abort or post-first-text provider drop — stop yielding; `acc.completed`
      // stays false so the settle defers to finalMessage() (→ 502, unbilled).
      return;
    }
    if (step.done) return;
    if (isTextDelta(step.value)) {
      acc.text += step.value.delta.text;
      yield step.value.delta.text;
    } else {
      foldSettleEvent(acc, step.value);
      // D-143: the message is complete — settle is fully known. Return now
      // rather than block on the lagging 'end' event (the ~4.4s dead-zone).
      if (acc.completed) return;
    }
  }
}

// ── SSE body builder (bill-at-settle) ──────────────────────────────────────

/**
 * BILLING DECISION TABLE (D-04/D-36/D-38 intent preserved — spec §6):
 *   usage_record.create + free-meter tick advance ONLY at settle, with non-empty
 *   text, and ONLY when !signal.aborted (bill-at-settle, bill-once). The write
 *   merely RELOCATED from after create() to here, after await gated.final(),
 *   computed on final.usage, gated on settle.kind === "ok" && !signal.aborted.
 *   D-143(a): the write now also runs AFTER the done frame is delivered —
 *   delivery never waits on billing, and a billing failure yields a
 *   delivered-but-unbilled suggestion (the honest direction), never a lie.
 *   - client abort mid-stream (tokens seen, before done): NEITHER a usage_record
 *     NOR a meter tick. Accept is arm-gated on `done`, so no fragment the writer
 *     could act on was ever delivered; advancing a free user's meter for a
 *     suggestion they never completed would be dishonest.
 *   - post-first-text provider drop: a single terminal `error` frame, UNBILLED
 *     (accept never armed → nothing acceptable was delivered).
 * The unavoidable residual we DISCLOSE not hide: the provider may still charge
 * the user's OWN key for the handful of pre-cancellation tokens — that never
 * touches our meter or usage_record.
 */
export function sseQuickAssistBody(
  gated: GatedStream,
  signal: AbortSignal,
  meta: QuickAssistStreamMeta
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      void pump(controller, encoder, gated, signal, meta);
    },
  });
}

async function pump(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  gated: GatedStream,
  signal: AbortSignal,
  meta: QuickAssistStreamMeta
): Promise<void> {
  // A provider slower than the 15s heartbeat keeps proxies/CDNs from closing
  // the connection. Cleared the instant the pump settles (well under the 12s
  // server timeout), so it never fires on a normal fast suggestion.
  const heartbeat = setInterval(() => {
    try {
      keepalive(controller, encoder);
    } catch {
      clearInterval(heartbeat);
    }
  }, QUICK_ASSIST_KEEPALIVE_MS);

  try {
    writeFrame(controller, encoder, { type: "token", text: gated.firstText });

    for await (const delta of gated.rest) {
      if (signal.aborted) break;
      if (delta.length > 0) {
        writeFrame(controller, encoder, { type: "token", text: delta });
      }
    }

    // Client bailed mid-stream — truncate, do NOT bill (spec §6).
    if (signal.aborted) {
      safeClose(controller);
      return;
    }

    const final = await gated.final();

    // Abort resolved during finalMessage() — still unbilled.
    if (signal.aborted) {
      safeClose(controller);
      return;
    }

    const settle = settleQuickAssist(final.content, final.stop_reason);
    if (settle.kind === "ok") {
      // D-143(a): DELIVER the canonical done frame (spec §1) — which ARMS
      // accept on the client — BEFORE the billing DB round-trips. Accept-arming
      // must not wait on Postgres; the writer sat in a dead-zone tapping an
      // inert, complete-looking suggestion while two awaited writes ran. The
      // client swaps its accumulated deltas for `text` before arming accept.
      writeFrame(controller, encoder, {
        type: "done",
        text: settle.text,
        elapsedMs: Date.now() - meta.startedAt,
        usage: {
          input_tokens: final.usage.input_tokens,
          output_tokens: final.usage.output_tokens,
        },
      });
      // Bill-at-settle, bill-once. Gating is UNCHANGED: this branch is reached
      // only when settle.kind === "ok" && !signal.aborted (guarded above). The
      // writes merely RELOCATED to after delivery.
      try {
        const cost = estimateCost(
          meta.model.id,
          final.usage.input_tokens,
          final.usage.output_tokens
        );
        await db.usageRecord.create({
          data: {
            userId: meta.userId,
            bookId: meta.bookId,
            agentType: "ghost-text",
            model: meta.model.id,
            tokensInput: final.usage.input_tokens,
            tokensOutput: final.usage.output_tokens,
            costEstimate: cost,
          },
        });
        if (meta.isFree) {
          await recordDailyUse(meta.userId, "ghost");
        }
      } catch {
        // D-143(a): billing failed AFTER the suggestion was delivered. Emitting
        // an error frame now would be a lie (the writer already holds a usable,
        // armed suggestion); leaving it unbilled is the honest failure
        // direction. Swallowed here so the post-first-text catch below (which
        // would write a 502) can never fire once `done` has shipped.
      }
    } else {
      // The gate guaranteed a first text delta, so this is the rare
      // post-first-text drop where finalMessage lost the text — unbilled.
      writeFrame(controller, encoder, {
        type: "error",
        status: 502,
        error:
          "The suggestion stream ended without a complete result. Please try again.",
        retryable: true,
      });
    }
    safeClose(controller);
  } catch {
    // Provider drop AFTER the first text delta — terminal error frame, unbilled
    // (accept was never armed). Suppressed if the client already aborted.
    if (!signal.aborted) {
      try {
        writeFrame(controller, encoder, {
          type: "error",
          status: 502,
          error: "The suggestion stream was interrupted. Please try again.",
          retryable: true,
        });
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
