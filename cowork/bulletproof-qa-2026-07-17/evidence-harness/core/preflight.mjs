// core/preflight.mjs — hard-fail preconditions + env block (W-F3 §1.1, §4).
//
// A certifiable run refuses to start unless every precondition holds. The env
// block (git SHA, dirty hash, node, hostname, timezone, service versions) is
// captured into the seal so "which contract was live" is a lookup, not an argument.
//
// Product-tree dirtiness is a hard fail unless --allow-dirty, which stamps the
// whole bundle NON-CERTIFIABLE.
//
// Node built-ins only; worker-proof is called for the single-worker assertion.

import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { tzInfo } from "./clock.mjs";
import { assertSingleWorker } from "./worker-proof.mjs";

function git(args) {
  try {
    return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** sha256 of `git status --porcelain` so a reader can pin exact tree state. */
async function porcelainHash() {
  const out = git(["status", "--porcelain"]) ?? "";
  const { createHash } = await import("node:crypto");
  return { hash: createHash("sha256").update(out).digest("hex"), dirtyLines: out ? out.split("\n").length : 0 };
}

/** Files under evidence-harness/** and the suite spec must be clean (pre-registration, §3.1). */
function harnessDirClean(specPath) {
  const scope = ["cowork/bulletproof-qa-2026-07-17/evidence-harness"];
  if (specPath) scope.push(specPath);
  for (const p of scope) {
    try {
      execFileSync("git", ["diff", "--quiet", "HEAD", "--", p], { cwd: process.cwd() });
    } catch {
      return { clean: false, dirtyPath: p };
    }
  }
  return { clean: true };
}

/**
 * @param {{ baseUrl?: string, secret: string, requireNeo4j?: boolean, requireWorker?: boolean, allowDirty?: boolean, specPath?: string }} cfg
 * @returns {Promise<{ ok: boolean, certifiable: boolean, env: object, failures: string[] }>}
 */
export async function preflight(cfg) {
  const baseUrl = (cfg.baseUrl || "http://localhost:3002").replace(/\/$/, "");
  const failures = [];
  const warnings = [];

  // App health.
  let health = null;
  try {
    const r = await fetch(`${baseUrl}/api/health`, { headers: { "x-e2e-test-secret": cfg.secret } });
    health = { status: r.status };
    if (!r.ok) failures.push(`app /api/health returned ${r.status}`);
  } catch (e) {
    failures.push(`app not reachable at ${baseUrl}/api/health: ${e.message}`);
  }

  // Service versions (best-effort; also self-detects C0 schema drift).
  let deps = null;
  try {
    const r = await fetch(`${baseUrl}/api/health/dependencies`, { headers: { "x-e2e-test-secret": cfg.secret } });
    deps = { status: r.status, body: await r.json().catch(() => null) };
  } catch {
    warnings.push("/api/health/dependencies unreachable");
  }

  // Postgres / Redis reachability declared via env (probes fail loudly at use).
  if (!process.env.DATABASE_URL) failures.push("DATABASE_URL not set");
  if (cfg.requireNeo4j && !process.env.NEO4J_URI && !process.env.NEO4J_PASSWORD) {
    warnings.push("Neo4j required by suite but NEO4J_* not set — probe will fail at use");
  }

  // Worker-proof single-worker assertion.
  let worker = null;
  if (cfg.requireWorker !== false) {
    worker = await assertSingleWorker();
    if (!worker.pass) for (const r of worker.reasons) failures.push(`worker-proof: ${r}`);
  }

  // Git tree state.
  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const porcelain = await porcelainHash();
  const harnessClean = harnessDirClean(cfg.specPath);
  if (!harnessClean.clean) failures.push(`pre-registration: ${harnessClean.dirtyPath} is dirty vs HEAD — commit before a certifiable run`);

  let certifiable = true;
  if (porcelain.dirtyLines > 0) {
    if (cfg.allowDirty) {
      certifiable = false;
      warnings.push(`product tree dirty (${porcelain.dirtyLines} lines) — bundle stamped NON-CERTIFIABLE (--allow-dirty)`);
    } else {
      failures.push(`product tree dirty (${porcelain.dirtyLines} lines) — pass --allow-dirty to seal as NON-CERTIFIABLE`);
    }
  }

  const env = {
    gitHead: head,
    gitBranch: branch,
    gitPorcelainSha256: porcelain.hash,
    gitDirtyLines: porcelain.dirtyLines,
    node: process.version,
    hostname: hostname(),
    tz: tzInfo(),
    services: deps,
    workerProof: worker ? { pass: worker.pass, os: worker.os, redis: worker.redis } : null,
    health,
    warnings,
  };

  return { ok: failures.length === 0, certifiable, env, failures, warnings };
}
