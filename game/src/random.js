// Seeded randomness for everything that must repeat exactly: a small 32-bit generator for
// gusts, lightning and placement, and smooth 2D value noise (with fractal sums) for terrain.

/** A generator of numbers in [0, 1) that gives the same sequence for the same seed. */
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mix = state;
    mix = Math.imul(mix ^ (mix >>> 15), mix | 1);
    mix ^= mix + Math.imul(mix ^ (mix >>> 7), mix | 61);
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  };
}

/** A repeatable hash of two integer cells and a seed, in [0, 1). */
export function hashCell(ix, iz, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [0, 1) at a point, one lattice cell per unit. */
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hashCell(ix, iz, seed);
  const b = hashCell(ix + 1, iz, seed);
  const c = hashCell(ix, iz + 1, seed);
  const d = hashCell(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Fractal value noise: `octaves` layers, each twice as fine and half as strong, in about [0, 1). */
export function fractalNoise(x, z, seed, octaves = 4) {
  let sum = 0;
  let weight = 0.5;
  let total = 0;
  let scale = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(x * scale, z * scale, seed + octave * 101) * weight;
    total += weight;
    weight *= 0.5;
    scale *= 2.03;
  }
  return sum / total;
}

/** Clamp, linear blend and smoothstep, used across the world code. */
export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
