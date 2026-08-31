import { Webhook } from "svix";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Clerk webhook handler with svix signature verification. */
export async function POST(req: NextRequest) {
  // 1. Get the svix headers
  const svix_id = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  // 2. If any header is missing, return 401
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 401 }
    );
  }

  // 3. Get the webhook secret
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("CLERK_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  // 4. Verify the signature — must use raw text body, not parsed JSON
  const wh = new Webhook(secret);
  const body = await req.text();
  let payload: Record<string, unknown>;

  try {
    payload = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as Record<string, unknown>;
  } catch (err) {
    logger.error("Webhook signature verification failed", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // 5. Process the verified event
  try {
    const type = payload.type as string;
    const data = payload.data as Record<string, unknown>;

    switch (type) {
      case "user.created": {
        const emailAddresses = data.email_addresses as
          | Array<{ email_address: string }>
          | undefined;
        await db.user.upsert({
          where: { clerkId: data.id as string },
          create: {
            clerkId: data.id as string,
            email: emailAddresses?.[0]?.email_address ?? "",
            displayName:
              [data.first_name, data.last_name].filter(Boolean).join(" ") ||
              (data.username as string) ||
              "Writer",
          },
          update: {},
        });
        break;
      }

      case "user.updated": {
        const emailAddresses = data.email_addresses as
          | Array<{ email_address: string }>
          | undefined;
        await db.user.updateMany({
          where: { clerkId: data.id as string },
          data: {
            email: emailAddresses?.[0]?.email_address,
            displayName:
              [data.first_name, data.last_name].filter(Boolean).join(" ") ||
              (data.username as string),
          },
        });
        break;
      }

      case "user.deleted": {
        await db.user.deleteMany({
          where: { clerkId: data.id as string },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error(Webhook processing failed, error, { type, data });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
