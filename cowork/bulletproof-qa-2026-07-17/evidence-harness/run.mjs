// run.mjs — single entry point for one capture run (W-F3 §1.1, T8).
//
//   node evidence-harness/run.mjs <suite-id> [--out <dir>] [--allow-dirty]
//                                             [--no-worker] [--git-anchor]
//
// The dispatching agent's ONLY degrees of freedom are WHICH suite and WHEN.
// Everything else — sampling, ordering, capture, assertion, sealing — is committed
// code (§1.4). The runner creates a FRESH run directory; it never appends to or
// edits a prior bundle.
//
// git-anchor is OFF by default (the W-F3 build brief: "COMMIT NOTHING; team-lead
// verifies + commits"). --git-anchor is provided for the post-integration workflow.
//
// Node built-ins only in the runner; suites lazy-import probes/deps as needed.

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createManifest, sha256Hex } from "./core/manifest.mjs";
import { buildRedactor } from "./core/redact.mjs";
import { createStore } from "./core/artifact-store.mjs";
import { buildSummary } from "./core/assertions.mjs";
import { loadScenario } from "./core/scenario.mjs";
import { preflight } from "./core/preflight.mjs";
import * as workerProof from "./core/worker-proof.mjs";
import { createHttpClient } from "./core/http-capture.mjs";
import { now } from "./core/clock.mjs";

const HARNESS_ROOT = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_ROOT = join(HARNESS_ROOT, "..", "evidence", "harness");

function parseArgs(argv) {
  const args = { suiteId: null, out: null, allowDirty: false, worker: true, gitAnchor: false, requireNeo4j: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--allow-dirty") args.allowDirty = true;
    else if (a === "--no-worker") args.worker = false;
    else if (a === "--git-anchor") args.gitAnchor = true;
    else if (a === "--neo4j") args.requireNeo4j = true;
    else if (a === "--out") args.out = argv[++i];
    else if (!a.startsWith("--") && !args.suiteId) args.suiteId = a;
  }
  return args;
}

function git7() {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "nogit";
  }
}

function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15).replace(/(\d{8})(\d{6})/, "$1-$2");
}

