// verify/verify-bundle.mjs — independent one-command re-verification (W-F3 §2.6).
//
//   npx tsx evidence-harness/verify/verify-bundle.mjs <bundle-dir>
//   (also runs under plain `node <path> <bundle-dir>` — no tsx needed)
//
// A blind judge with NO repo knowledge runs this against a sealed bundle. It
// verifies the RECORD, not the world: it imports only core/ + assertions — never
// suite code — so it cannot "re-run" anything against the live app.
//
// Steps (design §2.6):
//   1. Re-hash every file in raw/ and reconcile against manifest.jsonl (no extra,
//      no missing, every sha256 matches).
//   2. Re-validate the hash chain + rootHash in MANIFEST.json.
//   3. Re-execute every recorded check against raw and diff vs summary.machine.json.
//   4. Re-check worker-proof bracket coverage of every measurement.
//   5. Run the narrative quote/number lints.
//   6. Print VERIFIED / TAMPER-SUSPECT (first divergent seq) / NON-CERTIFIABLE.
//
// Exit codes: 0 VERIFIED, 2 TAMPER-SUSPECT, 3 NON-CERTIFIABLE, 1 usage/error.
//
// Node built-ins only.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { verifyChain, sha256Hex } from "../core/manifest.mjs";
import { createArtifactReader, rerun, deepEqual } from "../core/assertions.mjs";
import { verifyQuotes } from "./verify-quotes.mjs";

function listRawFiles(bundleDir) {
  const rawDir = join(bundleDir, "raw");
  if (!existsSync(rawDir)) return [];
  return readdirSync(rawDir)
    .filter((n) => statSync(join(rawDir, n)).isFile())
    .map((n) => `raw/${n}`);
}

export function verifyBundle(bundleDir) {
  /** @type {string[]} */
  const problems = [];
  const report = { bundleDir, checks: {}, verdict: null };

  // ── prerequisites ──────────────────────────────────────────────────────
  const manifestPath = join(bundleDir, "manifest.jsonl");
  const sealPath = join(bundleDir, "MANIFEST.json");
  if (!existsSync(manifestPath)) return finalize(bundleDir, ["manifest.jsonl missing"], report, "NON-CERTIFIABLE");
  if (!existsSync(sealPath)) return finalize(bundleDir, ["MANIFEST.json (seal) missing"], report, "NON-CERTIFIABLE");
  const seal = JSON.parse(readFileSync(sealPath, "utf8"));

  // ── (2) chain + rootHash ────────────────────────────────────────────────
  const chain = verifyChain(bundleDir);
  report.checks.chain = { ok: chain.ok, lines: chain.lines, reason: chain.reason, firstDivergentSeq: chain.firstDivergentSeq };
  if (!chain.ok) {
    return finalize(bundleDir, [`chain broken at seq ${chain.firstDivergentSeq}: ${chain.reason}`], report, "TAMPER-SUSPECT");
  }
  if (chain.rootHash !== seal.rootHash) {
    return finalize(
      bundleDir,
      [`rootHash mismatch: manifest=${chain.rootHash.slice(0, 12)} seal=${String(seal.rootHash).slice(0, 12)}`],
      report,
      "TAMPER-SUSPECT",
    );
  }
  report.checks.rootHash = { ok: true, rootHash: chain.rootHash };

  // ── (1) raw <-> manifest reconciliation ──────────────────────────────────
  const manifestByPath = new Map();
  for (const e of chain.entries) {
    if (e.path) manifestByPath.set(e.path, e);
  }
  const onDisk = new Set(listRawFiles(bundleDir));
  let firstDivergent = null;
  for (const e of chain.entries) {
    if (!e.path) continue;
    const abs = join(bundleDir, e.path);
    if (!existsSync(abs)) {
      problems.push(`raw file referenced by seq ${e.seq} is MISSING: ${e.path}`);
      if (firstDivergent === null || e.seq < firstDivergent) firstDivergent = e.seq;
      continue;
    }
    const actual = sha256Hex(readFileSync(abs));
    if (actual !== e.sha256) {
      problems.push(`raw file ${e.path} (seq ${e.seq}) content changed: sha256 ${actual.slice(0, 12)} != ${String(e.sha256).slice(0, 12)}`);
      if (firstDivergent === null || e.seq < firstDivergent) firstDivergent = e.seq;
    }
    onDisk.delete(e.path);
  }
  const untracked = [...onDisk];
  if (untracked.length > 0) problems.push(`raw/ contains ${untracked.length} untracked file(s) not in manifest: ${untracked.slice(0, 5).join(", ")}`);
  report.checks.rawReconciliation = { ok: problems.length === 0, untracked };
  if (problems.length > 0) {
    return finalize(bundleDir, problems, report, "TAMPER-SUSPECT", firstDivergent);
  }

  // ── (3) re-execute recorded checks, diff vs summary ───────────────────────
  const summaryPath = join(bundleDir, "checks", "summary.machine.json");
  const read = createArtifactReader(bundleDir);
  if (existsSync(summaryPath)) {
    const summaryBytes = readFileSync(summaryPath);
    // Seal pins a digest of the summary; a summary edit that recompute might miss
    // (e.g. a narrative field) still breaks this.
    if (seal.checksDigest && sha256Hex(summaryBytes) !== seal.checksDigest) {
      return finalize(bundleDir, ["checks/summary.machine.json digest does not match seal — summary edited after seal"], report, "TAMPER-SUSPECT");
    }
    const summary = JSON.parse(summaryBytes.toString("utf8"));
    const mismatches = [];
    for (const check of summary.checks ?? []) {
      try {
        const re = rerun(read, check);
        if (re.pass !== check.pass || !deepEqual(re.observed, check.observed)) {
          mismatches.push({ id: check.id, recorded: { pass: check.pass, observed: check.observed }, recomputed: { pass: re.pass, observed: re.observed } });
        }
      } catch (e) {
        mismatches.push({ id: check.id, error: e.message });
      }
    }
    report.checks.recompute = { ok: mismatches.length === 0, total: (summary.checks ?? []).length, mismatches };
    if (mismatches.length > 0) {
      return finalize(bundleDir, [`${mismatches.length} recorded check(s) do not reproduce from raw — invented numbers`], report, "TAMPER-SUSPECT");
    }
  } else {
    report.checks.recompute = { ok: true, note: "no summary.machine.json (e.g. self-test bundle) — nothing to recompute" };
  }

  // ── (4) worker-proof bracket coverage ─────────────────────────────────────
  const bracketReport = verifyBrackets(chain.entries);
  report.checks.brackets = bracketReport;

  // ── (5) narrative lints ───────────────────────────────────────────────────
  const quoteLint = verifyQuotes(bundleDir);
  report.checks.narrativeLint = quoteLint;
  if (!quoteLint.ok) {
    problems.push(`narrative lint failed: ${quoteLint.unmatchedQuotes.length} unmatched quote(s), ${quoteLint.uncitedNumbers.length} uncited number(s)`);
  }

  // ── verdict ────────────────────────────────────────────────────────────────
  const certifiable = seal.certifiable !== false;
  let verdict;
  if (problems.length > 0) verdict = "TAMPER-SUSPECT";
  else if (!certifiable) verdict = "NON-CERTIFIABLE";
  else if (bracketReport.voided > 0) verdict = "NON-CERTIFIABLE";
  else verdict = "VERIFIED";

  return finalize(bundleDir, problems, report, verdict);
}

