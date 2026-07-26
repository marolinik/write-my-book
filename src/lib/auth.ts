	import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { db } from "./db";

const E2E_TEST_SECRET = process.env.E2E_TEST_SECRET;
const E2E_TEST_CLERK_ID = "user_test_e2e";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured =
  clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");

/**
 * Get or create the database user from Clerk session.
 * In E2E test mode (non-production), falls back to the seeded test user.
 */
export async function getDbUser() {
  // Only attempt Clerk auth when properly configured
  if (isClerkConfigured) {
    try {
      const { userId } = await auth();

      if (userId) {
        let user = await db.user.findUnique({
          where: { clerkId: userId },
        });

        if (!user) {
          const clerkUser = await currentUser();
          if (!clerkUser) return null;

          user = await db.user.create({
            data: {
              clerkId: userId,
              email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
              displayName:
                clerkUser.firstName && clerkUser.lastName
                  ? `${clerkUser.firstName} ${clerkUser.lastName}`
                  : clerkUser.username ?? "Writer",
            },
          });
        }

        return user;
      }
    } catch {
      // clerkMiddleware() didn't run or Clerk is misconfigured — fall through
    }
  }

  // E2E test bypass: checked BEFORE the dev bypass so Playwright traffic
  // (which always carries the header) maps to the e2e user that
  // global-setup cleans per run — otherwise test data accumulates under
  // the dev-bypass user and fixed-name fixtures 409 across runs.
  if (process.env.NODE_ENV !== "production" && E2E_TEST_SECRET) {
    const headersList = await headers();
    if (headersList.get("x-e2e-test-secret") === E2E_TEST_SECRET) {
      // Optional persona selector for the bulletproof-QA campaign: a request may
      // act as any pre-seeded QA persona user (clerkId `user_qa_*`) so per-persona
      // isolation and cross-tenant checks are testable over real HTTP. Prefix-
      // guarded so a leaked secret still cannot impersonate an arbitrary clerkId,
      // and the whole branch is already NODE_ENV!=="production" + secret-gated.
      const requestedClerkId = headersList.get("x-e2e-clerk-id");
      const clerkId =
        requestedClerkId && requestedClerkId.startsWith("user_qa_")
          ? requestedClerkId
          : E2E_TEST_CLERK_ID;
      return db.user.findUnique({
        where: { clerkId },
      });
    }
  }

  // DEV_AUTH_BYPASS: use DEV_CLERK_ID user without Clerk in development
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTH_BYPASS === "true" &&
    process.env.DEV_CLERK_ID
  ) {
    const devUser = await db.user.findUnique({
      where: { clerkId: process.env.DEV_CLERK_ID },
    });
    if (devUser) return devUser;

    // Auto-create the dev user if it doesn't exist
    const devName = process.env.DEV_AUTH_USER_NAME ?? "Dev Writer";
    // D-153: email must derive from DEV_CLERK_ID — a hardcoded literal
    // P2002-collided on the unique email for any second dev identity; and
    // onboardingComplete must be overridable — hardcoded true made the cold
    // onboarding funnel uncapturable in QA (absent DEV_ONBOARDING_COMPLETE = true).
    return db.user.upsert({
      where: { clerkId: process.env.DEV_CLERK_ID },
      update: {},
      create: {
        clerkId: process.env.DEV_CLERK_ID,
        email: `${process.env.DEV_CLERK_ID}@writemybook.local`,
        displayName: devName,
        onboardingComplete: process.env.DEV_ONBOARDING_COMPLETE !== "false",
      },
    });
  }

  return null;
}

/**
 * Require authenticated user or throw.
 */
export async function requireUser() {
  const user = await getDbUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}
