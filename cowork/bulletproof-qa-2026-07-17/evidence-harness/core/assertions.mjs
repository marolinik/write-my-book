// core/assertions.mjs — check evaluators; the credibility core (W-F3 §0.3, §3.1).
//
// EVERY number and boolean in a bundle is produced here, from the ON-DISK raw
// artifact, with a recorded source pointer {artifact, path|byteRange, method}.
// This is the direct countermeasure to the D-45 class: a narrated "21/21 PASS"
// over a raw `ok:false` is definitionally uncited, because a number with no
// machine check behind it does not exist in summary.machine.json.
//
// Pure functions of (raw bytes on disk, args). verify-bundle.ts re-runs these
// against the same raw and diffs — so results are reproducible by construction.
//
// Node built-ins only.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonPath } from "./jsonpath.mjs";

/**
 * A resolver that maps an artifact ref (relative path under the bundle) to its
 * bytes. Bound to a bundle dir so both the suite and the verifier read the same
 * files.
 * @param {string} bundleDir
 */
export function createArtifactReader(bundleDir) {
  const cache = new Map();
  return function read(relPath) {
    if (cache.has(relPath)) return cache.get(relPath);
    const buf = readFileSync(join(bundleDir, relPath));
    cache.set(relPath, buf);
    return buf;
  };
}

// ── individual check methods ──────────────────────────────────────────────
// Each returns { pass, method, args, source, observed, detail }.

/**
 * byteSubstring: does `needle` (string) appear verbatim in artifact bytes?
 * The anti-misquote / anti-fabricated-quote primitive (§2.3).
 */
export function byteSubstring(read, { id, needle, artifact }) {
  const hay = read(artifact);
  const idx = hay.indexOf(Buffer.from(needle, "utf8"));
  const pass = idx !== -1;
  return {
    id,
    method: "byteSubstring",
    args: { needle, artifact },
    source: { artifact, byteRange: pass ? [idx, idx + Buffer.byteLength(needle)] : null },
    observed: pass,
    pass,
    detail: pass ? null : "needle not found verbatim in artifact",
  };
}

/** jsonPathEquals: value at path in a JSON artifact deep-equals `expected`. */
export function jsonPathEquals(read, { id, artifact, path, expected }) {
  const obj = JSON.parse(read(artifact).toString("utf8"));
  const matches = jsonPath(obj, path);
  const observed = matches.length === 1 ? matches[0] : matches;
  const pass = deepEqual(observed, expected);
  return {
    id,
    method: "jsonPathEquals",
    args: { artifact, path, expected },
    source: { artifact, path },
    observed,
    pass,
    detail: pass ? null : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(observed)}`,
  };
}

/** numericBound: numeric value at path within [min, max] (either optional). */
export function numericBound(read, { id, artifact, path, min, max }) {
  const obj = JSON.parse(read(artifact).toString("utf8"));
  const matches = jsonPath(obj, path);
  const value = matches.length > 0 ? Number(matches[0]) : NaN;
  let pass = Number.isFinite(value);
  if (pass && min !== undefined) pass = value >= min;
  if (pass && max !== undefined) pass = value <= max;
  return {
    id,
    method: "numericBound",
    args: { artifact, path, min, max },
    source: { artifact, path },
    observed: value,
    pass,
    detail: pass ? null : `value ${value} outside [${min ?? "-inf"}, ${max ?? "+inf"}]`,
  };
}

/** jsonPathCount: number of matches at a (usually wildcard) path within [min,max]. */
export function jsonPathCount(read, { id, artifact, path, min, max }) {
  const obj = JSON.parse(read(artifact).toString("utf8"));
  const count = jsonPath(obj, path).length;
  let pass = true;
  if (min !== undefined) pass = pass && count >= min;
  if (max !== undefined) pass = pass && count <= max;
  return {
    id,
    method: "jsonPathCount",
    args: { artifact, path, min, max },
    source: { artifact, path },
    observed: count,
    pass,
    detail: pass ? null : `count ${count} outside [${min ?? 0}, ${max ?? "+inf"}]`,
  };
}

/**
 * countAtLeast: fail-closed pre-registered-N gate (§3.1). If observed < declaredN
 * the verdict is UNDER-N and the whole suite is non-certifiable — never rounds up.
 */
export function countAtLeast({ id, observed, declaredN, unit }) {
  const pass = observed >= declaredN;
  return {
    id,
    method: "countAtLeast",
    args: { declaredN, unit },
    source: null,
    observed,
    pass,
    verdict: pass ? "MET" : "UNDER-N",
    detail: pass ? null : `observed ${observed} < pre-registered ${declaredN} ${unit ?? ""}`.trim(),
  };
}

// ── dispatch (used by verify-bundle to re-run a recorded check) ────────────

/**
 * Re-execute a recorded check from summary.machine.json against raw. Used only by
 * the verifier; suites call the typed functions above directly.
 * @param {(rel:string)=>Buffer} read
 * @param {object} check  a recorded check with { method, args } (+ observed/pass to diff)
 */
export function rerun(read, check) {
  switch (check.method) {
    case "byteSubstring":
      return byteSubstring(read, { id: check.id, ...check.args });
    case "jsonPathEquals":
      return jsonPathEquals(read, { id: check.id, ...check.args });
    case "numericBound":
      return numericBound(read, { id: check.id, ...check.args });
    case "jsonPathCount":
      return jsonPathCount(read, { id: check.id, ...check.args });
    case "countAtLeast":
      return countAtLeast({ id: check.id, observed: check.observed, ...check.args });
    default:
      throw new Error(`rerun: unknown method "${check.method}"`);
  }
}

// ── summary emitter ────────────────────────────────────────────────────────

/**
 * Assemble checks/summary.machine.json. This is the ONLY place numbers live.
 * @param {{ suiteId: string, checks: object[], coverage: object, extra?: object }} p
 */
export function buildSummary({ suiteId, checks, coverage, extra }) {
  const failed = checks.filter((c) => !c.pass);
  const underN = checks.filter((c) => c.verdict === "UNDER-N");
  return {
    suiteId,
    generatedAtUtc: new Date().toISOString(),
    verdict: failed.length === 0 ? "PASS" : underN.length > 0 ? "UNDER-N" : "FAIL",
    totals: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
    coverage,
    checks,
    ...(extra ?? {}),
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] !== kb[i]) return false;
      if (!deepEqual(a[ka[i]], b[kb[i]])) return false;
    }
    return true;
  }
  return false;
}
