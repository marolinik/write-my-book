// core/prng.mjs — deterministic, seedable PRNG (W-F3 §3.2).
//
// Injection text and blind-pairing shuffles are generated from a recorded seed so
// a judge can REGENERATE the expected text / re-derive the pairing. mulberry32 is
// tiny, fast, and fully deterministic across platforms. Node built-ins only.

/** @param {number} seed 32-bit */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a 32-bit seed from a string (FNV-1a). */
export function seedFromString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fisher-Yates shuffle driven by a seeded PRNG (pure — returns a new array). */
export function shuffle(array, rng) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
