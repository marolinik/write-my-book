/**
 * D5 — client reader for the ghost-text first-text-gate SSE.
 *
 * Thin typed wrapper over the shared `readSseFrames` substrate
 * (src/lib/api/sse-frames-client.ts): the reassembly rules — buffering across
 * chunk boundaries, the `\n\n` record separator, ignored `:` keepalive comments,
 * skipped malformed records, silent return on a reader AbortError (typing resumed
 * → the fetch was aborted) — now live in one place shared with the streamed
 * discuss turn, so the two surfaces cannot drift.
 */

import { readSseFrames } from "@/lib/api/sse-frames-client";

export interface QuickAssistFrame {
  type: "token" | "done" | "error";
  /** Present on token (delta) and done (canonical full suggestion). */
  text?: string;
  /** Measured latency, present on the done frame. */
  elapsedMs?: number;
  /** Error frame fields — byte-compatible with the HTTP error bodies so
   *  quickAssistErrorNotice maps them unchanged. */
  status?: number;
  error?: string;
  code?: string;
  retryable?: boolean;
  upgradeToTier?: string;
}

export async function* readQuickAssistFrames(
  res: Response,
  signal: AbortSignal
): AsyncGenerator<QuickAssistFrame> {
  for await (const frame of readSseFrames(res, signal)) {
    yield frame as QuickAssistFrame;
  }
}
