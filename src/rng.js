// Deterministic randomness.
//
// Ported unchanged from nightcity, where it was the idea that worked best.
//
// Every building here is a recycled mesh: there are ~50 of them and they leap
// ahead of the camera forever. Nothing about a block is stored, so its identity
// has to be *derivable* -- height, window pattern and tint all come from
// hashing (lane, block index). Block 400 is always the same building as block
// 400, and a different one from block 12, without a single byte remembered.

/** FNV-1a over the string form of each part, with a separator between them. */
export function hash32(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x2f;                       // separator, so ('ab','c') != ('a','bc')
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for placement and jitter. */
export function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stream keyed by identity: rngFor(SEED, 'near', 12, 3). */
export function rngFor(...parts) {
  return mulberry32(hash32(...parts));
}

/** Uniform in [lo, hi). */
export function range(rand, lo, hi) {
  return lo + rand() * (hi - lo);
}

/** Positive modulo — tile indices go negative when you walk left of the origin. */
export function mod(n, m) {
  return ((n % m) + m) % m;
}
