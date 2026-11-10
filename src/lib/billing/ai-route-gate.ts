import { NextResponse } from "next/server";
import { checkQuota } from "@/lib/billing/quota-checker";

/**
 * The plan gate for an AI route that runs one model call outside an agent
 * session (character chat, marketing kit, wiki populate, finding discuss).
 * Free limits are published as true for every AI feature, so each such route
 * asks the same question an agent session does (P2-5). Returns the 429 to
 * send, or null when the writer may go ahead.
 */
export async function denyIfOverQuota(userId: string): Promise<NextResponse | null> {
  const quota = await checkQuota(userId, "use_agent_session");
  if (quota.allowed) return null;
  return NextResponse.json(
    {
      error: quota.reason,
      upgradeToTier: quota.upgradeToTier,
      code: "PLAN_LIMIT",
    },
    { status: 429 }
  );
}
