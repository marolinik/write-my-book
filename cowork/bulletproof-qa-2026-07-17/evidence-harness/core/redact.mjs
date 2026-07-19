// core/redact.mjs — deterministic secret scrubbing BEFORE hashing (W-F3 §2.4).
//
// Contract:
//   - Redaction runs on raw bytes BEFORE the artifact is hashed & written, so the
//     hash is the hash of exactly what lands on disk — verification never has to
//     reconstruct a pre-redaction copy.
//   - The policy is a fixed, versioned list of env-var names. Each secret's live
//     VALUE (read from process.env / ork.txt at build time) is what gets matched
//     and replaced with `[REDACTED:<VAR_NAME>]`. We never ship a secret pattern,
//     only the substitution marker.
//   - Idempotent: redact(redact(x)) === redact(x). The marker contains no secret,
//     so a second pass finds nothing.
//   - Leak-detection mode: detectSecrets() reports WHICH secrets appeared (boolean
//     findings) so a BYOK-key-leak suite can evidence a leak — then scrub, so the
//     secret never persists in the sealed bundle.
//
// Node built-ins only.

import { readFileSync, existsSync } from "node:fs";

export const REDACTION_POLICY_VERSION = "1.0.0";

// Env vars whose VALUES are secrets. Order matters only for display; matching is
// longest-value-first (see buildRedactor) so a secret that is a substring of a
// longer secret is handled correctly.
export const SECRET_ENV_VARS = Object.freeze([
  "E2E_TEST_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEO4J_PASSWORD",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "QDRANT_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
]);

/**
 * Extract the password segment of a URL-shaped secret (DATABASE_URL, REDIS_URL).
 * @param {string|undefined} url
 * @returns {string|null}
 */
function urlPassword(url) {
  if (!url) return null;
  // redis://:pass@host / postgres://user:pass@host
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/[^:@/]*:([^@/]+)@/i);
  return m && m[1] ? m[1] : null;
}

/**
 * Build a redactor bound to a specific environment snapshot.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ orkPath?: string }} [opts]
 * @returns {{
 *   policyVersion: string,
 *   secretNames: string[],
 *   detectSecrets: (bytes: Buffer) => Array<{ name: string, count: number }>,
 *   redact: (bytes: Buffer) => { bytes: Buffer, redactions: number, findings: Array<{ name: string, count: number }> },
 *   policyManifest: () => object,
 * }}
 */
export function buildRedactor(env = process.env, opts = {}) {
  /** @type {Array<{ name: string, value: string }>} */
  const secrets = [];

  for (const name of SECRET_ENV_VARS) {
    const v = env[name];
    if (typeof v === "string" && v.length >= 6) secrets.push({ name, value: v });
  }

  const dbPw = urlPassword(env.DATABASE_URL);
  if (dbPw && dbPw.length >= 4) secrets.push({ name: "DATABASE_URL_PASSWORD", value: dbPw });
  const redisPw = urlPassword(env.REDIS_URL);
  if (redisPw && redisPw.length >= 4) secrets.push({ name: "REDIS_URL_PASSWORD", value: redisPw });

  // OpenRouter BYOK key lives in ork.txt (gitignored) per ENVIRONMENT-AND-LIMITS.
  const orkPath = opts.orkPath ?? "ork.txt";
  try {
    if (existsSync(orkPath)) {
      const ork = readFileSync(orkPath, "utf8").trim();
      if (ork.length >= 8) secrets.push({ name: "ORK_TXT_KEY", value: ork });
    }
  } catch {
    // ork.txt unreadable — nothing to add; not fatal.
  }

  // Longest first so overlapping secrets replace deterministically.
  secrets.sort((a, b) => b.value.length - a.value.length);

  // De-dup by value (two env vars can hold the same secret).
  const seen = new Set();
  const uniq = secrets.filter((s) => (seen.has(s.value) ? false : (seen.add(s.value), true)));

  function detectSecrets(bytes) {
    const text = bytes.toString("latin1"); // byte-preserving scan
    /** @type {Array<{ name: string, count: number }>} */
    const findings = [];
    for (const s of uniq) {
      let count = 0;
      let idx = text.indexOf(s.value);
      while (idx !== -1) {
        count += 1;
        idx = text.indexOf(s.value, idx + s.value.length);
      }
      if (count > 0) findings.push({ name: s.name, count });
    }
    return findings;
  }

  function redact(bytes) {
    let text = bytes.toString("latin1");
    let redactions = 0;
    /** @type {Array<{ name: string, count: number }>} */
    const findings = [];
    for (const s of uniq) {
      let count = 0;
      let idx = text.indexOf(s.value);
      if (idx === -1) continue;
      const marker = `[REDACTED:${s.name}]`;
      while (idx !== -1) {
        text = text.slice(0, idx) + marker + text.slice(idx + s.value.length);
        count += 1;
        idx = text.indexOf(s.value, idx + marker.length);
      }
      redactions += count;
      findings.push({ name: s.name, count });
    }
    return { bytes: Buffer.from(text, "latin1"), redactions, findings };
  }

  function policyManifest() {
    return {
      policyVersion: REDACTION_POLICY_VERSION,
      secretsScrubbed: uniq.map((s) => ({ name: s.name, length: s.value.length })),
      note: "Values scrubbed BEFORE hashing. Markers of form [REDACTED:NAME]. No secret persists in the bundle.",
    };
  }

  return {
    policyVersion: REDACTION_POLICY_VERSION,
    secretNames: uniq.map((s) => s.name),
    detectSecrets,
    redact,
    policyManifest,
  };
}
