import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";
import { encryptApiKey, maskApiKey } from "../src/lib/encryption";
// Wipe-safe harness-user seeder (refuses any non user_qa_h<n> id).
import { seedHarnessUsers } from "../cowork/bulletproof-qa-2026-07-17/evidence-harness/core/seed.mjs";

/**
 * QA HARNESS-user provisioning (dev-only) — companion to qa-provision-env.ts.
 *
 * The evidence-harness runner (run.mjs) drives the app as clerkId "user_qa_h1",
 * which is DISJOINT from the persona users (user_qa_p1..p8). seedHarnessUsers
 * wipes api_keys as part of its fixture reset, so the BYOK key MUST be seeded
 * AFTER the user seed — this script does both in the correct order:
 *   1. seedHarnessUsers([h1]) with a paid plan (clears the line-edit quota gate).
 *   2. Seed h1's encrypted OpenRouter BYOK row (strict-BYOK agent path).
 *
 * Run IMMEDIATELY before a live harness suite (voice-flattening / continuity /
 * misquote), on a clean tree, with a single worker up:
 *   npx tsx --env-file=.env scripts/qa-provision-harness.ts ["D:\path\to\keys.txt"]
 * Prints only MASKED confirmations — never the raw key.
 */

const KEY_FILE = process.argv[2] || "D:\\Projects\\waggle-os\\AI API KEYS.txt";
const HARNESS_CLERK_ID = "user_qa_h1";
const HARNESS_PLAN = "pro"; // highest tier — clears any per-call quota/plan gate for the N line-edits.

function keyAfter(lines: string[], label: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === label) return (lines[i + 1] ?? "").trim();
  }
  return null;
}

async function main(): Promise<void> {
  const keyLines = readFileSync(KEY_FILE, "utf8").split(/\r?\n/);
  const openrouter = keyAfter(keyLines, "Open router");
  if (!openrouter) throw new Error("[harness-provision] could not parse Open router from key file");
  if (!process.env.DATABASE_URL) throw new Error("[harness-provision] DATABASE_URL not set");
  if (!process.env.API_KEY_ENCRYPTION_SECRET) throw new Error("[harness-provision] API_KEY_ENCRYPTION_SECRET not set");

  // 1. Wipe-safe harness user + paid plan.
  const seeded = await seedHarnessUsers([
    { clerkId: HARNESS_CLERK_ID, email: `${HARNESS_CLERK_ID}@harness.local`, name: "QA Harness H1", plan: HARNESS_PLAN },
  ]);
  const userId = seeded[0].userId;
  console.log(`[harness-provision] seeded ${HARNESS_CLERK_ID} userId=${userId} plan=${HARNESS_PLAN}`);

  // 2. BYOK OpenRouter seed (encrypted, default, validated) — AFTER the wipe above.
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const encrypted = encryptApiKey(openrouter);
    await client.query(
      `INSERT INTO api_keys (id, user_id, provider, encrypted_key, label, is_default, validated_at, created_at)
       VALUES (gen_random_uuid(), $1, 'openrouter', $2, 'qa-harness', true, NOW(), NOW())
       ON CONFLICT (user_id, provider)
       DO UPDATE SET encrypted_key = $2, is_default = true, validated_at = NOW()`,
      [userId, encrypted],
    );
  } finally {
    client.release();
    await pool.end();
  }
  console.log(`[harness-provision] openrouter BYOK seeded for ${HARNESS_CLERK_ID} -> ${maskApiKey(openrouter)}`);
  console.log("[harness-provision] done. Clean tree + single worker + E2E_TEST_SECRET, then: node cowork/bulletproof-qa-2026-07-17/evidence-harness/run.mjs voice-flattening");
}

main().catch((err) => {
  console.error("[harness-provision] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
