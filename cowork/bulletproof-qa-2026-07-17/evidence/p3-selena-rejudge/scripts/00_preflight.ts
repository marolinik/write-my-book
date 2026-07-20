/**
 * P3-Selena rejudge — PREFLIGHT probe.
 * Verifies live environment WITHOUT printing any secret value.
 * Run: npx tsx --env-file=.env cowork/bulletproof-qa-2026-07-17/evidence/p3-selena-rejudge/scripts/00_preflight.ts
 */
import { db } from "@/lib/db";
import { verifyNeo4jConnection, withSession } from "@/lib/graph/neo4j-client";
import { stripe } from "@/lib/billing/stripe-client";

function mask(v: string | null | undefined): string {
  if (!v) return "(absent)";
  if (v.length <= 11) return "(present,short)";
  return `${v.slice(0, 7)}…${v.slice(-4)}`;
}

async function main() {
  console.log("=== P3 REJUDGE PREFLIGHT ===", new Date().toISOString());

  // env presence (booleans only)
  console.log("\n[env presence]");
  for (const k of [
    "E2E_TEST_SECRET",
    "DATABASE_URL",
    "NEO4J_URI",
    "NEO4J_USER",
    "NEO4J_PASSWORD",
    "API_KEY_ENCRYPTION_SECRET",
    "ENABLE_LOCATION_CONFLICT_CHECK",
  ]) {
    const val = process.env[k];
    console.log(`  ${k}: ${val ? "SET" : "UNSET"}${k === "ENABLE_LOCATION_CONFLICT_CHECK" && val ? `=${val}` : ""}`);
  }

  console.log("\n[stripe/billing]");
  console.log("  stripe configured:", stripe ? "YES (plan gating active)" : "NO (billing disabled → allow-all plan access)");

  console.log("\n[users]");
  for (const clerkId of ["user_qa_p3", "user_qa_p4", "user_qa_h2"]) {
    const u = await db.user.findUnique({ where: { clerkId } });
    if (!u) {
      console.log(`  ${clerkId}: NOT FOUND`);
      continue;
    }
    const sub = await db.subscription.findUnique({ where: { userId: u.id } });
    const keys = await db.apiKey.findMany({
      where: { userId: u.id },
      select: { provider: true, validatedAt: true },
    });
    console.log(
      `  ${clerkId}: id=${u.id} plan=${sub?.plan ?? "(none)"} status=${sub?.status ?? "(none)"} ` +
        `keys=[${keys.map((k) => `${k.provider}${k.validatedAt ? "✓" : "✗"}`).join(",")}]`
    );
  }

  console.log("\n[neo4j]");
  const ok = await verifyNeo4jConnection();
  console.log("  connectivity:", ok);
  if (ok) {
    await withSession("READ", async (s) => {
      const r = await s.run("MATCH (n) RETURN count(n) AS c");
      console.log("  total nodes:", r.records[0].get("c").toString());
    });
  }

  console.log("\n[app health]");
  try {
    const secret = process.env.E2E_TEST_SECRET ?? "";
    const res = await fetch("http://localhost:3002/api/health");
    console.log("  /api/health status:", res.status);
    const authRes = await fetch("http://localhost:3002/api/books", {
      headers: { "x-e2e-test-secret": secret, "x-e2e-clerk-id": "user_qa_p3" },
    });
    console.log("  /api/books (as P3) status:", authRes.status);
    const body = await authRes.json().catch(() => null);
    console.log("  P3 book count:", Array.isArray(body) ? body.length : "(non-array)");
  } catch (e) {
    console.log("  app fetch error:", (e as Error).message);
  }

  console.log("\n[secret sanity — masked]");
  console.log("  E2E secret:", mask(process.env.E2E_TEST_SECRET));

  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("PREFLIGHT ERROR:", e);
  process.exit(1);
});