/** Verify each measurement artifact sits in a bracket whose open/close censuses agree. */
function verifyBrackets(entries) {
  const brackets = new Map(); // id -> { open, close }
  for (const e of entries) {
    if (e.kind === "worker-proof-open") brackets.set(e.meta?.bracketId, { open: e });
    if (e.kind === "worker-proof-close") {
      const b = brackets.get(e.meta?.bracketId) ?? {};
      b.close = e;
      brackets.set(e.meta?.bracketId, b);
    }
  }
  let voided = 0;
  const detail = [];
  for (const [id, b] of brackets) {
    const openPids = b.open?.meta?.pidSet ?? null;
    const closePids = b.close?.meta?.pidSet ?? null;
    const consistent = b.open && b.close && openPids && closePids && deepEqual([...openPids].sort(), [...closePids].sort());
    if (!consistent) {
      voided += 1;
      detail.push({ bracket: id, reason: !b.close ? "never closed" : "PID-set drift between open and close" });
    }
  }
  const measurements = entries.filter((e) => e.meta && e.meta.measurement === true);
  const unbracketed = measurements.filter((e) => !e.bracket).length;
  return { ok: voided === 0 && unbracketed === 0, brackets: brackets.size, voided, unbracketedMeasurements: unbracketed, detail };
}

function finalize(bundleDir, problems, report, verdict, firstDivergentSeq) {
  report.verdict = verdict;
  report.problems = problems;
  if (firstDivergentSeq !== undefined && firstDivergentSeq !== null) report.firstDivergentSeq = firstDivergentSeq;
  return report;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("verify-bundle.mjs");
if (isMain) {
  const bundleDir = process.argv[2];
  if (!bundleDir) {
    console.error("usage: node evidence-harness/verify/verify-bundle.mjs <bundle-dir>");
    process.exit(1);
  }
  let report;
  try {
    report = verifyBundle(bundleDir);
  } catch (e) {
    console.error(`[verify-bundle] error: ${e.message}`);
    process.exit(1);
  }
  const v = report.verdict;
  const line =
    v === "VERIFIED"
      ? "VERIFIED"
      : v === "TAMPER-SUSPECT"
        ? `TAMPER-SUSPECT${report.firstDivergentSeq !== undefined ? ` (first divergent seq=${report.firstDivergentSeq})` : ""}`
        : "NON-CERTIFIABLE";
  console.log("── verify-bundle ─────────────────────────────");
  console.log(`bundle:  ${bundleDir}`);
  console.log(`chain:   ${report.checks.chain?.ok ? "ok" : "BROKEN"} (${report.checks.chain?.lines ?? "?"} lines)`);
  console.log(`rootHash:${report.checks.rootHash?.ok ? " matches seal" : " MISMATCH"}`);
  if (report.checks.recompute) console.log(`recompute:${report.checks.recompute.ok ? " all checks reproduce" : ` ${report.checks.recompute.mismatches.length} MISMATCH`}`);
  if (report.checks.brackets) console.log(`brackets:${report.checks.brackets.ok ? " ok" : ` ${report.checks.brackets.voided} VOID`}`);
  if (report.checks.narrativeLint) console.log(`narrative:${report.checks.narrativeLint.ok ? " clean" : " LINT FAIL"} (${report.checks.narrativeLint.narrativeFiles} file(s))`);
  if (report.problems && report.problems.length) {
    console.log("problems:");
    for (const p of report.problems) console.log(`  - ${p}`);
  }
  console.log("──────────────────────────────────────────────");
  console.log(`VERDICT: ${line}`);
  process.exit(v === "VERIFIED" ? 0 : v === "TAMPER-SUSPECT" ? 2 : 3);
}
