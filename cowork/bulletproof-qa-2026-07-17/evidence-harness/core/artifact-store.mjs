// core/artifact-store.mjs — content-addressed raw byte store (W-F3 §2.1-§2.4).
//
// Every observation the harness makes is written here VERBATIM (post-redaction)
// and content-hashed BEFORE any assertion reads it, so the judged artifact is
// provably the asserted artifact ("raw bytes or it didn't happen", design §0.2).
//
//   writeRaw(bytes)  — captured HTTP bodies / SSE streams / process stdout. NO
//                      JSON.parse -> re-stringify round trip (that is a paraphrase).
//   writeJson(obj)   — harness-produced structured snapshots (DB/Redis/Neo4j rows,
//                      worker censuses). Serialized once, then treated as raw bytes.
//
// Filenames are `<sha256[0..12]>-<label>` under raw/. Content-addressing makes
// re-writing identical bytes idempotent and makes the filename self-verifying.
//
// Node built-ins only.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "./manifest.mjs";

const SAFE_LABEL = /[^a-zA-Z0-9._-]/g;

function safeLabel(label) {
  return String(label).replace(SAFE_LABEL, "_").slice(0, 80) || "artifact";
}

/**
 * @param {string} bundleDir
 * @param {{ redactor: import("./redact.mjs").buildRedactor extends any ? any : any, manifest: any, detectLeaks?: boolean }} deps
 */
export function createStore(bundleDir, deps) {
  const rawDir = join(bundleDir, "raw");
  if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
  const { redactor, manifest } = deps;

  /**
   * @param {Buffer} rawBytes
   * @param {{ label: string, kind: string, ext?: string, meta?: object, bracket?: string|null }} opts
   * @returns {{ id: string, sha256: string, path: string, bytes: number, redactions: number, leakFindings: object[] }}
   */
  function writeRaw(rawBytes, opts) {
    const bytes = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(String(rawBytes));
    // Leak detection (for BYOK-leak suites) BEFORE scrubbing, per §2.4.
    const leakFindings = deps.detectLeaks ? redactor.detectSecrets(bytes) : [];
    const { bytes: clean, redactions } = redactor.redact(bytes);
    const hash = sha256Hex(clean);
    const ext = opts.ext ? (opts.ext.startsWith(".") ? opts.ext : "." + opts.ext) : "";
    const fileName = `${hash.slice(0, 12)}-${safeLabel(opts.label)}${ext}`;
    const filePath = join(rawDir, fileName);
    const relPath = `raw/${fileName}`;

    // Content-addressed: if a file with this name exists, it must be these exact
    // bytes (same hash). Different content colliding on the 12-char prefix is
    // astronomically unlikely, but guard so we never silently overwrite.
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath);
      if (sha256Hex(existing) !== hash) {
        throw new Error(`[artifact-store] hash-prefix collision on ${fileName}; refusing overwrite`);
      }
    } else {
      writeFileSync(filePath, clean);
    }

    const meta = { ...(opts.meta ?? {}), redactions };
    if (leakFindings.length > 0) meta.leakFindings = leakFindings;
    manifest.append({
      kind: opts.kind,
      path: relPath,
      sha256: hash,
      bytes: clean.length,
      bracket: opts.bracket ?? null,
      meta,
    });

    return { id: hash.slice(0, 12), sha256: hash, path: relPath, bytes: clean.length, redactions, leakFindings };
  }

  /**
   * Structured harness-produced artifact. Serialized deterministically (2-space
   * pretty) and then stored as raw bytes.
   * @param {object} obj
   * @param {{ label: string, kind: string, meta?: object, bracket?: string|null }} opts
   */
  function writeJson(obj, opts) {
    const bytes = Buffer.from(JSON.stringify(obj, null, 2) + "\n");
    return writeRaw(bytes, { ...opts, ext: ".json" });
  }

  return { writeRaw, writeJson, rawDir };
}
