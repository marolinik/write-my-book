// core/scenario.mjs — scenario-spec loader + validation + pre-registration proof.
//
// A scenario spec (evidence-harness/scenarios/<suite>.json) is the pre-
// registration instrument (design §3.1). "Pre-registered" is PROVABLE, not
// asserted: the runner requires the spec file to be clean against HEAD and records
// the commit that introduced its current blob. Changing N after seeing results
// therefore needs a visible commit that postdates the first run — the manifest's
// git anchor makes that a lookup, not an argument.
//
// Schema validation is hand-rolled (no zod dependency — keeps the credibility core
// import-free so a context-free judge can run the verifier anywhere).
//
// Node built-ins only.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { relative, isAbsolute } from "node:path";

const REPO_ROOT = process.cwd();

/** Minimal type assertions with a field path for readable errors. */
function req(obj, key, type, where) {
  if (!(key in obj)) throw new Error(`[scenario] missing "${where}.${key}"`);
  const v = obj[key];
  const actual = Array.isArray(v) ? "array" : typeof v;
  if (type && actual !== type) {
    throw new Error(`[scenario] "${where}.${key}" must be ${type}, got ${actual}`);
  }
  return v;
}

/**
 * Load + validate a scenario spec and attach its pre-registration proof.
 * @param {string} specPath
 * @returns {object} validated spec with `._preRegistration`
 */
export function loadScenario(specPath) {
  if (!existsSync(specPath)) throw new Error(`[scenario] spec not found: ${specPath}`);
  const rawBytes = readFileSync(specPath);
  let spec;
  try {
    spec = JSON.parse(rawBytes.toString("utf8"));
  } catch (e) {
    throw new Error(`[scenario] ${specPath} is not valid JSON: ${e.message}`);
  }

  req(spec, "suiteId", "string", "spec");
  req(spec, "protocolRef", "string", "spec");
  const pre = req(spec, "preRegistered", "object", "spec");
  req(pre, "metric", "string", "preRegistered");
  req(pre, "n", "number", "preRegistered");
  req(pre, "unit", "string", "preRegistered");
  req(pre, "threshold", "string", "preRegistered");
  req(pre, "model", "string", "preRegistered");
  const checks = req(spec, "checks", "array", "spec");
  for (let i = 0; i < checks.length; i += 1) {
    req(checks[i], "id", "string", `checks[${i}]`);
    req(checks[i], "method", "string", `checks[${i}]`);
  }

  spec._preRegistration = preRegistrationProof(specPath, rawBytes);
  spec._specPath = specPath;
  return spec;
}

/**
 * Git-anchored pre-registration proof for a spec file.
 * @param {string} specPath
 * @param {Buffer} rawBytes
 */
export function preRegistrationProof(specPath, rawBytes) {
  const rel = isAbsolute(specPath) ? relative(REPO_ROOT, specPath) : specPath;
  const proof = {
    specPath: rel,
    workingTreeBlobSha: gitHashObject(rawBytes),
    tracked: false,
    cleanAgainstHead: false,
    preRegistered: false,
    introducedByCommit: null,
    lastCommitIso: null,
    note: null,
  };

  // A spec is genuinely pre-registered only if it is TRACKED and clean. git diff
  // silently ignores untracked files (they are not "different from HEAD"), so an
  // untracked spec must NOT read as clean — check tracked status explicitly first.
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", rel], { cwd: REPO_ROOT, stdio: "ignore" });
    proof.tracked = true;
  } catch {
    proof.tracked = false;
  }

  if (!proof.tracked) {
    proof.cleanAgainstHead = false;
    proof.preRegistered = false;
    proof.note = "spec is UNTRACKED — not yet pre-registered. Commit it before a certifiable run (a judge will see the commit postdate any results).";
  } else {
    try {
      execFileSync("git", ["diff", "--quiet", "HEAD", "--", rel], { cwd: REPO_ROOT });
      proof.cleanAgainstHead = true;
      proof.preRegistered = true;
    } catch {
      proof.cleanAgainstHead = false;
      proof.preRegistered = false;
      proof.note = "spec differs from HEAD — uncommitted edits; not pre-registered. Commit before a certifiable run.";
    }
  }

  try {
    const log = execFileSync(
      "git",
      ["log", "-1", "--follow", "--format=%H%x09%aI", "--", rel],
      { cwd: REPO_ROOT, encoding: "utf8" },
    ).trim();
    if (log) {
      const [commit, iso] = log.split("\t");
      proof.introducedByCommit = commit;
      proof.lastCommitIso = iso;
    }
  } catch {
    // never committed — introducedByCommit stays null; visible to a judge.
  }

  return proof;
}

/** Blob SHA of the working-tree bytes (matches committed only when clean). */
function gitHashObject(bytes) {
  try {
    return execFileSync("git", ["hash-object", "--stdin"], { input: bytes, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
