/**
 * P2-84: the worker image installs production dependencies only. Run inside
 * the image at build time: every package the compiled worker requires must
 * resolve from the pruned node_modules, or the build fails here instead of
 * the worker crashing at boot in production.
 *
 * Wave 7 Task 5: the worker does not load Next. tsc compiles all of src/lib,
 * including route helpers that import next/server, so the check walks the
 * require graph from the worker entry and looks only at what it reaches. A
 * reachable require of next (or of @sentry/nextjs, which loads next) fails
 * the build: the image no longer carries them.
 *
 *   node scripts/check-worker-deps.mjs [distDir]
 */
import fs from "node:fs";
import path from "node:path";
import { builtinModules, createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));

const dist = path.resolve(process.argv[2] ?? "dist-worker");
const entry = path.join(dist, "worker.js");
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** Packages the worker must never reach: the image drops them. */
const FORBIDDEN = [/^next(\/|$)/, /^@next\//, /^@sentry\/nextjs(\/|$)/];

/** A relative require resolved against the compiled tree, or null. */
function resolveLocal(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [base, `${base}.js`, path.join(base, "index.js")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const specifiers = new Map(); // package specifier -> first file that requires it
const forbidden = [];
const unresolvedLocal = [];
const seen = new Set([entry]);
const queue = [entry];

if (!fs.existsSync(entry)) {
  console.error(`[check-worker-deps] no worker entry at ${entry}`);
  process.exit(1);
}

while (queue.length > 0) {
  const file = queue.shift();
  const text = fs.readFileSync(file, "utf8");
  // tsc keeps the source's quote style: match require("x") and require('x').
  for (const match of text.matchAll(/require\((["'])([^"']+)\1\)/g)) {
    const spec = match[2];
    if (builtins.has(spec)) continue;
    if (spec.startsWith(".") || spec.startsWith("/")) {
      const local = resolveLocal(file, spec);
      if (!local) unresolvedLocal.push(`${spec} (from ${path.relative(dist, file)})`);
      else if (!seen.has(local)) {
        seen.add(local);
        queue.push(local);
      }
      continue;
    }
    if (FORBIDDEN.some((re) => re.test(spec))) forbidden.push(`${spec} (from ${path.relative(dist, file)})`);
    if (!specifiers.has(spec)) specifiers.set(spec, file);
  }
}

const missing = [];
for (const spec of [...specifiers.keys()].sort()) {
  if (FORBIDDEN.some((re) => re.test(spec))) continue;
  try {
    require.resolve(spec, { paths: [process.cwd()] });
  } catch {
    missing.push(spec);
  }
}

let failed = false;
if (forbidden.length > 0) {
  console.error(`[check-worker-deps] the worker reaches Next, which its image does not carry:\n  ${forbidden.join("\n  ")}`);
  failed = true;
}
if (unresolvedLocal.length > 0) {
  console.error(`[check-worker-deps] ${unresolvedLocal.length} local module(s) do not exist:\n  ${unresolvedLocal.join("\n  ")}`);
  failed = true;
}
if (missing.length > 0) {
  console.error(`[check-worker-deps] ${missing.length} required package(s) are not installed:\n  ${missing.join("\n  ")}`);
  failed = true;
}
if (failed) process.exit(1);
console.log(`[check-worker-deps] ${seen.size} reachable modules; ${specifiers.size} required packages resolve`);
