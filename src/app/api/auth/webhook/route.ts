import { Webhook } from "svix";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getDefaultModelId } from "@/lib/llm/defaults";
import { stripe } from "@/lib/billing";
import {
  cancelAllStripeSubscriptions,
  expireCheckoutSession,
} from "@/lib/billing/stripe-cancel";

/**
 * Cancel, immediately, every Stripe subscription that can still charge the
 * writer whose account is being deleted, after expiring any checkout they left
 * open (paid later, it would bill, and claim a Founder slot, for an account
 * that no longer exists). Idempotent: Clerk redelivers, and a subscription or
 * session that already ended counts as done. A Stripe failure is logged and
 * thrown, so the webhook answers 500, Clerk retries, and the account is not
 * deleted while its billing is still running.
 */
async function stopBillingForDeletedUser(clerkId: string): Promise<void> {
  const sub = await db.subscription.findFirst({
    where: { user: { clerkId } },
    select: {
      userId: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      pendingCheckoutSessionId: true,
    },
  });
  if (
    !sub ||
    (!sub.stripeCustomerId && !sub.stripeSubscriptionId && !sub.pendingCheckoutSessionId)
  ) {
    return;
  }

  const context = {
    clerkId,
    userId: sub.userId,
    stripeCustomerId: sub.stripeCustomerId,
    stripeSubscriptionId: sub.stripeSubscriptionId,
    pendingCheckoutSessionId: sub.pendingCheckoutSessionId,
  };

  if (!stripe) {
    // Retrying cannot help a deployment with no Stripe key, so the account is
    // still deleted; the ids are logged for someone to cancel by hand.
    logger.error(
      "Account deleted with a Stripe billing record, but Stripe is not configured: cancel it by hand",
      new Error("stripe not configured"),
      context
    );
    return;
  }

  try {
    // Expire first: a session paid a moment before has made its subscription
    // by now, and the sweep below cancels it.
    if (sub.pendingCheckoutSessionId) {
      await expireCheckoutSession(stripe, sub.pendingCheckoutSessionId);
    }
    const canceled = await cancelAllStripeSubscriptions(stripe, {
      customerId: sub.stripeCustomerId,
      subscriptionId: sub.stripeSubscriptionId,
    });
    if (canceled.length > 0) {
      logger.info("Canceled Stripe subscriptions for deleted account", {
        ...context,
        canceled,
      });
    }
  } catch (error) {
    logger.error(
      "Could not cancel Stripe billing for deleted account; account kept so the retry can finish it",
      error,
      context
    );
    throw error;
  }
}

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
            // Keep in step with lib/auth.ts: the deployment default governs new
            // accounts, not the Prisma column default.
            defaultModel: getDefaultModelId(),
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
        const clerkId = data.id as string;
        // Stop billing first. Deleting the user cascades away the only row
        // that links this writer to Stripe; if that went first, a failed
        // cancel would leave a subscription renewing that nobody can trace.
        await stopBillingForDeletedUser(clerkId);
        await db.user.deleteMany({
          where: { clerkId },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("Webhook processing failed", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
