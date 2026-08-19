// Verify no raw secret value leaked into the bundle. Reads secrets from env,
// greps every bundle file for them, reports ONLY match counts (never the value).
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";

const secrets: Record<string, string | undefined> = {
  E2E_TEST_SECRET: process.env.E2E_TEST_SECRET,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(BUNDLE).filter((f) => !f.endsWith("99_secret_scan.ts"));
const report: Record<string, number> = {};
for (const [name, val] of Object.entries(secrets)) {
  if (!val || val.length < 6) { report[name] = -1; continue; } // not set / too short to match meaningfully
  let hits = 0;
  for (const f of files) {
    try { const c = readFileSync(f, "utf-8"); if (c.includes(val)) hits++; } catch { /* binary */ }
  }
  report[name] = hits;
}

const anyLeak = Object.entries(report).some(([, n]) => n > 0);
console.log("secret leak scan (hits per secret; -1 = not set):", JSON.stringify(report));
console.log("filesScanned:", files.length);
console.log("SECRETS_CLEAN:", !anyLeak);
