// core/blind-pairing.mjs — blind, sealed A/B pairing for voice-flattening (§3.2).
//
// Mechanically extracts before/after hunks from a line-edit diff (NO model),
// assigns each hunk pair a random A/B side with a seeded PRNG, writes the blinded
// pairs to disk, and SEALS the pairing key separately. The key's hash is pinned in
// the manifest at seal time, so re-pairing after the fact is impossible without
// breaking the seal — judges file blind verdicts first, open the key second.
//
// Node built-ins only.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32, shuffle } from "./prng.mjs";

/**
 * Line-level hunk diff between two texts. Returns changed hunks as {before, after}.
 * Simple LCS-free approach: split into paragraphs and pair by position where they
 * differ. Sufficient for line-edit before/after where structure is preserved.
 * @param {string} before
 * @param {string} after
 */
export function extractHunks(before, after) {
  const b = before.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const a = after.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const hunks = [];
  const n = Math.min(b.length, a.length);
  for (let i = 0; i < n; i += 1) {
    if (b[i] !== a[i]) hunks.push({ index: i, before: b[i], after: a[i] });
  }
  return hunks;
}

/**
 * Build blinded pairs + a sealed key.
 * @param {Array<{before:string, after:string}>} hunks
 * @param {{ dir: string, seed: number, store?: any }} opts
 * @returns {{ pairs: number, key: object[], keyPath: string }}
 */
export function buildBlindPairs(hunks, opts) {
  const rng = mulberry32(opts.seed >>> 0);
  const pairsDir = join(opts.dir, "pairs");
  const sealedDir = join(opts.dir, "sealed");
  mkdirSync(pairsDir, { recursive: true });
  mkdirSync(sealedDir, { recursive: true });

  const key = [];
  hunks.forEach((h, i) => {
    const n = i + 1;
    // Randomly decide which side (A/B) holds the ORIGINAL vs the edited hunk.
    const originalIsA = rng() < 0.5;
    const sideA = originalIsA ? h.before : h.after;
    const sideB = originalIsA ? h.after : h.before;
    writeFileSync(join(pairsDir, `pair-${n}-A.txt`), sideA + "\n");
    writeFileSync(join(pairsDir, `pair-${n}-B.txt`), sideB + "\n");
    key.push({ pair: n, A: originalIsA ? "original" : "edited", B: originalIsA ? "edited" : "original" });
  });

  const keyObj = { seed: opts.seed >>> 0, pairs: key.length, key };
  const keyPath = join(sealedDir, "pairing-key.json");
  writeFileSync(keyPath, JSON.stringify(keyObj, null, 2) + "\n");

  // Pin the key's bytes into the manifest at seal time.
  if (opts.store) {
    opts.store.writeJson(keyObj, { label: "voice-pairing-key", kind: "sealed-pairing-key", meta: { pairs: key.length, note: "judges open AFTER filing blind verdicts" } });
  }
  return { pairs: key.length, key, keyPath };
}
