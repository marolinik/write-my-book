import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/settings/onboarding
 * Returns the current user's onboarding status and validated key count.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keyCount = await db.apiKey.count({
      where: { userId: user.id, validatedAt: { not: null } },
    });

    return NextResponse.json({
      onboardingComplete: user.onboardingComplete,
      keyCount,
    });
  } catch (error) {
    console.error("GET /api/settings/onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to load onboarding status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/onboarding
 * Marks onboarding as complete. No API key required — the card-free / key-free
 * on-ramp lets a writer skip setup and start writing on the Free tier (they can
 * connect a BYOK provider later in Settings → API Keys).
 * Sets the wmb_onboarded cookie for Edge middleware detection.
 */
export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
  } catch (error) {
    console.error("POST /api/settings/onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to complete onboarding" },
      { status: 500 }
    );
  }
}
