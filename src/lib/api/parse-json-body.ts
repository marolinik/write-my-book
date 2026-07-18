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

/** Parse a request's JSON body. Malformed (or empty) bodies throw the typed
 *  InvalidJsonBodyError instead of a bare SyntaxError; the payload is returned
 *  as `unknown` — schema validation stays with the caller. */
export async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
}

/** Convert InvalidJsonBodyError into the app's standard 400 error envelope
 *  (`{ error }` + status, matching the routes' ZodError handling). Returns
 *  null for any other error so catch blocks fall through to their own
 *  handling. The name check keeps the mapping robust when the module is
 *  mocked in route tests (mirrors the routes' ZodError name checks). */
export function invalidJsonBodyResponse(error: unknown): NextResponse | null {
  const isInvalidJson =
    error instanceof InvalidJsonBodyError ||
    (error as Error)?.name === "InvalidJsonBodyError";
  if (!isInvalidJson) return null;
  return NextResponse.json(
    { error: "Invalid JSON in request body" },
    { status: 400 }
  );
}
