import type { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authErrorResponse } from "@/lib/api/legacy-route-errors";

type User = Awaited<ReturnType<typeof requireUser>>;

export type UserOrResponse = { user: User; response?: undefined } | { user?: undefined; response: NextResponse };

/**
 * requireUser for a route with no try/catch of its own: no session is a 401
 * and an auth outage a 503 (P2-24), instead of an escaped error that Next
 * turns into a 500 the client cannot act on. Any other error still throws.
 */
export async function requireUserOrResponse(): Promise<UserOrResponse> {
  try {
    return { user: await requireUser() };
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return { response };
    throw error;
  }
}
