import "dotenv/config";
import pg from "pg";

/**
 * Bulletproof-QA persona seeding. Creates 8 isolated persona users
 * (clerkId `user_qa_p1`..`user_qa_p8`) so each journey runs against its own
 * user-scoped state (books, WriterMemory, keys, budget) instead of sharing the
 * single DEV/E2E user — the #1 isolation rule in ORCHESTRATOR-PROMPT.
 *
 * Idempotent: wipes each persona's owned data then upserts the user row.
 * Requests act as a persona via headers `x-e2e-test-secret` + `x-e2e-clerk-id`.
 *
 * Run: npx tsx --env-file=.env scripts/qa-seed-personas.ts
 */

// plan/status of null = intentionally unsubscribed (tests the paywall / tier-gate
// DENY path): P5 Sam is the BYOK+paywall cliff, P8 Rita drives billing lifecycle
// transitions herself during her journey.
const PERSONAS: Array<{
  clerkId: string;
  email: string;
  name: string;
  plan: string | null;
}> = [
  { clerkId: "user_qa_p1", email: "p1.maya@qa.local", name: "P1 Maya (debut)", plan: "indie" },
  { clerkId: "user_qa_p2", email: "p2.gerald@qa.local", name: "P2 Gerald (pro)", plan: "professional" },
  { clerkId: "user_qa_p3", email: "p3.selena@qa.local", name: "P3 Selena (series)", plan: "professional" },
  { clerkId: "user_qa_p4", email: "p4.priya@qa.local", name: "P4 Priya (volume)", plan: "professional" },
  { clerkId: "user_qa_p5", email: "p5.sam@qa.local", name: "P5 Sam (hobbyist)", plan: null },
  { clerkId: "user_qa_p6", email: "p6.owen@qa.local", name: "P6 Owen (stylist)", plan: "indie" },
  { clerkId: "user_qa_p7", email: "p7.bao@qa.local", name: "P7 Bao (migrator)", plan: "professional" },
  { clerkId: "user_qa_p8", email: "p8.rita@qa.local", name: "P8 Rita (trust/ops)", plan: null },
];

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("[qa-seed] DATABASE_URL not set");

  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    for (const p of PERSONAS) {
      const { rows } = await client.query(
        `SELECT id FROM users WHERE clerk_id = $1`,
        [p.clerkId],
      );
      if (rows.length > 0) {
        const userId = rows[0].id;
        await client.query(`DELETE FROM books WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM series WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM style_profiles WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM agent_sessions WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM usage_records WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM api_keys WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM subscriptions WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM writer_memories WHERE user_id = $1`, [userId]);
      }
      await client.query(
        `INSERT INTO users (id, clerk_id, email, display_name, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
         ON CONFLICT (clerk_id)
         DO UPDATE SET email = $2, display_name = $3, updated_at = NOW()`,
        [p.clerkId, p.email, p.name],
      );

      // Persona subscription (null plan = intentionally unsubscribed).
      const { rows: urows } = await client.query(
        `SELECT id FROM users WHERE clerk_id = $1`,
        [p.clerkId],
      );
      const userId = urows[0].id;
      await client.query(`DELETE FROM subscriptions WHERE user_id = $1`, [userId]);
      if (p.plan) {
        await client.query(
          `INSERT INTO subscriptions
             (id, user_id, plan, status, billing_interval,
              current_period_start, current_period_end, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'active', 'monthly',
              NOW(), NOW() + INTERVAL '30 days', NOW(), NOW())`,
          [userId, p.plan],
        );
      }
      console.log(
        `[qa-seed] seeded ${p.clerkId} (${p.name}) plan=${p.plan ?? "none"}`,
      );
    }
    console.log(`[qa-seed] done — ${PERSONAS.length} persona users`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[qa-seed] failed:", err);
  process.exit(1);
});
