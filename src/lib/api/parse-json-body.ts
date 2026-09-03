import { NextResponse } from "next/server";

/** Thrown when a request body cannot be parsed as JSON. Routes translate it
 *  into the standard 400 envelope via invalidJsonBodyResponse — pre-fix every
 *  unguarded `await req.json()` surfaced the runtime SyntaxError as a raw 500
 *  (D-01). */
export class InvalidJsonBodyError extends Error {
  constructor(message = "Invalid JSON body") {
    super(message);
    this.name = "InvalidJsonBodyError";
  }
}

/** Thrown when a body exceeds the parse-time ceiling. Mapped to 413 by
 *  invalidJsonBodyResponse. M3 hardening: App Router buffers `req.json()`
 *  with NO size limit, so one authenticated POST of hundreds of megabytes
 *  used to reach the heap before Zod ever saw it. Zod string caps apply AFTER
 *  the parse — they cannot protect against parse-time memory. */
export class BodyTooLargeError extends Error {
  constructor(message = "Request body too large") {
    super(message);
    this.name = "BodyTooLargeError";
  }
}

/** Ceiling for JSON request bodies. Comfortably above every real payload
 *  (chapter content caps at 2 MB in validation.ts) while keeping worst-case
 *  concurrent buffering bounded. Uploads go through multipart routes, which
 *  have their own size gates. */
export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024;

/** Parse a request's JSON body. Malformed (or empty) bodies throw the typed
 *  InvalidJsonBodyError instead of a bare SyntaxError; oversized bodies throw
 *  BodyTooLargeError BEFORE and DURING the read (declared length + streamed
 *  byte ceiling). The payload is returned as `unknown` — schema validation
 *  stays with the caller. */
export async function parseJsonBody(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BODY_BYTES) throw new BodyTooLargeError();

  if (!req.body) {
    // No stream to cap (GET-style or mocked requests in tests): fall back to
    // the plain parse — same typed-error contract as before.
    try {
      return await req.json();
    } catch {
      throw new InvalidJsonBodyError();
    }
  }

  try {
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_JSON_BODY_BYTES) {
          await reader.cancel().catch(() => {});
          throw new BodyTooLargeError();
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    const text = new TextDecoder("utf-8").decode(merged);
    if (text.length === 0) throw new InvalidJsonBodyError();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw error;
    throw new InvalidJsonBodyError();
  }
}

/** Convert InvalidJsonBodyError / BodyTooLargeError into the app's standard
 *  error envelope (`{ error }` + status, matching the routes' ZodError
 *  handling). Returns null for any other error so catch blocks fall through
 *  to their own handling. The name checks keep the mapping robust when the
 *  module is mocked in route tests (mirrors the routes' ZodError name
 *  checks). */
export function invalidJsonBodyResponse(error: unknown): NextResponse | null {
  const name = (error as Error)?.name;
  const isInvalidJson =
    error instanceof InvalidJsonBodyError || name === "InvalidJsonBodyError";
  if (isInvalidJson) {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }
  const isTooLarge =
    error instanceof BodyTooLargeError || name === "BodyTooLargeError";
  if (isTooLarge) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }
  return null;
}
