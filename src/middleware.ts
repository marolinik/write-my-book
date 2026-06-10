import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/privacy",
  "/terms",
  "/api/auth/webhook",
  "/api/billing/webhook",
  "/api/health(.*)",
]);

/**
 * Routes that require auth but are exempt from the onboarding gate.
 * These must be accessible during the onboarding wizard itself.
 */
const isOnboardingExemptRoute = createRouteMatcher([
  "/onboarding(.*)",
  "/api/settings/onboarding",
  "/api/settings/api-keys(.*)",
]);

const E2E_TEST_SECRET = process.env.E2E_TEST_SECRET;

function isE2ETestRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!E2E_TEST_SECRET) return false;
  return request.headers.get("x-e2e-test-secret") === E2E_TEST_SECRET;
}

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isProduction = process.env.NODE_ENV === "production";
const isClerkConfigured =
  Boolean(clerkKey?.trim()) &&
  !/placeholder|changeme|replace_me|ci-placeholder|your[_-]|example/i.test(clerkKey ?? "");

const DEV_AUTH_BYPASS =
  !isProduction && process.env["DEV_AUTH_BYPASS"] === "true";

function authMisconfiguredMiddleware(request: NextRequest) {
  if (isPublicRoute(request)) return NextResponse.next();
  return NextResponse.json(
    { error: "Authentication is not configured" },
    { status: isProduction ? 503 : 401 }
  );
}

const handler =
  DEV_AUTH_BYPASS
    ? function devBypassMiddleware() {
        // Skip onboarding check entirely in dev bypass mode
        return NextResponse.next();
      }
    : isClerkConfigured
      ? clerkMiddleware(async (auth, request) => {
          if (isE2ETestRequest(request)) {
            return NextResponse.next();
          }

          if (!isPublicRoute(request)) {
            await auth.protect();

            // Onboarding gate: redirect to /onboarding if user hasn't completed it.
            // Uses cookie to avoid DB queries in Edge runtime.
            if (!isOnboardingExemptRoute(request)) {
              const onboarded = request.cookies.get("wmb_onboarded")?.value;
              if (onboarded !== "1") {
                const url = request.nextUrl.clone();
                url.pathname = "/onboarding";
                return NextResponse.redirect(url);
              }
            }
          }
        })
      : authMisconfiguredMiddleware;

export default handler;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
