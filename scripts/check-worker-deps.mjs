/**
 * P2-84: the worker image installs production dependencies only. Run inside
 * the image at build time: every package the compiled worker requires must
 * resolve from the pruned node_modules, or the build fails here instead of
 * the worker crashing at boot in production.
 *
 *   node scripts/check-worker-deps.mjs [distDir]
 */
import fs from "node:fs";
import path from "node:path";
import { builtinModules, createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));

const dist = path.resolve(process.argv[2] ?? "dist-worker");
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

function* jsFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsFiles(full);
    else if (entry.name.endsWith(".js")) yield full;
  }
}

const specifiers = new Set();
for (const file of jsFiles(dist)) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/require\("([^"]+)"\)/g)) {
    const spec = match[1];
    if (spec.startsWith(".") || spec.startsWith("/") || builtins.has(spec)) continue;
    specifiers.add(spec);
  }
}

const missing = [];
for (const spec of [...specifiers].sort()) {
  try {
    require.resolve(spec, { paths: [process.cwd()] });
  } catch {
    missing.push(spec);
  }
}

if (missing.length > 0) {
  console.error(`[check-worker-deps] ${missing.length} required package(s) are not installed:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log(`[check-worker-deps] ${specifiers.size} required packages resolve`);
