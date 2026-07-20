/**
 * P2 RE-JUDGE — state probe: persona DB state, D-16 constraint presence,
 * BYOK key masked disclosure, server health. Prints NO raw secret values.
 */
import pg from "pg";
import { call, mask } from "./_client";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log("=== P2 STATE PROBE @", new Date().toISOString(), "===\n");

    const health = await call("GET", "/api/health/dependencies", { label: "health" });
    console.log("HEALTH", health.status, JSON.stringify(health.body));

    const u = await pool.query(
      `select id, clerk_id, onboarding_complete, default_model,
              global_model_editor, global_model_ghostwriter
         from users where clerk_id = 'user_qa_p2'`
    );
    const row = u.rows[0] ?? null;
    console.log("\nUSER row:", JSON.stringify(row));
    const uid = row?.id as string | undefined;

    const keys = await pool.query(
      `select provider, validated_at is not null as validated,
              created_at, encrypted_key
         from api_keys where user_id = $1`,
      [uid]
    );
    console.log("\nBYOK keys (masked):");
    for (const k of keys.rows) {
      console.log(
        `  provider=${k.provider} validated=${k.validated} ` +
          `encryptedKey=${mask(k.encrypted_key)} createdAt=${k.created_at?.toISOString?.() ?? k.created_at}`
      );
    }

    const books = await pool.query(
      `select count(*)::int as n from books where user_id = $1`,
      [uid]
    );
    console.log("\nP2 book count:", books.rows[0].n);

    // D-16 constraint presence (pg catalog)
    const idx = await pool.query(
      `select indexname, indexdef from pg_indexes
        where tablename = 'documents'
          and indexdef ILIKE '%book_id%type%chapter_number%'`
    );
    console.log(
      "\nD-16 UNIQUE constraint:",
      idx.rows.length ? "PRESENT" : "MISSING",
      JSON.stringify(idx.rows.map((r) => r.indexname))
    );
    if (idx.rows.length) console.log("  def:", idx.rows[0].indexdef);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("PROBE ERROR", e);
  process.exit(1);
});
