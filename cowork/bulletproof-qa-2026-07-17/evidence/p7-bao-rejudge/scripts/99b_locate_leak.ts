import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";
const val = process.env.E2E_TEST_SECRET!;
function walk(dir: string): string[] { const out: string[] = []; for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) out.push(...walk(p)); else out.push(p); } return out; }
console.log("secretLen:", val.length);
for (const f of walk(BUNDLE)) {
  if (f.endsWith("99b_locate_leak.ts") || f.endsWith("99_secret_scan.ts")) continue;
  try {
    const c = readFileSync(f, "utf-8");
    const idx = c.indexOf(val);
    if (idx >= 0) {
      // print filename + masked surrounding context (replace secret w/ ***MASKED***)
      const ctx = c.slice(Math.max(0, idx - 60), idx + val.length + 60).replace(val, "***MASKED***");
      console.log("LEAK IN:", f.replace(BUNDLE, ""));
      console.log("  context:", JSON.stringify(ctx));
    }
  } catch { /* binary */ }
}
