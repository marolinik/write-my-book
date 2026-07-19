// selftest/demo.mjs — proves the harness proves its OWN integrity (W-F3 brief).
//
// Runs with NO live infra (core + verify only):
//   1. Capture a few sample artifacts (incl. one carrying a fake secret to show
//      redaction, and a worker-proof bracket around a measurement).
//   2. Emit a real machine check + summary, then seal.
//   3. verify-bundle -> expect VERIFIED.
//   4. Tamper A: flip one byte of a raw artifact  -> expect TAMPER-SUSPECT.
//   5. Tamper B: edit one byte of manifest.jsonl  -> expect TAMPER-SUSPECT (chain).
//   6. Tamper C: forge a number in summary.json   -> expect TAMPER-SUSPECT (recompute).
//
//   Run: node evidence-harness/selftest/demo.mjs [workdir]
//
// Node built-ins only.

import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createManifest, sha256Hex } from "../core/manifest.mjs";
import { buildRedactor } from "../core/redact.mjs";
import { createStore } from "../core/artifact-store.mjs";
import { byteSubstring, buildSummary, createArtifactReader } from "../core/assertions.mjs";
import { verifyBundle } from "../verify/verify-bundle.mjs";

const FAKE_SECRET = "sk_test_FAKE_SECRET_e2e_do_not_ship_1234567890";

function line(s = "") {
  console.log(s);
}

function runVerify(bundleDir, label) {
  const r = verifyBundle(bundleDir);
  line(`  [${label}] VERDICT = ${r.verdict}` + (r.firstDivergentSeq !== undefined ? ` (first divergent seq=${r.firstDivergentSeq})` : ""));
  if (r.problems && r.problems.length) for (const p of r.problems) line(`        · ${p}`);
  return r.verdict;
}

function buildBundle(bundleDir) {
  mkdirSync(bundleDir, { recursive: true });
  mkdirSync(join(bundleDir, "checks"), { recursive: true });

  // Redactor with a fake secret injected into the env snapshot.
  const redactor = buildRedactor({ E2E_TEST_SECRET: FAKE_SECRET }, { orkPath: "___nonexistent___" });
  const manifest = createManifest(bundleDir);
  const store = createStore(bundleDir, { redactor, manifest, detectLeaks: true });

  // Worker-proof bracket OPEN (fake but structurally real census).
  const pidSet = [1111, 2222];
  manifest.append({ kind: "worker-proof-open", meta: { bracketId: "wp-001", pidSet, source: "selftest-synthetic" } });

  // A captured HTTP response body (raw bytes, verbatim). Contains an anchor we
  // will byte-match, and the fake secret to prove redaction-before-hash.
  const httpBody = Buffer.from(
    JSON.stringify({ ok: true, findings: [{ anchorText: "the lighthouse keeper wound the clock" }], debugToken: FAKE_SECRET }),
  );
  const resArtifact = store.writeRaw(httpBody, {
    label: "res-findings",
    kind: "http-res",
    ext: ".bin",
    bracket: "wp-001",
    meta: { measurement: true, step: "f001", status: 200 },
  });

  // A JSON snapshot artifact.
  store.writeJson({ table: "subscriptions", rows: [{ id: "sub_1", status: "active" }] }, { label: "db-subscriptions", kind: "db-snapshot", bracket: "wp-001" });

  // Worker-proof bracket CLOSE with the SAME pid set (consistent -> not voided).
  manifest.append({ kind: "worker-proof-close", meta: { bracketId: "wp-001", pidSet, source: "selftest-synthetic" } });

  // Real machine check: the anchor text must byte-match the captured response.
  const read = createArtifactReader(bundleDir);
  const check = byteSubstring(read, {
    id: "anchor-byte-match-f001",
    needle: "the lighthouse keeper wound the clock",
    artifact: resArtifact.path,
  });
  const summary = buildSummary({
    suiteId: "selftest",
    checks: [check],
    coverage: { metric: "selftest-anchor", observed: 1, declaredN: 1, verdict: "MET" },
  });
  const summaryBytes = Buffer.from(JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(bundleDir, "checks", "summary.machine.json"), summaryBytes);

  // Seal: pin the summary digest + verdict index.
  const sealInfo = manifest.seal({
    runId: "selftest-0001",
    env: { note: "selftest — synthetic env", node: process.version },
    scenarios: [],
    verdictIndex: { verdict: summary.verdict, checks: summary.totals },
    checksDigest: sha256Hex(summaryBytes),
    certifiable: true,
    redactionPolicy: redactor.policyManifest(),
  });

  return { sealInfo, resArtifact, leaked: resArtifact.leakFindings };
}

