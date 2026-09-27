import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { setOnboardedCookie } from "@/lib/onboarding-cookie";

function redirectTo(req: NextRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url, 303);
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
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return redirectTo(req, "/login");
  }

  if (!user.onboardingComplete) {
    return redirectTo(req, "/onboarding");
  }

  const response = redirectTo(req, "/dashboard");
  setOnboardedCookie(response);
  return response;
}
