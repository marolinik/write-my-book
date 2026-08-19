import { NextResponse } from "next/server";

/**
 * Honest error classification for the legacy hand-validated style routes
 * (D-14). Their previous blanket `catch { return 401 }` mislabeled every
 * non-auth failure — including Prisma client-side validation errors thrown
 * for wrong-typed fields — as "Unauthorized", which can push clients into a
 * bogus re-login flow.
 *
 * - auth failure (requireUser throws "Unauthorized") → 401
 * - PrismaClientValidationError (wrong-typed input reaching the client) → 400
 * - anything else → logged server-side, generic 500 (no internals leaked)
 */
export function legacyRouteErrorResponse(
  error: unknown,
  label: string,
  fallbackMessage: string
): NextResponse {
  if ((error as Error)?.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((error as Error)?.name === "PrismaClientValidationError") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  console.error(`${label} error:`, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
