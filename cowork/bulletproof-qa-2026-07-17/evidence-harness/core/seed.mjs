// core/seed.mjs — harness users user_qa_h1.. (W-F3 §1.2, §1.4).
//
// Harness users are DISJOINT from persona users (user_qa_p1..p8): a capture run
// can never contaminate persona-journey state and vice versa. The auth prefix
// guard (src/lib/auth.ts:62-66) admits any `user_qa_*` id, so h-users work over
// the same header path as personas.
//
// Mirrors scripts/qa-seed-personas.ts wipe+upsert, but a hard guard REFUSES to
// touch any clerkId that is not exactly user_qa_h<n>.
//
// Uses the existing `pg` dependency (no new dep). Read/write DB is fine here — this
// is fixture setup, OUTSIDE the capture/measurement boundary.

import pg from "pg";

const HARNESS_ID = /^user_qa_h\d+$/;

/**
 * @param {Array<{ clerkId: string, email?: string, name?: string, plan?: string|null }>} users
 * @param {{ databaseUrl?: string }} [opts]
 */
export async function seedHarnessUsers(users, opts = {}) {
  for (const u of users) {
    if (!HARNESS_ID.test(u.clerkId)) {
      throw new Error(`[seed] refusing non-harness clerkId "${u.clerkId}" — only user_qa_h<n> permitted (personas are off-limits)`);
    }
  }
  const dbUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("[seed] DATABASE_URL not set");

  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  const seeded = [];
  try {
    for (const u of users) {
      const { rows } = await client.query(`SELECT id FROM users WHERE clerk_id = $1`, [u.clerkId]);
      if (rows.length > 0) {
        const userId = rows[0].id;
        // Double-guard: only wipe when the row is genuinely a harness user.
        const owned = await client.query(`SELECT clerk_id FROM users WHERE id = $1`, [userId]);
        if (!HARNESS_ID.test(owned.rows[0]?.clerk_id ?? "")) {
          throw new Error(`[seed] safety abort: id ${userId} is not a harness user`);
        }
        for (const table of ["books", "series", "style_profiles", "agent_sessions", "usage_records", "api_keys", "subscriptions", "writer_memories"]) {
          await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
        }
      }
      await client.query(
        `INSERT INTO users (id, clerk_id, email, display_name, onboarding_complete, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, true, NOW(), NOW())
         ON CONFLICT (clerk_id) DO UPDATE SET email = $2, display_name = $3, updated_at = NOW()`,
        [u.clerkId, u.email ?? `${u.clerkId}@harness.local`, u.name ?? u.clerkId],
      );
      const { rows: urows } = await client.query(`SELECT id FROM users WHERE clerk_id = $1`, [u.clerkId]);
      const userId = urows[0].id;
      if (u.plan) {
        await client.query(
          `INSERT INTO subscriptions (id, user_id, plan, status, billing_interval, current_period_start, current_period_end, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'active', 'monthly', NOW(), NOW() + INTERVAL '30 days', NOW(), NOW())`,
          [userId, u.plan],
        );
      }
      seeded.push({ clerkId: u.clerkId, userId, plan: u.plan ?? null });
    }
  } finally {
    client.release();
    await pool.end();
  }
  return seeded;
}
