import type { NextResponse } from "next/server";

/**
 * The cookie the Edge middleware reads to let an onboarded writer past the
 * onboarding gate (src/middleware.ts). It mirrors `users.onboarding_complete`
 * for this one browser, so it can be missing while the database says done:
 * a new device, a private window, cleared cookies, or the year running out.
 */
export const ONBOARDED_COOKIE = "wmb_onboarded";

/**
 * Where a writer the database calls onboarded gets the cookie back. It sits
 * under /onboarding so the middleware's onboarding exemption already covers
 * it — a recovery route behind the gate it recovers from would loop.
 */
export const ONBOARDING_RESUME_PATH = "/onboarding/continue";

/** Writes the cookie on a response. One setter, so every path agrees. */
export function setOnboardedCookie(response: NextResponse): void {
  response.cookies.set(ONBOARDED_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}
