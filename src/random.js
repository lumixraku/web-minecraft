// Mulberry32 — small, fast 32-bit PRNG. We share one global state across
// every generator so the whole world is deterministic for a given seed.
// Generators consume random() in a fixed order (set by world.js), so the
// produced terrain, trees, clouds and color noise all reproduce exactly.

let state = 1;

export function setSeed(seed) {
  state = (seed | 0) || 1;  // coerce to int + avoid 0 (degenerate state)
}

export function random() {
  state = (state + 0x6D2B79F5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Used when picking a brand-new seed (so seeds themselves are unpredictable).
export function newSeed() {
  return (Math.random() * 0x7fffffff) | 0;
}
