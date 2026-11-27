// The ground under every point of the coast: island heights from shaped noise, cliffs at the
// rocks, airstrips levelled into the hills, and what the surface is (runway, sand, grass, rock,
// forest or sea). Pure functions, so the flight model and the renderer agree on every metre.
import { WORLD_SEED } from './config.js';
import { AIRSTRIPS, ISLANDS, TOWN, runwayAt, runwayLocal } from './places.js';
import { fractalNoise, hashCell, lerp, smoothstep } from './random.js';

const SEA_FLOOR = -70;

function islandHeight(island, x, z) {
  const dx = (x - island.x) / island.rx;
  const dz = (z - island.z) / island.rz;
  let reach = Math.sqrt(dx * dx + dz * dz);
  if (reach > 2.4) return SEA_FLOOR;
  reach += (fractalNoise(x * 0.0011 + island.seed, z * 0.0011, WORLD_SEED + island.seed, 3) - 0.5) * 0.5;
  const land = 1 - reach;
  if (land <= 0) return Math.max(SEA_FLOOR, island.beach + land * island.shelf);
  const hills = fractalNoise(x * 0.0021, z * 0.0021, WORLD_SEED + 7 + island.seed, 4);
  let ridge = 1;
  if (island.northHills) ridge = 0.22 + 0.95 * smoothstep(1300, -700, z) + 0.35 * smoothstep(-200, 1600, x);
  let height = island.beach + Math.pow(land, 1.05) * island.peak * (0.3 + 1.0 * hills) * ridge;
  if (island.cliff) height += island.cliff * smoothstep(0.0, 0.07, land);
  return height;
}

/** Raw island height before the airstrips are levelled in. */
function naturalHeight(x, z) {
  let height = SEA_FLOOR;
  for (const island of ISLANDS) {
    const h = islandHeight(island, x, z);
    if (h > height) height = h;
  }
  return height;
}

/** Ground height in metres above sea level (negative under the sea) at (x, z). */
export function terrainHeight(x, z) {
  let height = naturalHeight(x, z);
  for (const strip of AIRSTRIPS) {
    const local = runwayLocal(strip, x, z);
    const outAlong = Math.max(0, Math.abs(local.along) - (strip.length / 2 + 140));
    const outAcross = Math.max(0, Math.abs(local.across) - (strip.width / 2 + 70));
    const distance = Math.hypot(outAlong, outAcross);
    if (distance < 280) height = lerp(height, strip.elev, 1 - smoothstep(0, 280, distance));
  }
  const townDistance = Math.hypot(x - TOWN.x, z - TOWN.z);
  if (townDistance < TOWN.radius && height > 0.5) {
    const terrace = 1 - smoothstep(TOWN.radius * 0.4, TOWN.radius, townDistance);
    height = lerp(height, Math.min(height, 4 + height * 0.35), terrace * 0.8);
  }
  return height;
}

/** Steepness (rise over run) of the ground at a point. */
export function terrainSlope(x, z) {
  const e = 6;
  const gx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const gz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

/** How thick the forest is at a point, 0 (open) to 1; trees grow where this passes 0.5. */
export function forestDensity(x, z) {
  const height = terrainHeight(x, z);
  if (height < 7 || height > 210) return 0;
  if (runwayAt(x, z, 160)) return 0;
  if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.radius * 0.9) return 0;
  const patch = fractalNoise(x * 0.0035, z * 0.0035, WORLD_SEED + 91, 3);
  return smoothstep(0.5, 0.64, patch) * (1 - smoothstep(150, 210, height));
}

/** Tallest tree in a forest, metres. */
export const TREE_HEIGHT = 13;

/**
 * Everything the aircraft needs about the ground below it: height, what the surface is, how
 * steep, and, on a runway, where along and across it the point lies.
 */
export function groundAt(x, z) {
  const height = terrainHeight(x, z);
  const runway = runwayAt(x, z, 4);
  if (runway) return { height: Math.max(height, runway.strip.elev), surface: 'runway', slope: 0, runway };
  if (height < 0.4) return { height: 0, surface: 'water', slope: 0, runway: null, depth: -height };
  const slope = terrainSlope(x, z);
  let surface = height < 3.5 ? 'sand' : slope > 0.45 ? 'rock' : 'grass';
  if (surface === 'grass' && forestDensity(x, z) > 0.5) surface = 'forest';
  return { height, surface, slope, runway: null };
}

/** A small seeded jitter used to scatter trees and houses off their grid. */
export function scatter(ix, iz, salt) {
  return hashCell(ix, iz, WORLD_SEED + salt * 977);
}
