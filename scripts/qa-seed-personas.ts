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

const PERSONAS: Array<{ clerkId: string; email: string; name: string }> = [
  { clerkId: "user_qa_p1", email: "p1.maya@qa.local", name: "P1 Maya (debut)" },
  { clerkId: "user_qa_p2", email: "p2.gerald@qa.local", name: "P2 Gerald (pro)" },
  { clerkId: "user_qa_p3", email: "p3.selena@qa.local", name: "P3 Selena (series)" },
  { clerkId: "user_qa_p4", email: "p4.priya@qa.local", name: "P4 Priya (volume)" },
  { clerkId: "user_qa_p5", email: "p5.sam@qa.local", name: "P5 Sam (hobbyist)" },
  { clerkId: "user_qa_p6", email: "p6.owen@qa.local", name: "P6 Owen (stylist)" },
  { clerkId: "user_qa_p7", email: "p7.bao@qa.local", name: "P7 Bao (migrator)" },
  { clerkId: "user_qa_p8", email: "p8.rita@qa.local", name: "P8 Rita (trust/ops)" },
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
      console.log(`[qa-seed] seeded ${p.clerkId} (${p.name})`);
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
