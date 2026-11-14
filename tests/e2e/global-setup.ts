import "dotenv/config";
import pg from "pg";

const E2E_CLERK_ID = "user_test_e2e";

// The product default for new accounts. The column default is a local-fleet
// model that CI does not have, so without this AI routes answer 500, not 400.
const E2E_DEFAULT_MODEL = "openrouter-deepseek-flash/sonnet";

/** Same identity as scripts/qa-seed-personas.ts, so either seeder can create it. */
const LANG_PERSONA = {
  clerkId: "user_qa_lang",
  email: "qa.lang@qa.local",
  name: "Lang Smoke",
} as const;

/**
 * P2-67 (Wave 7): the last-key protection test needs a writer with exactly
 * one key. CI cannot add one through the API (the provider rejects a fake
 * key), so this persona is seeded with one row. The guard counts rows and
 * the list flags an undecryptable key instead of failing (P2-21), so the
 * placeholder ciphertext is never decrypted by the test.
 */
const KEYS_PERSONA = {
  clerkId: "user_qa_keys",
  email: "qa.keys@qa.local",
  name: "Last Key",
} as const;

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
    const {
      rows: [user],
    } = await client.query(
      `INSERT INTO users (id, clerk_id, email, display_name, default_model, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (clerk_id)
       DO UPDATE SET email = $2, display_name = $3, default_model = $4, preferred_language = DEFAULT, updated_at = NOW()
       RETURNING id`,
      [E2E_CLERK_ID, "e2e@test.local", "E2E Tester", E2E_DEFAULT_MODEL]
    );

    // Grant the E2E identity a paid plan. The suite is fullyParallel: every
    // spec creates books via the API, and the single shared user would hit the
    // Free-tier 1-book cap (403) for all but the first spec to finish.
    // Free-tier behaviour itself is covered by dedicated specs that manage the
    // subscription row explicitly.
    await client.query(
      `INSERT INTO subscriptions (id, user_id, plan, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'professional', 'active', NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET plan = 'professional', status = 'active', updated_at = NOW()`,
      [user.id]
    );

    console.log("[global-setup] Test user seeded:", E2E_CLERK_ID, "(plan: professional/active)");

    // Dedicated language persona for book-development-language-smoke.spec.ts.
    // Upsert only (no wipe): its books carry per-run unique names, and the
    // spec flips this user's language, so it must stay a separate identity.
    const {
      rows: [langUser],
    } = await client.query(
      `INSERT INTO users (id, clerk_id, email, display_name, default_model, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (clerk_id)
       DO UPDATE SET email = $2, display_name = $3, default_model = $4, preferred_language = DEFAULT, updated_at = NOW()
       RETURNING id`,
      [LANG_PERSONA.clerkId, LANG_PERSONA.email, LANG_PERSONA.name, E2E_DEFAULT_MODEL]
    );
    await client.query(
      `INSERT INTO subscriptions (id, user_id, plan, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'professional', 'active', NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET plan = 'professional', status = 'active', updated_at = NOW()`,
      [langUser.id]
    );
    console.log("[global-setup] Language persona seeded:", LANG_PERSONA.clerkId);

    const {
      rows: [keysUser],
    } = await client.query(
      `INSERT INTO users (id, clerk_id, email, display_name, default_model, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (clerk_id)
       DO UPDATE SET email = $2, display_name = $3, default_model = $4, updated_at = NOW()
       RETURNING id`,
      [KEYS_PERSONA.clerkId, KEYS_PERSONA.email, KEYS_PERSONA.name, E2E_DEFAULT_MODEL]
    );
    await client.query(`DELETE FROM api_keys WHERE user_id = $1`, [keysUser.id]);
    await client.query(
      `INSERT INTO api_keys (id, user_id, provider, encrypted_key, label, is_default, created_at)
       VALUES (gen_random_uuid(), $1, 'anthropic', 'e2e-placeholder-not-a-ciphertext', 'E2E last key', true, NOW())`,
      [keysUser.id]
    );
    console.log("[global-setup] Last-key persona seeded with one key:", KEYS_PERSONA.clerkId);
  } finally {
    client.release();
    await pool.end();
  }
}
