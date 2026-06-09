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
    return db.user.upsert({
      where: { clerkId: process.env.DEV_CLERK_ID },
      update: {},
      create: {
        clerkId: process.env.DEV_CLERK_ID,
        email: "dev@writemybook.local",
        displayName: devName,
        onboardingComplete: true,
      },
    });
  }

// E2E test fallback: bypass auth in non-production when header matches
  if (process.env.NODE_ENV !== "production" && E2E_TEST_SECRET) {
    const headersList = await headers();
    if (headersList.get("x-e2e-test-secret") === E2E_TEST_SECRET) {
      return db.user.findUnique({
        where: { clerkId: E2E_TEST_CLERK_ID },
      });
    }
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
