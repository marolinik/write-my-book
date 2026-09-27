import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { setOnboardedCookie } from "@/lib/onboarding-cookie";

/** A same-origin redirect with a relative Location. req.nextUrl.origin can be
 *  the container's bind address (http://0.0.0.0:3000), which the browser
 *  cannot open; a relative Location resolves against the address the writer
 *  actually used. */
function redirectTo(pathname: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: pathname } });
}

/**
 * GET /onboarding/continue — the "Open dashboard" link for a writer whose
 * onboarding is done in the database but whose browser has no wmb_onboarded
 * cookie (UAT P5-S09). The middleware gate reads only the cookie, so without
 * this the writer bounced between /dashboard and /onboarding forever.
 *
 * Reached by a click, never by a redirect: if the browser refuses the cookie,
 * an automatic hop back to the dashboard would loop (f5ab909). The cookie
 * only mirrors the database, so a writer who has not finished is sent to the
 * wizard without it.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return redirectTo("/login");
  }

  if (!user.onboardingComplete) {
    return redirectTo("/onboarding");
  }

  const response = redirectTo("/dashboard");
  setOnboardedCookie(response);
  return response;
}
