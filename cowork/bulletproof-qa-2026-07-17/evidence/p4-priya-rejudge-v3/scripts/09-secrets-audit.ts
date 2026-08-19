/**
 * Secrets-clean audit — grep the entire bundle for the literal secret values
 * from process.env (E2E secret, DB URL creds, any seeded BYOK key for Priya).
 * Reports ONLY booleans + counts; never prints a secret value.
 */
import { db } from "@/lib/db";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const OUT = join(__dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function main() {
  const files = walk(OUT).filter((f) => !f.endsWith("09-secrets-audit.ts"));
  const needles: { label: string; value: string | undefined }[] = [
    { label: "E2E_TEST_SECRET", value: process.env.E2E_TEST_SECRET },
    { label: "DATABASE_URL", value: process.env.DATABASE_URL },
  ];

  // Priya's seeded BYOK key (decrypted) — must NEVER appear in the bundle.
  try {
    const user = await db.user.findUnique({ where: { clerkId: "user_qa_p4" }, select: { id: true } });
    if (user) {
      const keys = await db.apiKey.findMany({
        where: { userId: user.id },
        select: { provider: true, encryptedKey: true },
      });
      // We do NOT decrypt here (decrypt util may echo); instead check the
      // encrypted blob doesn't appear, and check common key prefixes.
      for (const k of keys) needles.push({ label: `apiKey.encrypted(${k.provider})`, value: k.encryptedKey });
    }
  } catch {
    /* ignore */
  }

  const findings: Record<string, number> = {};
  const prefixHits: Record<string, number> = {};
  const keyPrefixes = ["sk-or-", "sk-ant-", "sk-proj-", "sk-", "AKIA"];

  for (const f of files) {
    let content = "";
    try { content = readFileSync(f, "utf8"); } catch { continue; }
    for (const n of needles) {
      if (n.value && n.value.length > 8 && content.includes(n.value)) {
        findings[n.label] = (findings[n.label] ?? 0) + 1;
      }
    }
    for (const pre of keyPrefixes) {
      if (content.includes(pre)) prefixHits[pre] = (prefixHits[pre] ?? 0) + 1;
    }
  }

  const result = {
    filesScanned: files.length,
    literalSecretHits: findings, // empty object == clean
    secretPrefixHits: prefixHits, // any sk-/AKIA occurrences (may be false-positive in prose)
    secretsClean: Object.keys(findings).length === 0,
  };
  console.log(JSON.stringify(result, null, 2));
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("AUDIT ERROR", e);
  try { await db.$disconnect(); } catch {}
  process.exit(1);
});
