import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Clerk webhook handler for user lifecycle events. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    switch (type) {
      case "user.created": {
        await db.user.upsert({
          where: { clerkId: data.id },
          create: {
            clerkId: data.id,
            email: data.email_addresses?.[0]?.email_address ?? "",
            displayName:
              [data.first_name, data.last_name].filter(Boolean).join(" ") ||
              data.username ||
              "Writer",
          },
          update: {},
        });
        break;
      }

      case "user.updated": {
        await db.user.updateMany({
          where: { clerkId: data.id },
          data: {
            email: data.email_addresses?.[0]?.email_address,
            displayName:
              [data.first_name, data.last_name].filter(Boolean).join(" ") ||
              data.username,
          },
        });
        break;
      }

      case "user.deleted": {
        await db.user.deleteMany({
          where: { clerkId: data.id },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
