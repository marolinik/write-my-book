import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/settings/onboarding
 * Returns the current user's onboarding status and validated key count.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const keyCount = await db.apiKey.count({
      where: { userId: user.id, validatedAt: { not: null } },
    });

    return NextResponse.json({
      onboardingComplete: user.onboardingComplete,
      keyCount,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * POST /api/settings/onboarding
 * Marks onboarding as complete. Requires at least one validated API key.
 * Sets the wmb_onboarded cookie for Edge middleware detection.
 */
export async function POST() {
  try {
    const user = await requireUser();

    // Verify at least one validated key exists
    const keyCount = await db.apiKey.count({
      where: { userId: user.id, validatedAt: { not: null } },
    });

    if (keyCount === 0) {
      return NextResponse.json(
        { error: "Add at least one valid API key first" },
        { status: 400 }
      );
    }

    // Mark onboarding complete in DB
    await db.user.update({
      where: { id: user.id },
      data: { onboardingComplete: true },
    });

    // Set cookie for Edge middleware (1 year, HttpOnly, SameSite=Lax)
    const response = NextResponse.json({ success: true });
    response.cookies.set("wmb_onboarded", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
