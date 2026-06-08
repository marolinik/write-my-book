import "dotenv/config";
import pg from "pg";

const E2E_CLERK_ID = "user_test_e2e";

/**
 * Global setup: seed the E2E test user via raw SQL.
 * Avoids importing the Prisma generated client (ESM/CJS mismatch).
 */
export default async function globalSetup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("[global-setup] DATABASE_URL is not set. Check .env file.");
  }
  console.log("[global-setup] Connecting to:", dbUrl.replace(/:[^@]*@/, ":***@"));

  const pool = new pg.Pool({ connectionString: dbUrl });
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error("[global-setup] DB connection failed:", err);
    await pool.end();
    throw err;
  }

  try {
    // Find existing test user
    const { rows } = await client.query(
      `SELECT id FROM users WHERE clerk_id = $1`,
      [E2E_CLERK_ID]
    );

    if (rows.length > 0) {
      const userId = rows[0].id;
      // Delete related data — books and series cascade to children
      await client.query(`DELETE FROM books WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM series WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM style_profiles WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM agent_sessions WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM usage_records WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM api_keys WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM subscriptions WHERE user_id = $1`, [userId]);
    }

    // Upsert test user
    await client.query(
      `INSERT INTO users (id, clerk_id, email, display_name, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
       ON CONFLICT (clerk_id)
       DO UPDATE SET email = $2, display_name = $3, updated_at = NOW()`,
      [E2E_CLERK_ID, "e2e@test.local", "E2E Tester"]
    );

    console.log("[global-setup] Test user seeded:", E2E_CLERK_ID);
  } finally {
    client.release();
    await pool.end();
  }
}