export async function main(argv) {
  const args = parseArgs(argv);
  if (!args.suiteId) {
    console.error("usage: node evidence-harness/run.mjs <suite-id> [--out dir] [--allow-dirty] [--no-worker] [--neo4j] [--git-anchor]");
    process.exit(1);
  }

  const suitePath = join(HARNESS_ROOT, "suites", `${args.suiteId}.mjs`);
  if (!existsSync(suitePath)) {
    console.error(`[run] no suite "${args.suiteId}" at ${suitePath}`);
    process.exit(1);
  }
  const specPath = join(HARNESS_ROOT, "scenarios", `${args.suiteId}.json`);
  let scenario = null;
  if (existsSync(specPath)) scenario = loadScenario(specPath);

  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) {
    console.error("[run] E2E_TEST_SECRET not set — cannot drive the app");
    process.exit(1);
  }

  // Preflight (hard-fail unless --allow-dirty downgrades to NON-CERTIFIABLE).
  const pf = await preflight({
    secret,
    requireWorker: args.worker,
    requireNeo4j: args.requireNeo4j,
    allowDirty: args.allowDirty,
    specPath: existsSync(specPath) ? `cowork/bulletproof-qa-2026-07-17/evidence-harness/scenarios/${args.suiteId}.json` : null,
  });
  if (!pf.ok) {
    console.error("[run] PREFLIGHT FAILED — refusing to start:");
    for (const f of pf.failures) console.error(`  - ${f}`);
    process.exit(4);
  }
  for (const w of pf.warnings) console.error(`[run] warning: ${w}`);

  // Fresh run directory.
  const runId = `${args.suiteId}-${stamp()}-${git7()}`;
  const bundleDir = args.out ? join(args.out) : join(EVIDENCE_ROOT, runId);
  mkdirSync(bundleDir, { recursive: true });
  mkdirSync(join(bundleDir, "checks"), { recursive: true });
  mkdirSync(join(bundleDir, "scenarios"), { recursive: true });

  const redactor = buildRedactor();
  const manifest = createManifest(bundleDir);
  const store = createStore(bundleDir, { redactor, manifest });
  const http = createHttpClient({ secret, clerkId: "user_qa_h1", store });

  // Copy the pre-registered spec + proof into the bundle.
  if (scenario) {
    writeFileSync(join(bundleDir, "scenarios", `${args.suiteId}.json`), JSON.stringify(scenario, null, 2) + "\n");
  }

  const ctx = { bundleDir, store, manifest, http, scenario, workerProof, redactor, clock: { now }, args, secret };

  // Run the suite (it OWNS its own worker-proof brackets around measurements).
  const t0 = now();
  let result;
  try {
    const suite = await import(pathToFileURL(suitePath).href);
    result = await suite.run(ctx);
  } catch (e) {
    console.error(`[run] suite "${args.suiteId}" threw: ${e.stack || e.message}`);
    // A suite failure still seals — the bundle preserves how far it got.
    result = { checks: [], coverage: { error: e.message }, extra: { suiteError: e.message } };
  }
  const t1 = now();

  // Build + write summary.machine.json (the ONLY place numbers live).
  const summary = buildSummary({
    suiteId: args.suiteId,
    checks: result.checks ?? [],
    coverage: result.coverage ?? {},
    extra: { ...(result.extra ?? {}), runId, wallMs: Math.round(t1.mono - t0.mono) },
  });
  const summaryBytes = Buffer.from(JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(bundleDir, "checks", "summary.machine.json"), summaryBytes);
  writeFileSync(join(bundleDir, "checks", "redaction-policy.json"), JSON.stringify(redactor.policyManifest(), null, 2) + "\n");

  // Certifiable = preflight-certifiable AND coverage met AND no voided brackets.
  const coverageMet = summary.verdict !== "UNDER-N";
  const certifiable = pf.certifiable && coverageMet;

  const seal = manifest.seal({
    runId,
    env: pf.env,
    scenarios: scenario ? [{ suiteId: scenario.suiteId, preRegistration: scenario._preRegistration }] : [],
    verdictIndex: { verdict: summary.verdict, totals: summary.totals, coverage: summary.coverage },
    checksDigest: sha256Hex(summaryBytes),
    certifiable,
    redactionPolicy: redactor.policyManifest(),
    notes: certifiable ? null : "NON-CERTIFIABLE — see env.warnings / coverage verdict",
  });

  writeVerifyMd(bundleDir, runId);

  console.log(`[run] sealed ${runId}`);
  console.log(`[run]   verdict=${summary.verdict}  certifiable=${certifiable}  rootHash=${seal.rootHash.slice(0, 12)}`);
  console.log(`[run]   bundle=${bundleDir}`);

  if (args.gitAnchor) gitAnchor(bundleDir, runId, seal.rootHash);
  else console.log(`[run]   (not committed — run with --git-anchor, or team-lead commits: git add "${bundleDir}" && git commit)`);

  process.exit(certifiable && summary.verdict === "PASS" ? 0 : 5);
}

function gitAnchor(bundleDir, runId, rootHash) {
  try {
    execFileSync("git", ["add", bundleDir], { cwd: process.cwd() });
    execFileSync("git", ["commit", "-m", `chore(evidence): seal ${runId} root=${rootHash.slice(0, 12)}`], { cwd: process.cwd() });
    console.log(`[run]   git-anchored: chore(evidence): seal ${runId} root=${rootHash.slice(0, 12)}`);
  } catch (e) {
    console.error(`[run]   git-anchor failed: ${e.message}`);
  }
}

function writeVerifyMd(bundleDir, runId) {
  const md = `# VERIFY — ${runId}

Run ONE command (no repo knowledge needed):

    node cowork/bulletproof-qa-2026-07-17/evidence-harness/verify/verify-bundle.mjs "${bundleDir}"

- **VERIFIED** — chain intact, every raw byte matches the manifest, every recorded
  number reproduces from raw, brackets consistent, narrative lints clean.
- **TAMPER-SUSPECT (seq=N)** — a raw byte, a manifest line, or a summary number was
  changed after sealing. Score the bundle as if its claims are FALSE.
- **NON-CERTIFIABLE** — sealed honestly under a limit (UNDER-N, dirty tree, or a
  voided worker bracket). The partial results are real; the coverage claim is not.

Read order: \`raw/\` first, \`checks/summary.machine.json\` second, \`narrative/\` last
(context only, never evidence).
`;
  writeFileSync(join(bundleDir, "VERIFY.md"), md);
}

// CLI
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("run.mjs");
if (isMain) main(process.argv.slice(2));
