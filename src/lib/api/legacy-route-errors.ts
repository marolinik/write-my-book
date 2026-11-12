import { NextResponse } from "next/server";
import { AuthUnavailableError } from "@/lib/auth/errors";

/**
 * The answer for a failed user lookup, or null when the error is something
 * else. No user is 401 (the client sends the writer to sign in); a Clerk or
 * database outage during the lookup is 503, never 401, or the writer loops
 * through /login while the real fault is the outage (P1-2).
 */
export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthUnavailableError) {
    console.error("[auth] user lookup unavailable:", error.message);
    return NextResponse.json(
      { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" },
      { status: 503 }
    );
  }
  if ((error as Error)?.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Honest error classification for the legacy hand-validated style routes
 * (D-14). Their previous blanket `catch { return 401 }` mislabeled every
 * non-auth failure — including Prisma client-side validation errors thrown
 * for wrong-typed fields — as "Unauthorized", which can push clients into a
 * bogus re-login flow.
 *
 * - auth failure (requireUser throws "Unauthorized") → 401; auth outage → 503
 * - PrismaClientValidationError (wrong-typed input reaching the client) → 400
 * - anything else → logged server-side, a fixed 500 (no internals leaked)
 */
export function legacyRouteErrorResponse(
  error: unknown,
  label: string,
  fallbackMessage: string
): NextResponse {
  const auth = authErrorResponse(error);
  if (auth) return auth;
  if ((error as Error)?.name === "PrismaClientValidationError") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  console.error(`${label} error:`, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
