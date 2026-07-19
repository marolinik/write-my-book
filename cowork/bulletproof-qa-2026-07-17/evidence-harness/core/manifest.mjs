// core/manifest.mjs — append-only hash-chained manifest + final seal (W-F3 §2.1).
//
// Tamper model:
//   - manifest.jsonl is append-only. Each line is a JSON object whose `prev`
//     field is the sha256 of the PREVIOUS line's exact on-disk bytes (the JSON
//     string, no trailing newline). Line 0's prev is GENESIS (64 zeros).
//   - Any post-hoc edit, deletion, or insertion of a raw artifact OR a manifest
//     line breaks the chain from that point forward: a verifier re-reads the
//     literal lines from disk and recomputes each `prev` — it never trusts the
//     writer's construction, only the bytes.
//   - Seal writes MANIFEST.json with rootHash = sha256(entire manifest.jsonl).
//     rootHash pins the whole chain in one value; a git commit of MANIFEST.json +
//     manifest.jsonl anchors it to an independent clock (git commit time).
//
// Node built-ins only (crypto, fs, path).

import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { now } from "./clock.mjs";

export const HARNESS_VERSION = "1.0.0";
export const GENESIS = "0".repeat(64);

/** sha256 hex of a string or Buffer. */
export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Create a manifest writer bound to a bundle directory. Opens (creates) an
 * empty manifest.jsonl. Refuses to reopen a non-empty one — a bundle is written
 * exactly once and never appended to across runs (design §1.4).
 *
 * @param {string} bundleDir
 * @returns {{
 *   append: (entry: object) => { seq: number, lineHash: string },
 *   seal: (sealMeta: object) => { rootHash: string, manifestPath: string, sealPath: string },
 *   count: () => number,
 *   lastHash: () => string,
 * }}
 */
export function createManifest(bundleDir) {
  const manifestPath = join(bundleDir, "manifest.jsonl");
  if (existsSync(manifestPath) && readFileSync(manifestPath, "utf8").length > 0) {
    throw new Error(
      `[manifest] refusing to append to a non-empty manifest.jsonl: ${manifestPath}. ` +
        `Bundles are write-once; start a fresh run directory.`,
    );
  }
  // Establish the file (empty).
  writeFileSync(manifestPath, "");

  let seq = 0;
  let prevHash = GENESIS;

  /**
   * Append one entry. Fixed key order keeps lines human-diffable; verification
   * does NOT depend on key order (it hashes literal on-disk bytes).
   * @param {{ kind: string, path?: string, sha256?: string, bytes?: number, meta?: object, bracket?: string|null }} e
   */
  function append(e) {
    const t = now();
    const entry = {
      seq,
      prev: prevHash,
      ts_utc: t.utc,
      ts_mono: t.mono,
      kind: e.kind,
      path: e.path ?? null,
      sha256: e.sha256 ?? null,
      bytes: e.bytes ?? null,
      bracket: e.bracket ?? null,
      meta: e.meta ?? {},
    };
    const line = JSON.stringify(entry);
    appendFileSync(manifestPath, line + "\n");
    const lineHash = sha256Hex(line);
    prevHash = lineHash;
    const written = { seq, lineHash };
    seq += 1;
    return written;
  }

  /**
   * Seal the bundle: compute rootHash over the whole manifest.jsonl and write
   * MANIFEST.json. Returns rootHash so run.ts can log/commit it.
   * @param {object} sealMeta  { runId, env, scenarios, verdictIndex, certifiable, redactionPolicy, notes }
   */
  function seal(sealMeta) {
    const manifestBytes = readFileSync(manifestPath);
    const rootHash = sha256Hex(manifestBytes);
    const t = now();
    const seal = {
      harnessVersion: HARNESS_VERSION,
      sealedAtUtc: t.utc,
      sealedAtMono: t.mono,
      manifestLines: seq,
      rootHash,
      ...sealMeta,
    };
    const sealPath = join(bundleDir, "MANIFEST.json");
    writeFileSync(sealPath, JSON.stringify(seal, null, 2) + "\n");
    return { rootHash, manifestPath, sealPath };
  }

  return { append, seal, count: () => seq, lastHash: () => prevHash };
}

/**
 * Independent chain verifier — used by verify-bundle.ts and re-usable in tests.
 * Reads the literal lines and re-derives every `prev`. Does NOT trust any writer.
 *
 * @param {string} bundleDir
 * @returns {{
 *   ok: boolean,
 *   lines: number,
 *   rootHash: string,
 *   firstDivergentSeq: number|null,
 *   reason: string|null,
 *   entries: object[],
 * }}
 */
export function verifyChain(bundleDir) {
  const manifestPath = join(bundleDir, "manifest.jsonl");
  const raw = readFileSync(manifestPath); // bytes for rootHash
  const rootHash = sha256Hex(raw);
  const text = raw.toString("utf8");
  // Split on \n but keep exact line bytes: everything up to (not incl) the \n.
  const rawLines = text.length === 0 ? [] : text.replace(/\n$/, "").split("\n");

  /** @type {object[]} */
  const entries = [];
  let expectedPrev = GENESIS;
  for (let i = 0; i < rawLines.length; i += 1) {
    const lineStr = rawLines[i];
    let entry;
    try {
      entry = JSON.parse(lineStr);
    } catch {
      return {
        ok: false,
        lines: rawLines.length,
        rootHash,
        firstDivergentSeq: i,
        reason: `line ${i} is not valid JSON`,
        entries,
      };
    }
    entries.push(entry);
    if (entry.seq !== i) {
      return {
        ok: false,
        lines: rawLines.length,
        rootHash,
        firstDivergentSeq: i,
        reason: `line ${i} has seq=${entry.seq} (expected ${i}) — insertion/deletion`,
        entries,
      };
    }
    if (entry.prev !== expectedPrev) {
      return {
        ok: false,
        lines: rawLines.length,
        rootHash,
        firstDivergentSeq: i,
        reason: `line ${i} prev mismatch: chain broken (a prior line's bytes changed)`,
        entries,
      };
    }
    expectedPrev = sha256Hex(lineStr);
  }

  return { ok: true, lines: rawLines.length, rootHash, firstDivergentSeq: null, reason: null, entries };
}
