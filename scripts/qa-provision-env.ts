import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { encryptApiKey, maskApiKey } from "../src/lib/encryption";

/**
 * QA env provisioning (dev-only, not for CI/prod).
 *
 * Contains NO secret literals — reads the operator's key file at runtime.
 *   1. Updates .env OPENAI_API_KEY + ANTHROPIC_API_KEY (embeddings leg + voice-probe
 *      comparison arm) from the key file.
 *   2. Seeds each bulletproof-QA persona (clerk_id user_qa_p1..p8) with an encrypted
 *      OpenRouter BYOK key (provider=openrouter) so the strict-BYOK agent path
 *      (decryptApiKey, agent/route.ts) can make real line-edit/extraction calls.
 *      One OpenRouter key routes Claude + qwen3.6 + all providers via the
 *      Anthropic-compatible endpoint.
 *
 * Run: npx tsx --env-file=.env scripts/qa-provision-env.ts ["D:\path\to\keys.txt"]
 * Prints only MASKED confirmations — never the raw key.
 */

const KEY_FILE = process.argv[2] || "D:\\Projects\\waggle-os\\AI API KEYS.txt";
const ENV_PATH = ".env";
const PERSONA_CLERK_IDS = [
  "user_qa_p1", "user_qa_p2", "user_qa_p3", "user_qa_p4",
  "user_qa_p5", "user_qa_p6", "user_qa_p7", "user_qa_p8",
];

/** Return the value on the line immediately after a label line. */
function keyAfter(lines: string[], label: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === label) return (lines[i + 1] ?? "").trim();
  }
  return null;
}

/** Set (or append) a KEY=value line in .env content, preserving all other lines. */
function setEnvVar(lines: string[], key: string, value: string): { lines: string[]; existed: boolean } {
  let existed = false;
  const next = lines.map((l) => {
    if (l.startsWith(`${key}=`)) {
      existed = true;
      return `${key}=${value}`;
    }
    return l;
  });
  if (!existed) next.push(`${key}=${value}`);
  return { lines: next, existed };
}

async function main(): Promise<void> {
  const raw = readFileSync(KEY_FILE, "utf8");
  const keyLines = raw.split(/\r?\n/);
  const anthropic = keyAfter(keyLines, "Anthropic");
  const openai = keyAfter(keyLines, "Open AI");
  const openrouter = keyAfter(keyLines, "Open router");
  if (!anthropic || !openai || !openrouter) {
    throw new Error("[provision] could not parse Anthropic / Open AI / Open router from key file");
  }

  // 1. .env update (UTF-8, no BOM).
  const envLines = readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  let { lines: l1 } = setEnvVar(envLines, "OPENAI_API_KEY", openai);
  const { lines: l2 } = setEnvVar(l1, "ANTHROPIC_API_KEY", anthropic);
  writeFileSync(ENV_PATH, l2.join("\n"), "utf8");
  console.log(`[provision] .env OPENAI_API_KEY   -> ${maskApiKey(openai)}`);
  console.log(`[provision] .env ANTHROPIC_API_KEY-> ${maskApiKey(anthropic)}`);

  // 2. Persona BYOK OpenRouter seed (encrypted, is_default, validated).
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("[provision] DATABASE_URL not set");
  if (!process.env.API_KEY_ENCRYPTION_SECRET) throw new Error("[provision] API_KEY_ENCRYPTION_SECRET not set");

  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  let seeded = 0;
  const missing: string[] = [];
  try {
    for (const clerkId of PERSONA_CLERK_IDS) {
      const { rows } = await client.query(`SELECT id FROM users WHERE clerk_id = $1`, [clerkId]);
      if (rows.length === 0) { missing.push(clerkId); continue; }
      const userId = rows[0].id;
      const encrypted = encryptApiKey(openrouter);
      // @@unique([userId, provider]) -> upsert on (user_id, provider).
      await client.query(
        `INSERT INTO api_keys (id, user_id, provider, encrypted_key, label, is_default, validated_at, created_at)
         VALUES (gen_random_uuid(), $1, 'openrouter', $2, 'qa-provisioned', true, NOW(), NOW())
         ON CONFLICT (user_id, provider)
         DO UPDATE SET encrypted_key = $2, is_default = true, validated_at = NOW()`,
        [userId, encrypted],
      );
      seeded++;
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`[provision] openrouter BYOK seeded for ${seeded}/${PERSONA_CLERK_IDS.length} personas -> ${maskApiKey(openrouter)}`);
  if (missing.length) {
    console.log(`[provision] WARNING personas not found (run qa-seed-personas first): ${missing.join(", ")}`);
  }
  console.log("[provision] done. Start dev server on :3002, then the BLOCKED-ENV harnesses can run.");
}

main().catch((err) => {
  console.error("[provision] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
