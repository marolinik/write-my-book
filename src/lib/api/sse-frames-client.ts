/**
 * Browser-side reader for our `data: {json}\n\n` SSE bodies.
 *
 * Extracted from the D5 ghost-text reader so every streamed surface (ghost text,
 * inline edit, discuss turns) reassembles frames through ONE parser: buffering
 * across chunk boundaries, splitting on the `\n\n` record separator, ignoring `:`
 * keepalive comments, skipping malformed records instead of throwing into a
 * render loop, and returning silently when the reader is aborted (the fetch was
 * cancelled) rather than surfacing an AbortError.
 */

/** A decoded SSE frame. Callers narrow on `type`. */
export interface SseFrame {
  type: string;
  [key: string]: unknown;
}

const RECORD_SEPARATOR = "\n\n";

/** Parse one SSE record (which may span several lines) into a frame. */
function parseRecord(record: string): SseFrame | null {
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
        return obj as SseFrame;
      }
    } catch {
      // Malformed frame — skip it rather than throw into the render loop.
      return null;
    }
  }
  return null;
}

export async function* readSseFrames(
  res: Response,
  signal?: AbortSignal
): AsyncGenerator<SseFrame> {
  const body = res.body;
  if (!body) return;
  if (signal?.aborted) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      if (signal?.aborted) return;
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        // Reader AbortError (the fetch was cancelled) — yield nothing more.
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
