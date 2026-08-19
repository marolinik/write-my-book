/**
 * D5 — shared SSE substrate for the quick-assist first-text-gate stream.
 *
 * The agent SSE route (`agent/[sessionId]/stream/route.ts`) already ships the
 * `data: {json}\n\n` + `: keepalive\n\n` idiom, but its headers (L22-26) carry
 * only Content-Type/Cache-Control/Connection. Streaming token-1 fast through a
 * proxy/CDN additionally requires `X-Accel-Buffering: no` and `no-transform`
 * (NOT present in the agent route), so those are ADDED here, not copied.
 *
 * Small on purpose: reused by the ghost route (Stage 1) and inline (Stage 2).
 */

/**
 * Quick-assist SSE response headers. `X-Accel-Buffering: no` defeats
 * proxy/CDN buffering so the first token frame flushes immediately; the
 * `no-transform` on Cache-Control stops intermediaries rewriting the body.
 */
export const QUICK_ASSIST_SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/** Minimal ReadableStream controller surface these helpers write through. */
interface FrameSink {
  enqueue(chunk: Uint8Array): void;
}

/**
 * Write one discriminated `data: {json}\n\n` frame. Immutable: the object is
 * serialised as-is and never mutated. Enqueue can throw once the client has
 * closed the reader — callers wrap this in try/catch at terminal points.
 */
export function writeFrame(
  controller: FrameSink,
  encoder: TextEncoder,
  frame: Readonly<Record<string, unknown>>
): void {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
}

/**
 * Write a `: keepalive\n\n` SSE comment (ignored by the client frame reader).
 * Reused verbatim from the agent route's 15s heartbeat convention.
 */
export function keepalive(controller: FrameSink, encoder: TextEncoder): void {
  controller.enqueue(encoder.encode(`: keepalive\n\n`));
}

/** Heartbeat cadence — same 15s the agent SSE route uses. */
export const QUICK_ASSIST_KEEPALIVE_MS = 15_000;
