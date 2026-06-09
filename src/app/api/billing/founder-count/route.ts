import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Public endpoint for the pricing page Founder counter.
 * No authentication required — anyone can see how many slots are claimed.
 */
export async function GET() {
  try {
    const claimed = await db.founderSlot.count();
    const total = 200;

    return NextResponse.json({
      claimed,
      total,
      available: total - claimed,
    });
  } catch (error) {
    console.error("Founder count error:", error);
    return NextResponse.json(
      { error: "Failed to fetch founder count" },
      { status: 500 }
    );
  }
}
