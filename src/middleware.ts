import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/api/auth/webhook",
  "/api/billing/webhook",
  "/api/health",
]);

const E2E_TEST_SECRET = process.env.E2E_TEST_SECRET;

function isE2ETestRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!E2E_TEST_SECRET) return false;
  return request.headers.get("x-e2e-test-secret") === E2E_TEST_SECRET;
}

export default clerkMiddleware(async (auth, request) => {
  if (isE2ETestRequest(request)) {
    return NextResponse.next();
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
