import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { db } from "./db";

const E2E_TEST_SECRET = process.env.E2E_TEST_SECRET;
const E2E_TEST_CLERK_ID = "user_test_e2e";

/**
 * Get or create the database user from Clerk session.
 * In E2E test mode (non-production), falls back to the seeded test user.
 */
export async function getDbUser() {
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
