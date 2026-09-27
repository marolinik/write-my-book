import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FOUNDER_SLOT_CAP, founderSlotsAvailable } from "@/lib/billing/founder-slots";

/**
 * Public endpoint for the pricing page Founder counter.
 * No authentication required — anyone can see how many slots are claimed.
 */
export async function GET() {
  try {
    const claimed = await db.founderSlot.count();

    return NextResponse.json({
      claimed,
      total: FOUNDER_SLOT_CAP,
      // Open slots, never negative: rows claimed before the cap was enforced
      // at the webhook can exceed it.
      available: founderSlotsAvailable(claimed),
    });
  } catch (error) {
    console.error("Founder count error:", error);
    return NextResponse.json(
      { error: "Failed to fetch founder count" },
      { status: 500 }
    );
  }
}
