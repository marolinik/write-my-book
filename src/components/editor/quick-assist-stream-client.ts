/**
 * D5 — client reader for the ghost-text first-text-gate SSE.
 *
 * Consumes `res.body` with a ReadableStream reader + TextDecoder, buffers across
 * chunk boundaries, splits on the `\n\n` record separator, ignores `:` keepalive
 * comment lines, and yields discriminated token / done / error frames. Robust to
 * a frame split across two reads and to multiple frames in one read. Returns
 * silently on a reader AbortError (typing resumed → the fetch was aborted).
 */

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

const RECORD_SEPARATOR = "\n\n";

/** Parse one SSE record (which may span several lines) into a frame. */
function parseRecord(record: string): QuickAssistFrame | null {
  for (const line of record.split("\n")) {
    const trimmed = line.replace(/^\s+/, "");
    // `:` comment lines (keepalive) carry no data.
    if (trimmed.startsWith(":")) continue;
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice("data:".length).trim();
    if (!payload) continue;
    try {
      const obj: unknown = JSON.parse(payload);
      if (
        obj &&
        typeof obj === "object" &&
        typeof (obj as { type?: unknown }).type === "string"
      ) {
        return obj as QuickAssistFrame;
      }
    } catch {
      // Malformed frame — skip it rather than throw into the render loop.
      return null;
    }
  }
  return null;
}

export async function* readQuickAssistFrames(
  res: Response,
  signal: AbortSignal
): AsyncGenerator<QuickAssistFrame> {
  const body = res.body;
  if (!body) return;
  if (signal.aborted) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      if (signal.aborted) return;
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        // Reader AbortError (typing resumed) — swallow, yield nothing more.
        return;
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });

      let sep = buffer.indexOf(RECORD_SEPARATOR);
      while (sep !== -1) {
        const record = buffer.slice(0, sep);
        buffer = buffer.slice(sep + RECORD_SEPARATOR.length);
        const frame = parseRecord(record);
        if (frame) yield frame;
        sep = buffer.indexOf(RECORD_SEPARATOR);
      }
    }
    // Flush any trailing partial record (server closed without final \n\n).
    const tail = parseRecord(buffer);
    if (tail) yield tail;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // reader already released / stream errored
    }
  }
}