function main() {
  const base = process.argv[2] || join(tmpdir(), "wmb-harness-selftest");
  const bundleDir = join(base, "bundle");
  if (existsSync(base)) rmSync(base, { recursive: true, force: true });

  line("== W-F3 evidence-harness self-test ==");
  line("");
  line("[1] build + seal a sample bundle");
  const { sealInfo, resArtifact, leaked } = buildBundle(bundleDir);
  line(`  rootHash = ${sealInfo.rootHash}`);
  line(`  redaction: fake secret in response body was scrubbed before hashing (redactions=${resArtifact.redactions}); leak detector saw: ${JSON.stringify(leaked)}`);
  const rawFindings = readFileSync(join(bundleDir, resArtifact.path), "utf8");
  line(`  on-disk response body contains the secret? ${rawFindings.includes(FAKE_SECRET) ? "YES (BUG)" : "no — [REDACTED] marker only"}`);
  line("");

  line("[2] verify the intact bundle");
  const v0 = runVerify(bundleDir, "intact");
  line("");

  line("[3] TAMPER A — flip one byte of a raw artifact");
  const rawPath = join(bundleDir, resArtifact.path);
  const original = readFileSync(rawPath);
  const mutated = Buffer.from(original);
  mutated[Math.floor(mutated.length / 2)] ^= 0x01; // flip a bit mid-file
  writeFileSync(rawPath, mutated);
  const vA = runVerify(bundleDir, "raw-byte-flipped");
  writeFileSync(rawPath, original); // restore
  line("");

  line("[4] TAMPER B — edit one byte of manifest.jsonl (break the hash chain)");
  const manPath = join(bundleDir, "manifest.jsonl");
  const manOrig = readFileSync(manPath, "utf8");
  // Change a byte count in an early line so the line bytes differ -> chain breaks.
  const manMut = manOrig.replace('"bytes":', '"bYtes":');
  writeFileSync(manPath, manMut);
  const vB = runVerify(bundleDir, "manifest-edited");
  writeFileSync(manPath, manOrig); // restore
  line("");

  line("[5] TAMPER C — forge a number in checks/summary.machine.json");
  const sumPath = join(bundleDir, "checks", "summary.machine.json");
  const sumOrig = readFileSync(sumPath, "utf8");
  const sumMut = sumOrig.replace('"passed": 1', '"passed": 999').replace('"observed": true', '"observed": false');
  writeFileSync(sumPath, sumMut);
  const vC = runVerify(bundleDir, "summary-forged");
  writeFileSync(sumPath, sumOrig); // restore
  line("");

  line("[6] re-verify after restoring every file");
  const v1 = runVerify(bundleDir, "restored");
  line("");

  const ok =
    v0 === "VERIFIED" &&
    vA === "TAMPER-SUSPECT" &&
    vB === "TAMPER-SUSPECT" &&
    vC === "TAMPER-SUSPECT" &&
    v1 === "VERIFIED" &&
    !rawFindings.includes(FAKE_SECRET);

  line("== SELF-TEST " + (ok ? "PASS" : "FAIL") + " ==");
  line(`   intact=${v0}  tamperA=${vA}  tamperB=${vB}  tamperC=${vC}  restored=${v1}`);
  process.exit(ok ? 0 : 1);
}

main();
